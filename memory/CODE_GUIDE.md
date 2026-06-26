# NBS — Complete Code Guide for Freshers

> A friendly walk-through of the entire NBS (Nearby Social) codebase. Read top to bottom.

---

## 1. Big Picture: What is NBS?

**NBS** is a mobile-first web app where:
1. A user logs in with their phone number (OTP).
2. They turn on "I'm active" and set a radius (10m–10km).
3. They see other active users in that radius.
4. They send a friend request → if accepted, they can **chat in real-time**.

So the app is split into 3 layers:

```
┌──────────────────────────────────────────────────────────┐
│  FRONTEND  (React)        →   /app/frontend              │
│  • What the user sees & clicks                           │
├──────────────────────────────────────────────────────────┤
│  BACKEND   (FastAPI)      →   /app/backend/server.py     │
│  • Receives HTTP/WebSocket requests, talks to MongoDB    │
├──────────────────────────────────────────────────────────┤
│  DATABASE  (MongoDB)      →   collections                │
│  • Stores users, messages, requests, blocks, reports...  │
└──────────────────────────────────────────────────────────┘
```

The frontend NEVER talks to MongoDB directly — it always asks the backend via HTTP/WebSocket. The backend then reads/writes MongoDB.

---

## 2. Folder Structure

```
/app
├── backend/
│   ├── server.py            ← THE ENTIRE backend lives here (one file!)
│   ├── requirements.txt     ← Python packages
│   └── .env                 ← secrets: MongoDB URL, Twilio keys, JWT secret
│
├── frontend/
│   ├── package.json         ← Node packages
│   ├── public/index.html    ← The single HTML page (CRA loads React into <div id="root">)
│   └── src/
│       ├── index.js         ← React entrypoint (boots the app)
│       ├── App.js           ← All routes are defined here
│       ├── App.css          ← Global styles (fonts, colors, animations)
│       │
│       ├── pages/           ← One file per "screen"
│       │   ├── Login.js
│       │   ├── Home.js              ← the Discover screen (default home)
│       │   ├── ActiveUsers.js
│       │   ├── MapView.js
│       │   ├── Requests.js
│       │   ├── Friends.js
│       │   ├── Chat.js
│       │   ├── Profile.js
│       │   └── Support.js
│       │
│       ├── components/
│       │   ├── MobileShell.js       ← Bottom nav wrapper
│       │   ├── UserListItem.js      ← Reusable row (avatar + name + button)
│       │   └── ui/                  ← Shadcn components (Slider, Button, etc.)
│       │
│       ├── context/
│       │   └── AuthContext.js       ← Stores token & user globally; opens WebSocket
│       │
│       └── lib/
│           └── api.js               ← Axios client + WebSocket URL helper
│
└── memory/
    ├── PRD.md                       ← Product requirements
    ├── test_credentials.md          ← Mock OTP info
    └── CODE_GUIDE.md                ← (this file)
```

---

## 3. How the App Boots (start to first paint)

### Step-by-step on the frontend

```
1. Browser hits  https://your-app.com/
2. CRA serves    /app/frontend/public/index.html
3. index.html runs   /app/frontend/src/index.js
4. index.js  renders <App />        ← imports /src/App.js
5. App.js wraps everything in:
       <AuthProvider>      ← from /src/context/AuthContext.js
         <BrowserRouter>   ← from react-router-dom
           <Routes>
              <Route path="/login"  element={<Login />} />
              <Route path="/"       element={<Shell><Home /></Shell>} />
              ...more routes
           </Routes>
         </BrowserRouter>
       </AuthProvider>
6. <AuthProvider> checks localStorage for token "nbs_token"
       - If found → fetch /api/users/me → put user in context
       - If missing → token is null
7. <Protected> on protected routes redirects to /login if token is null
```

### So which page actually shows first?

| URL hit                  | What user sees                                       |
|--------------------------|------------------------------------------------------|
| `/`  with NO token       | Redirected to `/login` → renders `Login.js`          |
| `/`  with valid token    | Renders `Home.js` (the Discover screen)              |
| `/login` always          | Renders `Login.js`                                   |

**`Login.js` and `Home.js` are the two natural entry points** depending on whether the user is signed in.

---

## 4. The Login Flow (read this carefully — it's the heart)

