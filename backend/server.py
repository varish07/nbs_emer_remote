from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, UploadFile, File, Response, Query, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import random
import json
import jwt
import requests
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'nbs-dev-secret-change-me')
JWT_ALG = 'HS256'

# Twilio (graceful fallback to mock when missing)
TWILIO_SID = os.environ.get('TWILIO_ACCOUNT_SID', '').strip()
TWILIO_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '').strip()
TWILIO_FROM = os.environ.get('TWILIO_FROM_NUMBER', '').strip()
TWILIO_ENABLED = bool(TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM)

ADMIN_PHONES = {p.strip() for p in os.environ.get('ADMIN_PHONES', '').split(',') if p.strip()}

def is_admin(user: dict) -> bool:
    return user.get('phone', '') in ADMIN_PHONES

# Emergent Object Storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "").strip()
APP_NAME = "nbs"
storage_key: Optional[str] = None

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============= Models =============

class SendOtpRequest(BaseModel):
    phone: str

class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    avatar: Optional[str] = None
    bio: Optional[str] = None
    going_to: Optional[str] = None
    home_location: Optional[str] = None

class UpdateLocationRequest(BaseModel):
    lat: float
    lng: float

class SetActiveRequest(BaseModel):
    is_active: bool
    radius: Optional[int] = None

class FriendRequestCreate(BaseModel):
    to_user_id: str

class FriendRequestRespond(BaseModel):
    request_id: str
    accept: bool

class MessageCreate(BaseModel):
    to_user_id: str
    text: str

class SupportRequest(BaseModel):
    type: str
    name: Optional[str] = None
    email: Optional[str] = None
    message: str

class BlockRequest(BaseModel):
    user_id: str

class ReportRequest(BaseModel):
    user_id: str
    reason: str
    details: Optional[str] = None


# ============= Helpers =============

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def create_token(user_id: str) -> str:
    payload = {'user_id': user_id, 'exp': datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing auth token")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get('user_id')
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("is_banned"):
        raise HTTPException(status_code=403, detail="Account suspended")
    return user

def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000.0
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dp = math.radians(lat2-lat1); dl = math.radians(lng2-lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(a))

def public_user(u: dict) -> dict:
    return {
        "id": u.get("id"),
        "name": u.get("name") or "User",
        "phone": u.get("phone"),
        "avatar": u.get("avatar"),
        "bio": u.get("bio"),
        "going_to": u.get("going_to"),
        "home_location": u.get("home_location"),
        "is_active": u.get("is_active", False),
        "location": u.get("location"),
    }

async def get_blocked_ids(user_id: str) -> set:
    """Returns IDs blocked by user OR who blocked user (mutual hide)."""
    out = set()
    async for b in db.blocks.find({"blocker_id": user_id}, {"_id": 0, "blocked_id": 1}):
        out.add(b["blocked_id"])
    async for b in db.blocks.find({"blocked_id": user_id}, {"_id": 0, "blocker_id": 1}):
        out.add(b["blocker_id"])
    return out


# ============= Object Storage =============

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY not set; storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        storage_key = None
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    global storage_key
    last_err = None
    for attempt in range(3):
        key = init_storage()
        if not key:
            raise HTTPException(status_code=503, detail="Storage unavailable")
        try:
            resp = requests.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key, "Content-Type": content_type},
                data=data, timeout=120
            )
            if resp.status_code == 403:
                storage_key = None  # force re-init
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.HTTPError as e:
            last_err = e
            if e.response is not None and e.response.status_code in (500, 502, 503, 429):
                storage_key = None
                continue
            raise
        except requests.exceptions.RequestException as e:
            last_err = e
            continue
    logger.error(f"put_object failed after retries: {last_err}")
    raise HTTPException(status_code=502, detail="Object storage upload failed, please try again")

def get_object(path: str):
    global storage_key
    for attempt in range(3):
        key = init_storage()
        if not key:
            raise HTTPException(status_code=503, detail="Storage unavailable")
        try:
            resp = requests.get(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key}, timeout=60
            )
            if resp.status_code == 403:
                storage_key = None
                continue
            resp.raise_for_status()
            return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
        except requests.exceptions.RequestException:
            storage_key = None
            continue
    raise HTTPException(status_code=502, detail="Object storage fetch failed")


