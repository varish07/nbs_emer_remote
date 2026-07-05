# NBS — Developer Documentation

**Application:** NBS (Nearby Network Social) — a mobile-first discovery + chat app that lets people activate themselves within a radius, find nearby users, send friend requests, and chat in real time.

**Live preview:** https://zip-inspector-16.preview.emergentagent.com

---

## 1 · Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 (CRA + craco), Tailwind CSS, shadcn/ui, framer-motion, Leaflet (maps), Axios, Sonner (toasts), React Router v6 |
| Backend | Python 3 + FastAPI, Uvicorn (async), Motor (async MongoDB driver), PyJWT, Twilio SDK, `emergentintegrations` (object storage) |
| Data | MongoDB (local `test_database` or MongoDB Atlas), Redis (cache) |
| Auth | Phone OTP (Twilio SMS) + Google Sign-In (Emergent-managed OAuth) — both issue the same JWT |
| Realtime | WebSocket (`/api/ws/{token}`) — friend requests, chat, request-response push |
| Storage | Emergent Object Storage for avatars (falls back to inline URL if `EMERGENT_LLM_KEY` not set) |
| Process manager | supervisor (backend on `:8001`, frontend on `:3000`, mongodb, redis) |

---

## 2 · Repository Layout

```
/app
├── backend/
│   ├── server.py           ← Single-file FastAPI app (all routes, models, DB helpers, WebSocket)
│   ├── requirements.txt
│   └── .env                ← MONGO_URL, DB_NAME, JWT_SECRET, TWILIO_*, ADMIN_PHONES, REDIS_URL
├── frontend/
│   ├── package.json
│   ├── .env                ← REACT_APP_BACKEND_URL (public preview URL)
│   └── src/
│       ├── App.js          ← Router + Auth-protected route wrapper
│       ├── index.js        ← ReactDOM entry
│       ├── App.css / index.css
│       ├── context/
│       │   └── AuthContext.js       ← JWT persistence + WebSocket connection + auth API calls
│       ├── lib/
│       │   ├── api.js               ← Axios instance with bearer token + wsUrl()
│       │   └── utils.js
│       ├── components/
│       │   ├── MobileShell.js       ← Bottom nav + requests badge
│       │   └── UserListItem.js      ← Common user row card
│       └── pages/
│           ├── Login.js             ← Phone OTP + Google button
│           ├── AuthCallback.js      ← Handles OAuth session_id return
│           ├── Home.js              ← Discover feed (nearby users, availability, radius)
│           ├── ActiveUsers.js       ← Active + My Friends tabs
│           ├── MapView.js           ← Leaflet map of active users in radius
│           ├── Requests.js          ← Incoming friend requests
│           ├── Friends.js           ← Legacy standalone friends list (route still valid)
│           ├── Chat.js              ← 1-to-1 chat with WebSocket + REST fallback
│           ├── Profile.js           ← Edit profile, blocked list, data export, delete account
│           ├── Support.js           ← Contact / bug / idea form
│           └── Admin.js             ← 5 tabs: Reports, Users, Messages, Blocks, Support
├── auth_testing.md
└── DOCS.md                 ← This file
```

---

## 3 · How Frontend Calls Backend — the Contract

**Every API call flows through one place:**
```js
// /app/frontend/src/lib/api.js
import axios from "axios";
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;
export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("nbs_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function wsUrl(token) { … }  // builds ws:// or wss:// URL
```

Result:
- Every component imports `{ api }` and calls `api.get(...)`, `api.post(...)`, etc.
- The `/api` prefix is required (Kubernetes ingress routes `/api/*` to backend `:8001`, everything else to frontend `:3000`).
- The JWT stored in `localStorage["nbs_token"]` is automatically attached to every request.
- WebSocket URLs are built via `wsUrl(token)`; the token is passed as a URL path segment (`/api/ws/{token}`) so it works with the Kubernetes ingress.

---

## 4 · Complete API Reference (backend `/app/backend/server.py`)

