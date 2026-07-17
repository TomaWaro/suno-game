## 1. Setup & DB Wrapper

- [x] 1.1 Uninstall `@supabase/supabase-js` and install `@vercel/kv` SDK
- [x] 1.2 Implement the unified `src/lib/kv.ts` wrapper with local memory/file fallback

## 2. API Routes

- [x] 2.1 Implement room state controller API `GET /api/room/state`
- [x] 2.2 Implement room joining API `POST /api/room/join`
- [x] 2.3 Implement room action controller API `POST /api/room/action`
- [x] 2.4 Implement submission API `POST /api/room/submit`
- [x] 2.5 Implement voting API `POST /api/room/vote`

## 3. Frontend Refactoring

- [x] 3.1 Refactor Host view (/host) to fetch state via polling and dispatch POST actions
- [x] 3.2 Refactor Player mobile view (/play) to poll room phase and submit songs/votes
- [x] 3.3 Clean up old Supabase files and configurations