# ============= Twilio =============

def send_sms_otp(phone: str, otp: str) -> bool:
    if not TWILIO_ENABLED:
        return False
    try:
        from twilio.rest import Client as TwilioClient
        c = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        c.messages.create(
            body=f"Your NBS verification code is: {otp}. Valid for 10 minutes.",
            from_=TWILIO_FROM,
            to=phone
        )
        return True
    except Exception as e:
        logger.error(f"Twilio send failed: {e}")
        return False


# ============= WebSocket Manager =============

class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)

    async def send_to(self, user_id: str, data: dict):
        ws = self.active.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                pass

manager = ConnectionManager()


# ============= Auth Routes =============

@api_router.post("/auth/send-otp")
async def send_otp(req: SendOtpRequest):
    phone = req.phone.strip()
    if len(phone) < 6:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    if TWILIO_ENABLED:
        otp = f"{random.randint(0, 999999):06d}"
    else:
        otp = "123456"

    await db.otps.update_one(
        {"phone": phone},
        {"$set": {"phone": phone, "otp": otp, "created_at": now_iso()}},
        upsert=True
    )

    if TWILIO_ENABLED:
        sent = send_sms_otp(phone, otp)
        if not sent:
            raise HTTPException(status_code=502, detail="Failed to send OTP via SMS")
        return {"success": True, "message": "OTP sent via SMS", "mock": False}
    else:
        logger.info(f"[MOCK OTP] phone={phone} otp={otp}")
        return {"success": True, "message": "OTP sent (mock). Use 123456 to verify.", "mock_otp": otp, "mock": True}

@api_router.post("/auth/verify-otp")
async def verify_otp(req: VerifyOtpRequest):
    phone = req.phone.strip()
    rec = await db.otps.find_one({"phone": phone}, {"_id": 0})
    if not TWILIO_ENABLED and req.otp == "123456":
        pass
    elif not rec or rec.get("otp") != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "phone": phone,
            "name": f"User{phone[-4:]}",
            "email": None,
            "avatar": None,
            "bio": None,
            "is_active": False,
            "radius": 100,
            "location": None,
            "created_at": now_iso(),
        }
        await db.users.insert_one(user.copy())
    token = create_token(user["id"])
    user.pop("_id", None)
    return {"token": token, "user": public_user(user)}


# ============= User Routes =============

@api_router.get("/users/me")
async def get_me(user=Depends(get_current_user)):
    user.pop("_id", None)
    return {**public_user(user), "email": user.get("email"), "radius": user.get("radius", 100), "is_admin": is_admin(user), "home_location": user.get("home_location")}

@api_router.put("/users/me")
async def update_me(req: UpdateProfileRequest, user=Depends(get_current_user)):
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {**public_user(u), "email": u.get("email"), "radius": u.get("radius", 100)}

@api_router.post("/users/me/avatar")
async def upload_avatar(file: UploadFile = File(...), user=Depends(get_current_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB)")
    ext = (file.filename.split(".")[-1] if "." in (file.filename or "") else "jpg").lower()
    path = f"{APP_NAME}/avatars/{user['id']}/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, file.content_type)
    public_path = result["path"]
    backend_url = os.environ.get("BACKEND_PUBLIC_URL", "")
    url = f"/api/files/{public_path}"
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar": url}})
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "storage_path": public_path,
        "content_type": file.content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": now_iso(),
    })
    return {"success": True, "avatar": url}

@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type))

@api_router.post("/users/me/location")
async def update_location(req: UpdateLocationRequest, user=Depends(get_current_user)):
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"location": {"lat": req.lat, "lng": req.lng}, "location_updated_at": now_iso()}}
    )
    return {"success": True}

@api_router.post("/users/me/active")
async def set_active(req: SetActiveRequest, user=Depends(get_current_user)):
    update = {"is_active": req.is_active}
    if req.radius is not None:
        update["radius"] = max(10, min(10000, int(req.radius)))
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"success": True, **update}