### 4.1 Auth
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/send-otp` | Rate-limited (3/phone/10min, 10/IP/10min). Generates cryptographic OTP, stores in `otps` with 10-min TTL, sends via Twilio | No |
| POST | `/api/auth/verify-otp` | Consumes OTP (attempt lockout after 5 wrong), creates or updates `users` doc, returns `{token, user}` | No |
| POST | `/api/auth/google/exchange` | Exchanges an Emergent OAuth `session_id` for a JWT. Upserts user by email. | No |

### 4.2 Profile & Me
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/users/me` | Returns full self profile (includes exact location) | Bearer |
| PUT | `/api/users/me` | Update name / email / avatar / bio / going_to / home_location (all length-capped) | Bearer |
| POST | `/api/users/me/avatar` | Upload avatar image ≤ 5 MB to Emergent Object Storage; stored path served via `/api/files/{path}` | Bearer |
| POST | `/api/users/me/location` | Update lat/lng (server-validated -90..90 / -180..180) | Bearer |
| POST | `/api/users/me/active` | Toggle `is_active` and set radius (10–10 000 m) | Bearer |
| GET | `/api/users/me/export` | JSON dump of ALL data for the caller (GDPR/DPDPA compliant) | Bearer |
| DELETE | `/api/users/me` | Permanently delete self + all related data (messages, blocks, friend_requests…) | Bearer |
| GET | `/api/files/{path}` | Serves stored avatar/uploaded file (checks `files` collection for validity + `is_deleted`) | Public |

### 4.3 Discovery
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/users/nearby` | Users within self radius. **Friends get exact GPS, strangers get grid-rounded (~110 m)**. | Bearer |
| GET | `/api/users/active` | All globally active users (no radius filter). Same friend-vs-grid rule. | Bearer |
| GET | `/api/users/matches` | Active users whose `going_to` overlaps with self (word-level). | Bearer |

### 4.4 Friend Requests (with WebSocket push)
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/requests/send` | Send request. If a reverse-pending request exists → auto-accepts. Emits WS `type: friend_request` | Bearer |
| GET | `/api/requests/incoming` | Pending inbound requests | Bearer |
| GET | `/api/requests/friends` | Accepted friends (cached in Redis 2 min) | Bearer |
| POST | `/api/requests/respond` | Accept / reject. Emits WS `type: request_response` | Bearer |
| POST | `/api/requests/cancel` | Cancel a pending outgoing request | Bearer |

### 4.5 Chat
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/chat/{other_id}/messages` | Full history between me and `other_id` (must be accepted friends; blocks respected) | Bearer |
| POST | `/api/chat/send` | Send text (1–2 000 chars). Persisted in `messages`. Emits WS `type: message` to recipient. | Bearer |

### 4.6 Blocks / Reports
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/block` | Block user (cache-invalidates both sides) | Bearer |
| POST | `/api/unblock` | Unblock (cache-invalidates) | Bearer |
| GET | `/api/block/list` | Users you've blocked | Bearer |
| POST | `/api/report` | Report user for admin review | Bearer |

### 4.7 Support
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/support` | Contact / bug / idea ticket (stored in `support_tickets`) | Bearer (optional) |

### 4.8 Admin (only if `phone` in `ADMIN_PHONES` env)
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/stats` | 5-metric overview (users, active, reports, messages, blocks) |
| GET | `/api/admin/users?q=` | Search users (name/phone regex), max 200 |
| POST | `/api/admin/users/{id}/ban?banned=true` | Ban/unban |
| GET | `/api/admin/reports?status=open|all` | Reports list (batched user hydration) |
| POST | `/api/admin/reports/{id}/resolve?action=dismissed|actioned` | Resolve |
| GET | `/api/admin/chats` | All conversation pairs w/ last message (batched) |
| GET | `/api/admin/chats/{chat_key}/messages` | Full transcript |
| DELETE | `/api/admin/messages/{id}` | Delete single message (moderation) |
| GET | `/api/admin/chats/{chat_key}/export` | CSV export of chat |
| GET | `/api/admin/blocks` | All block records with names (batched) |
| GET | `/api/admin/support` | All support tickets with author (batched) |
| GET | `/api/admin/backup` | ZIP of every collection as JSON |

### 4.9 WebSocket
| Path | Message shapes emitted |
|---|---|
| `/api/ws/{token}` | `{type:"message", message:{...}}`, `{type:"friend_request", request:{...}, from_user:{...}}`, `{type:"request_response", status, from_user_id}` |

---

## 5 · Frontend Routing — What Renders Where

**File:** `/app/frontend/src/App.js`

```jsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/auth/callback" element={<AuthCallback />} />        {/* Google return */}
  <Route path="/"        element={<Shell><Home /></Shell>} />
  <Route path="/active"  element={<Shell><ActiveUsers /></Shell>} />
  <Route path="/map"     element={<Shell><MapView /></Shell>} />
  <Route path="/requests" element={<Shell><Requests /></Shell>} />
  <Route path="/friends" element={<Shell><Friends /></Shell>} />    {/* Legacy standalone */}
  <Route path="/chat/:userId" element={<Protected><Chat /></Protected>} />
  <Route path="/profile" element={<Shell><Profile /></Shell>} />
  <Route path="/support" element={<Shell><Support /></Shell>} />
  <Route path="/admin"   element={<Shell><Admin /></Shell>} />
</Routes>
```

