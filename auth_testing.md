# Auth Testing Playbook

## Google Sign-In flow
1. User clicks "Continue with Google" on `/login`
2. Redirects to `https://auth.emergentagent.com/?redirect=<origin>/auth/callback`
3. After Google auth, lands at `<origin>/auth/callback#session_id=<sid>`
4. Frontend AuthCallback parses fragment, POSTs to `/api/auth/google/exchange` with the session_id
5. Backend calls Emergent `/session-data` with `X-Session-ID` header, gets `{id, email, name, picture, session_token}`
6. Backend upserts user in `users` collection matched by email (creates if new), issues our JWT
7. Frontend stores JWT in localStorage (`nbs_token`) and navigates to `/`

## Test users
- Any Google account can be used. On first sign-in a new record is inserted in `users` with:
  - `email` (unique-sparse) — Google email
  - `avatar` — Google profile picture URL
  - `name` — Google display name
  - `phone` — null (until they link one; not required)

## Coexistence with OTP flow
- OTP users have `phone`, no `email` (initially)
- Google users have `email`, no `phone`
- If a phone user later updates their email to a Google account email, the next Google sign-in will match by email → same user record (email is the join key for Google)

## Manual test steps
1. Open `/login`, click "Continue with Google"
2. Sign in with a Google account
3. Should redirect to `/` with the account name in header
4. Verify token is in localStorage under `nbs_token`
5. Verify user in DB: `mongosh test_database --eval "db.users.find({email:'<your@email>'})"`