@api_router.get("/users/nearby")
async def get_nearby(user=Depends(get_current_user)):
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not me or not me.get("location"):
        return {"users": [], "message": "Set your location first"}
    radius = me.get("radius", 100)
    my_loc = me["location"]
    blocked = await get_blocked_ids(user["id"])

    cursor = db.users.find({
        "id": {"$ne": me["id"], "$nin": list(blocked)},
        "is_active": True,
        "location": {"$ne": None}
    }, {"_id": 0})

    nearby = []
    async for u in cursor:
        loc = u.get("location")
        if not loc:
            continue
        d = haversine_m(my_loc["lat"], my_loc["lng"], loc["lat"], loc["lng"])
        if d <= radius:
            nearby.append({**public_user(u), "distance_m": round(d, 1)})
    nearby.sort(key=lambda x: x["distance_m"])
    return {"users": nearby, "my_radius": radius}

@api_router.get("/users/active")
async def get_all_active(user=Depends(get_current_user)):
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    blocked = await get_blocked_ids(user["id"])
    my_loc = me.get("location") if me else None

    cursor = db.users.find({
        "id": {"$ne": user["id"], "$nin": list(blocked)},
        "is_active": True
    }, {"_id": 0})

    out = []
    async for u in cursor:
        item = public_user(u)
        if my_loc and u.get("location"):
            item["distance_m"] = round(haversine_m(my_loc["lat"], my_loc["lng"], u["location"]["lat"], u["location"]["lng"]), 1)
        else:
            item["distance_m"] = None
        out.append(item)
    out.sort(key=lambda x: (x["distance_m"] is None, x["distance_m"] or 0))
    return {"users": out, "total": len(out)}


# ============= Friend Requests =============

