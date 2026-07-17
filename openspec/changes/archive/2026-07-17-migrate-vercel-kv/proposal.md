## Why

This change replaces the Supabase real-time sync implementation with a native Vercel KV (Redis) database and HTTP polling APIs. This removes the need for users to set up Supabase accounts and manually configure environment variables, enabling a zero-config local development setup and single-click production storage configuration on Vercel.

## What Changes

- Remove Supabase client dependencies and config.
- Install `@vercel/kv` SDK dependency.
- Create a unified storage wrapper with an automatic local in-memory/file fallback.
- Build Next.js API endpoints (`/api/room/...`) to manage state, joins, submissions, and votes.
- Refactor the Host and Player client pages to interface with the local API routes using regular HTTP polling.

## Capabilities

### New Capabilities

### Modified Capabilities
- `lobby-management`: Add room state TTL (Time-to-live) and expiration requirement.

## Impact

- **Dependencies**: Uninstall `@supabase/supabase-js`, install `@vercel/kv`.
- **API Interfaces**: New serverless API routes under `src/app/api/room/`.
- **Database**: Shift to Redis (Vercel KV) in production, local dev Cache/Memory file fallback in development.