`<Protected>` — redirects to `/login` if no JWT.
`<Shell>` = `<Protected>` + `<MobileShell>` (adds bottom nav bar).

---

## 6 · Page-by-Page Walkthrough

### 6.1 Login (`pages/Login.js`)
1. User enters mobile digits → we prepend `+` prefix in UI (avoids mobile-keyboard `+` issue).
2. Click **Send OTP** → `POST /auth/send-otp` → SMS via Twilio.
3. Screen switches to OTP step.
4. Enter 6-digit OTP → `POST /auth/verify-otp` → returns `{token, user}` → `login()` stores JWT and user → `nav("/")`.
5. Alternative: click **Continue with Google** → redirect to `https://auth.emergentagent.com/?redirect=<origin>/auth/callback`.

### 6.2 AuthCallback (`pages/AuthCallback.js`)
1. Emergent redirects to `/auth/callback#session_id=xxx`.
2. Parse fragment → `POST /auth/google/exchange` with `session_id`.
3. Backend calls Emergent `/session-data` → gets `{email, name, picture}` → upserts by email → returns JWT.
4. `login(token, user)` → `nav("/", { replace: true })`.

### 6.3 Home / Discover (`pages/Home.js`)
- **Availability card** in order: **Location** → **Visibility** toggle → **Radius slider** → **Where are you headed**.
- On mount + on interval refresh:
  - `GET /users/me` → set self.
  - `POST /users/me/location` when GPS obtained or manual coords entered.
  - `POST /users/me/active` on toggle / radius change.
  - `GET /users/nearby` → shows people within radius (friend pins = exact GPS, others = grid).
- Uses `UserListItem` for each nearby person with "Send Request" action.

### 6.4 Active (`pages/ActiveUsers.js`) — **two sub-tabs**
- Header shows "Active" tab with **pill toggles**: `Active users` | `My friends`.
- **Active users tab:**
  - `GET /users/active` (all live users).
  - `GET /users/matches` (people with overlapping `going_to`) shown in a "Suggested matches" section.
  - Actions: **Send Request** (calls `POST /requests/send`).
- **My friends tab:**
  - `GET /requests/friends` (Redis-cached).
  - Actions: open chat → `nav("/chat/:userId")`.
- Both tabs share a search input.

### 6.5 Map (`pages/MapView.js`)
- Leaflet with OpenStreetMap tiles.
- Reads `user.location` (self, exact) → shows self marker + radius circle.
- Reads `GET /users/active` → plots each user at their `location` (exact for friends, grid for strangers).
- Distance in tooltip.

### 6.6 Requests (`pages/Requests.js`)
- `GET /requests/incoming` — pending inbound requests.
- Actions: `POST /requests/respond` (accept/reject).
- Live: WebSocket `friend_request` events push new inbound instantly.
- Badge count on bottom nav (`MobileShell.js` refreshes this).

### 6.7 Chat (`pages/Chat.js`)
- Route `/chat/:userId`.
- On mount: `GET /chat/:userId/messages` for history.
- On send: `POST /chat/send` → backend inserts + pushes WS to recipient.
- Live: `AuthContext.subscribe("message", ...)` on the shared WebSocket appends inbound messages instantly.
- Block/report actions in header dropdown → `POST /block` or `POST /report`.

### 6.8 Profile (`pages/Profile.js`)
- Fields: name, email, home_location, bio, avatar.
- **Not shown** (removed per user request): "Where are you headed" and "My Friends" button.
- Actions:
  - **Save** → `PUT /users/me`
  - **Upload avatar** → `POST /users/me/avatar` (multipart)
  - **Manage blocked users** → `GET /block/list` + `POST /unblock`
  - **Download my data** → `GET /users/me/export`, saves JSON file
  - **Delete my account** → confirms with typing "DELETE" → `DELETE /users/me` → logout
  - **Admin Dashboard** button (only if `user.is_admin`) → `/admin`

### 6.9 Support (`pages/Support.js`)
- `POST /support` — anyone (auth optional).

