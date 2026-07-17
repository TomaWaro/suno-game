## Context

This design outlines the technical approach to migrate the real-time multiplayer state of SunoGame from Supabase Presence/Broadcast to a native Vercel KV (Redis) database, communicating via Next.js serverless API routes (`/api/room/*`) and regular client-side HTTP polling (every 1 second).

## Goals / Non-Goals

**Goals:**
- Zero-config local development setup: Bypasses Vercel KV and uses a local memory/JSON-cache fallback when local credentials are not found.
- 1-click Vercel integration: Operates on production KV Redis parameters automatically injected by Vercel Storage.
- Keep the game loop and logic identical (Lobby -> Submission -> Listening/Guessing -> Reveal -> Leaderboard).

**Non-Goals:**
- Custom WebSocket hosting or server daemons.

## Decisions

### Decision 1: Storage Layer Wrapper
We will implement `src/lib/kv.ts` as a unified database manager.
- If `process.env.KV_REST_API_URL` is set, it initializes `@vercel/kv`.
- If not, it falls back to a file-based cache at `./.next/mock-kv.json` or memory Map. This allows developers to clone and run the project locally with `npm run dev` instantly with zero config.

### Decision 2: API Route Contracts
We will expose the following endpoint handlers:
- `GET /api/room/state?room=XXXX`: Returns the current room state (phase, theme, submissions (anonymized), active nickname list, vote counts).
- `POST /api/room/action`: Handles host state changes (Start game, start guessing, reveal, next round, reset) secure-checked by an host identifier.
- `POST /api/room/join`: Adds player nickname to lobby presence.
- `POST /api/room/submit`: Submits Suno URL anonymously.
- `POST /api/room/vote`: Casts guess and rating.

### Decision 3: Client-Side Polling
Lobby host and player clients will run `setInterval` polling `GET /api/room/state` every 1000ms.
- Polling is highly compatible with Vercel Serverless execution limits and incurs minimal latency overhead for standard turn-based game screens.

## Risks / Trade-offs

- **[Risk] KV Rate Limits / Pricing**: Polling every 1s across many players can result in high Redis command counts.
  - *Mitigation*: Limit the polling interval or pause polling when the window tab is out of focus. Auto-expire rooms after 2 hours (TTL) to prevent data bloat.
