# NBS - Nearby Social App

## Original Problem Statement
1. APP NAME NBS
2. login/signup/ MOBILE OTP
3. button activated user to show all activated, user who is registered on this app and if user is active and come to under 10 to 100 meter radius range then show send request to user if accepted then can chat, radius button should be custom.
4. User is active then in users list user should be active sign name and destination send request button
5. all data should be save in db like user details
6. support, contact info, any idea

## User Choices
- **OTP**: Mock OTP (auto: `123456`)
- **Location**: Browser Geolocation + Manual coords entry
- **Chat**: Real-time WebSocket
- **Radius**: 10m – 10km custom slider
- **Design**: Airbnb-inspired (Coral #FF385C, white surfaces, Outfit + Manrope fonts)

## Architecture
- **Backend**: FastAPI + MongoDB (motor) + JWT auth + WebSocket
- **Frontend**: React 19 + React Router + Tailwind + Shadcn (Slider) + Sonner toasts + Axios
- **Real-time**: WebSocket at `/api/ws/{token}` (notifies new requests, request responses, new messages)

## Implemented (Feb 2026)
- Mock OTP login/signup → JWT token (30d)
- User profile (name, email, destination, bio, avatar)
- Availability toggle (live/offline)
- Custom radius slider 10m – 10km
- Geolocation API + manual coordinate entry
- Nearby users list (haversine distance, sorted asc, online indicator)
- Friend request: send / receive / accept / reject / auto-match (both sent each other)
- Real-time chat between connected users (WebSocket push)
- Support/Contact/Idea submission
- Bottom-nav mobile-first UI (Discover · Requests · Friends · Profile · Support)

## Backlog (P1)
- Profile photo upload (image storage)
- Block / report users, safety controls
- Push notifications (web push)
- Map view of nearby users
- Group/community channels
- Identity verification (selfie / KYC)

## Backlog (P2)
- Stories/ephemeral posts
- Filters (interests, age, looking-for)
- Premium tier (longer radius, priority discovery)
