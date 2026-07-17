## Context

SunoGame is a web-based, mobile-first party game where players submit AI-generated songs and guess their creators. The app must run on Vercel, connect multiple players in a single game room in real-time using a split-screen model (central Host screen for TV/Desktop, and mobile Player views), play audio tracks with built-in scrolling lyrics via Suno embeds, and run the game logic.

## Goals / Non-Goals

**Goals:**
- Real-time lobby and game state synchronization between the Host screen and player mobile devices.
- Secure, anonymous Suno URL submission during the submission phase.
- Audio playback and synchronized scrolling lyrics rendered via direct Suno embeds.
- Client-side calculation of the "Sweet Spot" guessing score decay and rating points.
- Mobile-first responsive UI for players, and a cinematic UI for the Host.

**Non-Goals:**
- Integrating direct API connections to Suno or ChatGPT to automate track generation inside the app (players generate songs externally).
- Custom audio hosting or audio streaming endpoints (relies entirely on Suno's player).
- Custom client-side synced lyric rendering engine (delegated to Suno's native player features).

## Decisions

### Decision 1: Real-time Synchronization Engine
We will use **Supabase Broadcast & Presence channels** for real-time room communication.
- *Rationale*: Supabase provides sub-100ms real-time broadcasting and presence synchronization out of the box, with a very simple client SDK. It allows syncing lobby lists, voting statuses, and game phase transitions without polling or heavy server loads.
- *Alternatives Considered*: Firebase Realtime Database.

### Decision 2: Audio Playback and Lyrics Integration
We will use **standard Suno iframes/embeds** on the central Host screen.
- *Rationale*: Suno URLs (e.g. `https://suno.com/song/...` parsed to `https://suno.com/embed/...`) natively feature built-in audio players and automatically scrolling lyrics. Utilizing their embeds eliminates the need for downloading audio files, hosting media, parsing subtitle files, or building a custom karaoke lyrics syncing engine.
- *Alternatives Considered*: Downloading audio files and uploading them to Vercel Blob with custom scrolling text engines.

### Decision 3: Host-Only Submission Channel for Anonymity
To prevent players from inspecting network traffic (via browser dev tools) to cheat and see who submitted which song, players will send their submissions via a dedicated, private Broadcast channel (e.g., `room_<pin>_host`) that only the Host subscribes to.
- *Rationale*: Standard Broadcast channels send payloads to all connected clients. A dedicated host-inbound channel ensures strict anonymity until the reveal phase.

### Decision 4: API-Based QR Code Generation
The Host screen will use a public API (e.g., `api.qrserver.com`) to render the QR code image pointing to the direct join URL (`/play?room=XXXX`).
- *Rationale*: Eliminates the need for client-side QR generation libraries, keeping the Next.js bundle size minimal and avoiding SSR hydration mismatches.

## Risks / Trade-offs

- **[Risk] Suno Player Loading Latency**: Suno embeds might load at slightly different speeds depending on network conditions.
  - *Mitigation*: The Host screen handles track loading and playback. The player views on mobile devices will only show voting options once the Host screen broadcasts that the track is fully loaded and playing.
- **[Risk] Iframe Audio Completion Detection**: Third-party iframes often do not expose an event when the audio finishes playing, making automatic phase transitions difficult.
  - *Mitigation*: The Host will have manual controls (e.g., "Passer au vote") to manually trigger phase transitions, which is actually preferable for party games to allow discussion time.
- **[Risk] Embed Styling Restrictions**: We cannot customize the visual styles inside the Suno iframe player.
  - *Mitigation*: Frame the Suno embed inside a beautiful, styled wrapper (glassmorphic border, neon glowing shadow) to maintain a premium visual identity.