@api_router.post("/requests/send")
async def send_request(req: FriendRequestCreate, user=Depends(get_current_user)):
    if req.to_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot send to yourself")
    blocked = await get_blocked_ids(user["id"])
    if req.to_user_id in blocked:
        raise HTTPException(status_code=403, detail="Cannot send to a blocked user")
    target = await db.users.find_one({"id": req.to_user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await db.friend_requests.find_one({
        "from_user_id": user["id"],
        "to_user_id": req.to_user_id,
        "status": {"$in": ["pending", "accepted"]}
    })
    if existing:
        return {"success": True, "message": "Already sent", "status": existing.get("status")}
    reverse = await db.friend_requests.find_one({
        "from_user_id": req.to_user_id,
        "to_user_id": user["id"],
        "status": "pending"
    })
    if reverse:
        await db.friend_requests.update_one({"id": reverse["id"]}, {"$set": {"status": "accepted", "responded_at": now_iso()}})
        return {"success": True, "status": "accepted", "auto_matched": True}
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "from_user_id": user["id"],
        "to_user_id": req.to_user_id,
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.friend_requests.insert_one(doc.copy())
    await manager.send_to(req.to_user_id, {"type": "new_request", "from": public_user(user)})
    return {"success": True, "status": "pending", "request_id": rid}

@api_router.get("/requests/incoming")
async def incoming_requests(user=Depends(get_current_user)):
    blocked = await get_blocked_ids(user["id"])
    cursor = db.friend_requests.find({"to_user_id": user["id"], "status": "pending"}, {"_id": 0})
    out = []
    async for r in cursor:
        if r["from_user_id"] in blocked:
            continue
        sender = await db.users.find_one({"id": r["from_user_id"]}, {"_id": 0})
        if sender:
            out.append({"request_id": r["id"], "from": public_user(sender), "created_at": r["created_at"]})
    return {"requests": out}

@api_router.get("/requests/friends")
async def list_friends(user=Depends(get_current_user)):
    blocked = await get_blocked_ids(user["id"])
    cursor = db.friend_requests.find({
        "$or": [
            {"from_user_id": user["id"]},
            {"to_user_id": user["id"]},
        ],
        "status": "accepted"
    }, {"_id": 0})
    friend_ids = set()
    async for r in cursor:
        other = r["to_user_id"] if r["from_user_id"] == user["id"] else r["from_user_id"]
        if other not in blocked:
            friend_ids.add(other)
    friends = []
    for fid in friend_ids:
        u = await db.users.find_one({"id": fid}, {"_id": 0})
        if u:
            friends.append(public_user(u))
    return {"friends": friends}

@api_router.post("/requests/respond")
async def respond_request(req: FriendRequestRespond, user=Depends(get_current_user)):
    r = await db.friend_requests.find_one({"id": req.request_id}, {"_id": 0})
    if not r or r["to_user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Request not found")
    new_status = "accepted" if req.accept else "rejected"
    await db.friend_requests.update_one({"id": req.request_id}, {"$set": {"status": new_status, "responded_at": now_iso()}})
    await manager.send_to(r["from_user_id"], {"type": "request_response", "status": new_status, "from_user_id": user["id"]})
    return {"success": True, "status": new_status}


@api_router.post("/requests/cancel")
async def cancel_request(req: FriendRequestCreate, user=Depends(get_current_user)):
    res = await db.friend_requests.delete_one({
        "from_user_id": user["id"],
        "to_user_id": req.to_user_id,
        "status": "pending"
    })
    return {"success": True, "cancelled": res.deleted_count > 0}


# ============= Chat =============

async def are_friends(a: str, b: str) -> bool:
    r = await db.friend_requests.find_one({
        "status": "accepted",
        "$or": [
            {"from_user_id": a, "to_user_id": b},
            {"from_user_id": b, "to_user_id": a},
        ]
    })
    return bool(r)

def chat_key(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))

@api_router.get("/chat/{other_id}/messages")
async def get_messages(other_id: str, user=Depends(get_current_user)):
    if not await are_friends(user["id"], other_id):
        raise HTTPException(status_code=403, detail="Not connected with this user")
    blocked = await get_blocked_ids(user["id"])
    if other_id in blocked:
        raise HTTPException(status_code=403, detail="User blocked")
    ck = chat_key(user["id"], other_id)
    cursor = db.messages.find({"chat_key": ck}, {"_id": 0}).sort("created_at", 1)
    msgs = await cursor.to_list(1000)
    return {"messages": msgs}

@api_router.post("/chat/send")
async def send_message(req: MessageCreate, user=Depends(get_current_user)):
    if not await are_friends(user["id"], req.to_user_id):
        raise HTTPException(status_code=403, detail="Not connected with this user")
    blocked = await get_blocked_ids(user["id"])
    if req.to_user_id in blocked:
        raise HTTPException(status_code=403, detail="User blocked")
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty message")
    msg = {
        "id": str(uuid.uuid4()),
        "chat_key": chat_key(user["id"], req.to_user_id),
        "from_user_id": user["id"],
        "to_user_id": req.to_user_id,
        "text": req.text.strip(),
        "created_at": now_iso(),
    }
    await db.messages.insert_one(msg.copy())
    msg.pop("_id", None)
    await manager.send_to(req.to_user_id, {"type": "new_message", "message": msg})
    return {"success": True, "message": msg}


# ============= Block / Report =============

@api_router.post("/block")
async def block_user(req: BlockRequest, user=Depends(get_current_user)):
    if req.user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    existing = await db.blocks.find_one({"blocker_id": user["id"], "blocked_id": req.user_id})
    if existing:
        return {"success": True, "already_blocked": True}
    await db.blocks.insert_one({
        "id": str(uuid.uuid4()),
        "blocker_id": user["id"],
        "blocked_id": req.user_id,
        "created_at": now_iso(),
    })
    return {"success": True}

@api_router.post("/unblock")
async def unblock_user(req: BlockRequest, user=Depends(get_current_user)):
    await db.blocks.delete_one({"blocker_id": user["id"], "blocked_id": req.user_id})
    return {"success": True}

@api_router.get("/block/list")
async def list_blocked(user=Depends(get_current_user)):
    out = []
    async for b in db.blocks.find({"blocker_id": user["id"]}, {"_id": 0}):
        u = await db.users.find_one({"id": b["blocked_id"]}, {"_id": 0})
        if u:
            out.append(public_user(u))
    return {"blocked": out}

@api_router.post("/report")
async def report_user(req: ReportRequest, user=Depends(get_current_user)):
    if req.user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot report yourself")
    doc = {
        "id": str(uuid.uuid4()),
        "reporter_id": user["id"],
        "reported_id": req.user_id,
        "reason": req.reason,
        "details": req.details,
        "status": "open",
        "created_at": now_iso(),
    }
    await db.reports.insert_one(doc.copy())
    return {"success": True, "report_id": doc["id"]}


# ============= Match by Intent =============

@api_router.get("/users/matches")
async def get_matches(user=Depends(get_current_user)):
    """Find active users whose going_to overlaps with mine (word-level)."""
    me = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    my_going = (me.get("going_to") or "").lower().strip()
    if not my_going:
        return {"matches": [], "message": "Set 'Where are you headed' to see matches"}
    my_words = {w for w in my_going.split() if len(w) > 2}
    if not my_words:
        return {"matches": []}
    blocked = await get_blocked_ids(user["id"])
    out = []
    async for u in db.users.find({"id": {"$ne": user["id"], "$nin": list(blocked)}, "is_active": True}, {"_id": 0}):
        their_going = (u.get("going_to") or "").lower().strip()
        if not their_going:
            continue
        their_words = {w for w in their_going.split() if len(w) > 2}
        overlap = my_words & their_words
        if overlap:
            item = public_user(u)
            item["match_score"] = len(overlap)
            item["matched_on"] = list(overlap)
            if me.get("location") and u.get("location"):
                item["distance_m"] = round(haversine_m(me["location"]["lat"], me["location"]["lng"], u["location"]["lat"], u["location"]["lng"]), 1)
            out.append(item)
    out.sort(key=lambda x: (-x["match_score"], x.get("distance_m") or 1e9))
    return {"matches": out}


# ============= Admin =============

async def require_admin(user=Depends(get_current_user)):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    return user

@api_router.get("/admin/reports")
async def admin_list_reports(status: Optional[str] = None, user=Depends(require_admin)):
    q = {}
    if status:
        q["status"] = status
    out = []
    async for r in db.reports.find(q, {"_id": 0}).sort("created_at", -1).limit(200):
        reporter = await db.users.find_one({"id": r["reporter_id"]}, {"_id": 0})
        reported = await db.users.find_one({"id": r["reported_id"]}, {"_id": 0})
        out.append({
            **r,
            "reporter": public_user(reporter) if reporter else None,
            "reported": public_user(reported) if reported else None,
        })
    return {"reports": out}

@api_router.post("/admin/reports/{report_id}/resolve")
async def admin_resolve_report(report_id: str, action: str = "dismissed", user=Depends(require_admin)):
    res = await db.reports.update_one({"id": report_id}, {"$set": {"status": action, "resolved_at": now_iso(), "resolved_by": user["id"]}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"success": True}

@api_router.get("/admin/stats")
async def admin_stats(user=Depends(require_admin)):
    users_total = await db.users.count_documents({})
    users_active = await db.users.count_documents({"is_active": True})
    reports_open = await db.reports.count_documents({"status": "open"})
    messages = await db.messages.count_documents({})
    blocks = await db.blocks.count_documents({})
    return {"users_total": users_total, "users_active": users_active, "reports_open": reports_open, "messages": messages, "blocks": blocks}

@api_router.get("/admin/users")
async def admin_list_users(q: Optional[str] = None, user=Depends(require_admin)):
    flt = {}
    if q:
        flt = {"$or": [{"name": {"$regex": q, "$options": "i"}}, {"phone": {"$regex": q, "$options": "i"}}]}
    out = []
    async for u in db.users.find(flt, {"_id": 0}).sort("created_at", -1).limit(200):
        item = public_user(u)
        item["is_banned"] = bool(u.get("is_banned"))
        item["created_at"] = u.get("created_at")
        out.append(item)
    return {"users": out}

@api_router.post("/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: str, banned: bool = True, user=Depends(require_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"is_banned": banned, "is_active": False if banned else None}})
    return {"success": True, "is_banned": banned}


# ============= Support =============

@api_router.post("/support")
async def submit_support(req: SupportRequest, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": req.type,
        "name": req.name,
        "email": req.email,
        "message": req.message,
        "created_at": now_iso(),
    }
    await db.support_tickets.insert_one(doc.copy())
    return {"success": True, "ticket_id": doc["id"]}


# ============= WebSocket =============

@app.websocket("/api/ws/{token}")
async def ws_endpoint(websocket: WebSocket, token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get('user_id')
    except Exception:
        await websocket.close(code=4401)
        return
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(user_id)


@api_router.get("/")
async def root():
    return {"message": "NBS API", "version": "2.0", "twilio": TWILIO_ENABLED}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_storage()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