### 6.10 Admin (`pages/Admin.js`) — **5 tabs, cached per session**
Tabs rendered from `TABS = [Reports, Users, Messages, Blocks, Support]`.
- **Stats bar** on top → `GET /admin/stats`.
- **"Download full DB backup (.zip)"** button → `GET /admin/backup`.
- **Reports** — filter `Open` / `All` → `GET /admin/reports?status=`. Actions: Dismiss or Ban+Actioned.
- **Users** — search box → `GET /admin/users?q=`. Toggle Ban → `POST /admin/users/{id}/ban`.
- **Messages** — `GET /admin/chats` (list of conversations). Click row → modal with `GET /admin/chats/{key}/messages`:
  - Per-message **delete** (`DELETE /admin/messages/{id}`)
  - **Export CSV** (`GET /admin/chats/{key}/export`)
- **Blocks** — `GET /admin/blocks`.
- **Support** — `GET /admin/support`.

Tab data is cached in a `loaded` Set — switching tabs re-uses cached data (no refetch until the manual refresh button or a mutating action forces it).

---

## 7 · Authentication Flow (End-to-End)

### 7.1 OTP flow
```
Login.js  ──POST /auth/send-otp──►  server.py
                                        │
                                        ├─ rate-limit (Redis)
                                        ├─ secrets.randbelow → 6-digit OTP
                                        ├─ upsert into otps { phone, otp, expires_at }
                                        └─ twilio_client.messages.create(...)
                                        
Login.js  ──POST /auth/verify-otp──► server.py
                                        │
                                        ├─ rate-limit + attempt-lockout
                                        ├─ TTL check
                                        ├─ upsert user in `users`
                                        └─ jwt.encode({ user_id }, JWT_SECRET) → { token, user }
                                        
AuthContext.login(token, user) → localStorage["nbs_token"] = token
                                → setUser(user)
                                → open WebSocket wsUrl(token)
```

### 7.2 Google flow
```
Login.js redirects to https://auth.emergentagent.com/?redirect=<origin>/auth/callback
Emergent → user signs in with Google → redirects to /auth/callback#session_id=…
AuthCallback.js → POST /auth/google/exchange { session_id }
server.py → GET https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data
         → upsert user by email (sparse-unique index) → JWT
```

### 7.3 Persistent session
`AuthContext.js` on mount reads token from localStorage → `GET /users/me` → sets `user` → opens WebSocket.

### 7.4 Admin check
Login sets `user.is_admin = user.phone in ADMIN_PHONES`. Any admin API also verifies via `require_admin` dependency (no client trust).

---

## 8 · WebSocket Contract

**Client side** (`AuthContext.js`):
```js
const ws = new WebSocket(wsUrl(token));
ws.onmessage = (evt) => {
  const msg = JSON.parse(evt.data);
  handlers[msg.type]?.forEach(fn => fn(msg));   // subscribers registered via subscribe()
};
```

**Consumers:**
- `Chat.js` → `subscribe("message", ...)` → appends incoming message if it belongs to open thread.
- `Requests.js` and `MobileShell.js` → `subscribe("friend_request", ...)` → refresh badge / list.

**Server side** (`ConnectionManager` class in `server.py`):
- `connect(user_id, ws)` on accepted connection
- `disconnect(user_id, ws)` on close
- `send_to(user_id, payload)` — called from send-message, respond-request, send-request handlers.

---

## 9 · Data Model (MongoDB Collections)

| Collection | Key fields | Notes |
|---|---|---|
| `users` | `id` (uuid), `phone` (sparse-unique), `email` (sparse-unique), `name`, `avatar`, `bio`, `going_to`, `home_location`, `location {lat,lng}`, `is_active`, `radius`, `is_banned`, `auth_provider`, `created_at` | Precise GPS only shown to friends |
| `otps` | `phone`, `otp`, `expires_at` (TTL index), `attempts` | Auto-purged after 10 min |
| `friend_requests` | `id`, `from_user_id`, `to_user_id`, `status: pending|accepted|rejected`, `created_at`, `responded_at` | |
| `messages` | `id`, `chat_key = sorted("|".join([a,b]))`, `from_user_id`, `to_user_id`, `text`, `created_at` | Compound index `(chat_key, created_at)` |
| `blocks` | `blocker_id`, `blocked_id`, `created_at` | Unique compound |
| `reports` | `reporter_id`, `reported_id`, `reason`, `details`, `status`, `created_at` | |
| `support_tickets` | `id`, `user_id`, `type`, `name`, `email`, `message`, `created_at` | |
| `files` | `id`, `user_id`, `storage_path`, `content_type`, `size`, `is_deleted` | Emergent Object Storage |