### What the user does:
1. Opens app → sees Login screen
2. Types phone number → taps **Send OTP**
3. Receives OTP (in demo mode it's `123456`)
4. Types OTP → taps **Verify & Continue**
5. Lands on the Home (Discover) screen

### What happens behind the scenes (file-by-file):

```
USER TAPS "SEND OTP"
   └─ Login.js → sendOtp() function
        └─ api.post("/auth/send-otp", { phone })   ← from /src/lib/api.js
              │
              │ (HTTP POST)
              ▼
   /app/backend/server.py → @api_router.post("/auth/send-otp")
        ├─ Generates OTP (mock 123456, or random if Twilio is enabled)
        ├─ db.otps.update_one({phone}, {otp})        ← saved to MongoDB
        ├─ If Twilio enabled → sends real SMS
        └─ Returns { mock_otp: "123456" }            ← back to frontend

USER TAPS "VERIFY & CONTINUE"
   └─ Login.js → verifyOtp() function
        └─ api.post("/auth/verify-otp", { phone, otp })
              ▼
   server.py → @api_router.post("/auth/verify-otp")
        ├─ Checks db.otps for matching record
        ├─ If user doesn't exist → creates new user in db.users
        ├─ Creates a JWT token (signed with JWT_SECRET)
        └─ Returns { token, user }
              ▼
   Login.js → login(token, user)  in AuthContext
        ├─ Saves token to localStorage["nbs_token"]
        ├─ Sets user in state
        └─ Opens WebSocket connection to /api/ws/{token}
              ▼
   navigate("/")  →  React Router renders <Home />
```

---

## 5. MongoDB Collections — Where Data Lives

The database name is set by `DB_NAME` in `backend/.env`. All NBS data is split into these collections:

| Collection         | What it stores                                          | Created by                      |
|--------------------|---------------------------------------------------------|---------------------------------|
| `users`            | One doc per user (phone, name, location, going_to, etc.)| `/auth/verify-otp` on signup    |
| `otps`             | Latest OTP per phone (temp; overwritten each send)      | `/auth/send-otp`                |
| `friend_requests`  | { from_user_id, to_user_id, status: pending/accepted/rejected } | `/requests/send`        |
| `messages`         | { chat_key, from_user_id, to_user_id, text, created_at }| `/chat/send`                    |
| `blocks`           | { blocker_id, blocked_id }                              | `/block`                        |
| `reports`          | { reporter_id, reported_id, reason, status }            | `/report`                       |
| `support_tickets`  | { user_id, type, name, email, message }                 | `/support`                      |
| `files`            | { user_id, storage_path, content_type, size }           | `/users/me/avatar` upload       |

### Example: what a `users` document looks like
```json
{
  "id": "cda11e5b-093e-4d64-9c57-24bb61613559",
  "phone": "+15550004444",
  "name": "User4444",
  "email": null,
  "avatar": "/api/files/nbs/avatars/cda.../abc.png",
  "bio": null,
  "going_to": "Coffee at MG Road",
  "home_location": "Bengaluru, India",
  "is_active": true,
  "radius": 500,
  "location": { "lat": 12.9716, "lng": 77.5946 },
  "created_at": "2026-02-25T12:00:00+00:00"
}
```

> Note: we use the field `id` (a UUID we generate ourselves) — NOT Mongo's automatic `_id`. We always exclude `_id` from queries with `{"_id": 0}`.

---

## 6. The "Discover Nearby Users" Flow

When the user is on the Home page and toggles **availability** on:

```
USER TURNS ON "I'M ACTIVE"
   └─ Home.js → toggleActive()
        └─ POST /api/users/me/active   { is_active: true, radius: 500 }
              ▼
   server.py → updates db.users → { is_active: true, radius: 500 }

USER MOVES THE RADIUS SLIDER
   └─ Home.js → onRadiusCommit()  → POST /api/users/me/active

NOW HOME.js CALLS /api/users/nearby (this runs whenever toggle/radius/coords change)
   └─ GET /api/users/nearby
        ▼
   server.py → @api_router.get("/users/nearby")
        ├─ Reads my user doc from db.users
        ├─ Reads my blocked set from db.blocks
        ├─ Queries db.users.find({ is_active: true, id != me, id not in blocked })
        ├─ For each candidate → computes haversine distance (in meters)
        ├─ Keeps only users with distance ≤ my radius
        ├─ Sorts ascending by distance
        └─ Returns { users: [...] }
              ▼
   Home.js → setUsers(...) → renders <UserListItem> for each
```

---

## 7. The Friend Request → Chat Flow

```
USER A taps "Send Request" on USER B
   └─ POST /api/requests/send  { to_user_id: B.id }
        ▼
   server.py:
     • Inserts { from: A, to: B, status: pending } into db.friend_requests
     • Calls manager.send_to(B, {type: "new_request"}) over WebSocket  ← real-time push!

USER B sees badge "1" on Requests tab (MobileShell.js listens to WebSocket)
   └─ Taps Requests → /api/requests/incoming → renders list with Accept/Reject

USER B taps "Accept"
   └─ POST /api/requests/respond  { request_id, accept: true }
        ▼
   server.py:
     • Updates friend_requests.status = "accepted"
     • WebSocket → notifies USER A   ({type:"request_response", status:"accepted"})

NOW THEY CAN CHAT
   USER A → /chat/{B.id} → Chat.js
     • GET /api/chat/{B.id}/messages → loads history from db.messages
     • POST /api/chat/send → server stores message in db.messages
                              + pushes via WebSocket to whoever's the recipient
```

### `chat_key` — how we identify a 1-on-1 conversation
We sort both user IDs alphabetically and join with `|`:
```python
chat_key = "|".join(sorted([user_a_id, user_b_id]))
```
So both users always see the same `chat_key`, and `db.messages.find({chat_key})` returns the whole conversation regardless of who started it.

---

## 8. The WebSocket (Real-Time Layer)

### Where it lives
- **Backend**: `/api/ws/{token}` in `server.py` (a `ConnectionManager` class holds a dict of `user_id → WebSocket`).
- **Frontend**: opened by `AuthContext.js` right after login. Auto-reconnects every 2.5 seconds if dropped.

### Three event types we send
| `type`                | When                                  | Recipient action                     |
|-----------------------|---------------------------------------|--------------------------------------|
| `new_request`         | Someone sent you a friend request     | Requests page refreshes; badge ++    |
| `request_response`    | Your request was accepted/rejected    | Toast notification                   |
| `new_message`         | Someone in chat sent you a message    | Chat page appends bubble in real-time|

### How a component listens
```js
const { subscribe } = useAuth();
useEffect(() => subscribe((evt) => {
  if (evt.type === "new_message") { /* append to chat */ }
}), [subscribe]);
```

---

## 9. Page-by-Page Cheat Sheet

| Page         | URL              | What it does                                              | Calls these endpoints                                     |
|--------------|------------------|-----------------------------------------------------------|-----------------------------------------------------------|
| `Login`      | `/login`         | Phone → OTP → token                                       | `/auth/send-otp`, `/auth/verify-otp`                      |
| `Home`       | `/`              | Toggle active, set radius, see nearby                     | `/users/me/active`, `/users/me/location`, `/users/nearby` |
| `ActiveUsers`| `/active`        | All online users (no radius limit)                        | `/users/active`                                           |
| `MapView`    | `/map`           | Leaflet map with you + active users + radius circle       | `/users/active`                                           |
| `Requests`   | `/requests`      | Accept/reject incoming                                    | `/requests/incoming`, `/requests/respond`                 |
| `Friends`    | `/friends`       | List of accepted connections                              | `/requests/friends`                                       |
| `Chat`       | `/chat/:userId`  | 1-on-1 messages + WebSocket live updates                  | `/chat/{id}/messages`, `/chat/send`                       |
| `Profile`    | `/profile`       | Edit name/email/bio/going_to/home_location + photo upload + blocks + logout | `/users/me`, `/users/me/avatar`, `/block/list`, `/unblock` |
| `Support`    | `/support`       | Submit Support / Contact / Idea ticket                    | `/support`                                                |

---

## 10. Auth — How Token + Protected Routes Work

```
1. After verify-otp, frontend stores JWT in localStorage["nbs_token"]

2. /app/frontend/src/lib/api.js sets up axios with an interceptor:
       config.headers.Authorization = `Bearer ${token}`
   This means EVERY request automatically carries the token.

3. /app/frontend/src/App.js wraps protected routes in <Protected>:
       if (!token) → <Navigate to="/login" />

4. Backend (server.py) — every endpoint that needs auth has:
       async def my_endpoint(user = Depends(get_current_user)):
   The dependency decodes the JWT and loads the user from db.users.
   If missing/invalid → returns 401.
```

---

## 11. Environment Variables (the secrets you must not commit)

Located in `/app/backend/.env`:

| Var                   | Purpose                                                       |
|-----------------------|---------------------------------------------------------------|
| `MONGO_URL`           | MongoDB connection string                                     |
| `DB_NAME`             | Mongo database name                                           |
| `JWT_SECRET`          | Used to sign/verify JWTs (CHANGE in production!)              |
| `EMERGENT_LLM_KEY`    | Used for Emergent object storage (profile photos)             |
| `TWILIO_ACCOUNT_SID`  | If empty → mock OTP. If filled → real SMS                     |
| `TWILIO_AUTH_TOKEN`   | (same)                                                        |
| `TWILIO_FROM_NUMBER`  | The Twilio sender phone number                                |
| `CORS_ORIGINS`        | Allowed origins for CORS                                      |

Frontend `/app/frontend/.env`:

| Var                     | Purpose                                                       |
|-------------------------|---------------------------------------------------------------|
| `REACT_APP_BACKEND_URL` | Where the frontend sends API calls (used by `lib/api.js`)     |

---

## 12. A Tiny Walk-Through: "User A messages User B"

Imagine they are already friends. Here is the full path of one message:

```
1.  User A types "hi" in /app/frontend/src/pages/Chat.js
2.  Hits Enter → calls send()
3.  api.post("/chat/send", { to_user_id: B, text: "hi" })
4.  Axios attaches  Authorization: Bearer <JWT>
5.  Backend FastAPI route /api/chat/send fires:
       a. get_current_user decodes JWT → loads User A from db.users
       b. Checks are_friends(A, B) in db.friend_requests
       c. Builds chat_key = sorted([A,B]) joined by "|"
       d. Inserts {id, chat_key, from_user_id: A, to_user_id: B, text, created_at} into db.messages
       e. manager.send_to(B, {type: "new_message", message: {...}})
6.  Response goes back to A's browser with the message object
7.  Chat.js appends it to its local messages array → bubble appears on the right
8.  Meanwhile B's browser:
       a. AuthContext.js's WebSocket fires onmessage
       b. Listener in Chat.js checks if the message belongs to this conversation
       c. Calls setMessages(prev => [...prev, msg]) → bubble appears on B's left
```

That's the whole loop. Same pattern for friend requests and accept events.

---

## 13. Common Patterns Used in the Code

### Pattern: "Fetch on mount"
```js
useEffect(() => {
  (async () => {
    const { data } = await api.get("/endpoint");
    setState(data.something);
  })();
}, []);
```

### Pattern: "Action button with loading state"
```js
const [loading, setLoading] = useState(false);
const doThing = async () => {
  setLoading(true);
  try { await api.post(...); toast.success("ok"); }
  catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  finally { setLoading(false); }
};
```

### Pattern: "WebSocket listener inside a page"
```js
const { subscribe } = useAuth();
useEffect(() => subscribe((evt) => {
  if (evt.type === "new_message") setMessages(m => [...m, evt.message]);
}), [subscribe]);
```

### Pattern: "Backend route that needs auth"
```python
@api_router.get("/some/path")
async def some_endpoint(user = Depends(get_current_user)):
    # user is already the full user document
    docs = await db.collection.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return {"items": docs}
```

---

## 14. How to Run Locally (Quick Start)

The platform runs everything for you via Supervisor. If you ever need to restart:

```bash
sudo supervisorctl restart backend   # after .env or requirements.txt change
sudo supervisorctl restart frontend  # rarely needed; hot reload handles JS changes
```

To check backend logs:
```bash
tail -n 50 /var/log/supervisor/backend.err.log
```

To call an API directly:
```bash
# Get OTP
curl -X POST https://your-app/api/auth/send-otp \
     -H "Content-Type: application/json" \
     -d '{"phone":"+15550001234"}'

# Verify and get token
curl -X POST https://your-app/api/auth/verify-otp \
     -H "Content-Type: application/json" \
     -d '{"phone":"+15550001234","otp":"123456"}'
```

---

## 15. Glossary

| Term                | Meaning                                                                 |
|---------------------|-------------------------------------------------------------------------|
| **JWT**             | JSON Web Token — a signed string proving who you are                    |
| **WebSocket**       | A 2-way always-open connection for real-time push                       |
| **CORS**            | Browser rule that controls which frontend URLs can call this backend    |
| **Supervisor**      | Linux process manager that auto-starts backend and frontend             |
| **Mongo collection**| Like a SQL table — a group of similar documents                         |
| **Haversine**       | Math formula to compute distance between two GPS points on a sphere    |
| **Hot reload**      | Saving a JS file → browser auto-refreshes without you doing anything    |

---

## 16. The 30-Second Recap

> When you open NBS, **`index.js → App.js`** decide which page to show. If you don't have a token, you go to **`Login.js`**, which calls **`/api/auth/*`** to get one. With a token, you land on **`Home.js`** — it sends your GPS to **`/api/users/me/location`**, marks you active via **`/api/users/me/active`**, and shows nearby users from **`/api/users/nearby`**. Everything you see on screen lives in MongoDB (in the `users`, `friend_requests`, `messages`, `blocks`, `reports`, `support_tickets`, `files`, `otps` collections). Real-time chat & request notifications travel over a **WebSocket** opened in `AuthContext.js`.

Welcome to the codebase! 🎉