---

## 10 · Caching Layer (Redis)

**Purpose:** Reduce Mongo load on hot paths.

| Key | TTL | Populated by | Invalidated by |
|---|---|---|---|
| `blocks:{user_id}` | 5 min | `get_blocked_ids()` (called on every discover/chat/friend query) | `POST /block`, `POST /unblock` |
| `friends:{user_id}` | 2 min | `GET /requests/friends` | `POST /requests/respond` (accept), auto-match, block/unblock |
| `friend_ids:{user_id}` | 2 min | `get_friend_ids()` (used in discovery for exact-vs-grid decision) | Same as `friends:` |
| `otp:send:phone:{p}` | 10 min | `POST /auth/send-otp` | Auto-expires |
| `otp:send:ip:{ip}` | 10 min | `POST /auth/send-otp` | Auto-expires |
| `otp:verify:ip:{ip}` | 10 min | `POST /auth/verify-otp` | Auto-expires |
| `gauth:ip:{ip}` | 10 min | `POST /auth/google/exchange` | Auto-expires |

Redis is **fail-open**: if unreachable, cache calls no-op and the app keeps serving from Mongo.

---

## 11 · Security Model

- **JWT** signed HS256, 30-day expiry, secret in `JWT_SECRET` env (48-byte random).
- **OTP**: `secrets.randbelow`, TTL 10 min, 5-attempt lockout.
- **Rate limits** (Redis): OTP 3/phone/10min + 10/IP/10min, verify 20/IP/10min, Google exchange 20/IP/10min.
- **Input caps** on every Pydantic model.
- **CORS** locked to production origin only.
- **Location privacy**: strangers see grid-rounded coords (~110 m), only accepted friends see exact GPS.
- **File uploads** capped at 5 MB, content-type validated.
- **Admin routes** re-check `require_admin` dependency (server-authoritative).

---

## 12 · Local Dev

```bash
# start Mongo & Redis via supervisor (already configured)
sudo supervisorctl status

# backend hot reload — just edit server.py
# frontend hot reload — just edit any React file

# manual restart if you change .env or dependencies
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
```

## 13 · Handy MongoDB commands

```bash
# Open shell
mongosh test_database

# See everything
show collections
db.users.find().pretty()
db.messages.countDocuments()

# Ad hoc queries
db.users.find({ phone: "+919599266642" })
db.messages.find({ chat_key: "abc|xyz" }).sort({ created_at: 1 })
```

## 14 · Handy Redis commands

```bash
redis-cli KEYS '*'
redis-cli GET 'friend_ids:44870004-18d7-4811-8a66-6dd7d3a18ed5'
redis-cli FLUSHALL     # nukes cache — safe, will rebuild from Mongo
```

---

## 15 · Environment Variables

**Backend `/app/backend/.env`:**
```env
MONGO_URL="mongodb://localhost:27017"       # or Atlas SRV URL
DB_NAME="test_database"
CORS_ORIGINS="https://your-prod-domain"
REDIS_URL="redis://127.0.0.1:6379/0"
JWT_SECRET="<48+ byte random>"
TWILIO_ACCOUNT_SID="AC…"
TWILIO_AUTH_TOKEN="…"
TWILIO_FROM_NUMBER="+1…"
ADMIN_PHONES="+919599266642"                # comma-separated phones granted admin
```

**Frontend `/app/frontend/.env`:**
```env
REACT_APP_BACKEND_URL="https://zip-inspector-16.preview.emergentagent.com"
```

---

## 16 · WebSocket Message Types (Reference)

```ts
// Server → Client
{ type: "friend_request", request: { id, from_user_id, to_user_id, status }, from_user: { id, name, avatar } }
{ type: "request_response", status: "accepted"|"rejected", from_user_id: string }
{ type: "message", message: { id, chat_key, from_user_id, to_user_id, text, created_at } }
```

---

## 17 · Deployment Notes

- Preview deploys use Emergent platform (`.emergent/emergent.yml` present).
- Everything read from env — no hardcoded URLs.
- Redis auto-starts under supervisor.
- Mongo indexes are created on backend startup (`ensure_indexes()`).
- Admin phones added via `ADMIN_PHONES` env var, comma-separated.

**Deploy readiness health check**: `deployment_agent` reported PASS (only non-blocking N+1 query warnings, since batched later).

---

_Last updated: session 1 (Jan 2026). Maintainer: E1 · Emergent Labs._
