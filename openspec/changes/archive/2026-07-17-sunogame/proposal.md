## Why

Currently, there is no interactive platform that gamifies AI music creation. This change introduces "SunoGame", a Kahoot-like multiplayer guessing game where players create tracks using Suno AI, submit their Suno URLs anonymously, listen to them on a central Host screen, and guess the creators on their mobile devices while scoring points based on a strategic voting mechanic.

## What Changes

We will build the entire SunoGame web application:
- Real-time lobby creation, player joining (via Room Pin/QR code) supporting a split-screen layout (Host View and Player View).
- A helper interface on mobile to streamline song submission by pasting the Suno URL.
- An interactive game play interface on the Host screen that embeds the Suno player (utilizing Suno's native automatic scrolling lyrics) and plays the audio.
- A voting interface on player mobile devices.
- A strategic scoring engine that implements the "Sweet Spot" guessing formula (creator points decay as more people guess correctly) and music rating system.
- An animated reveal screen and a final leaderboard podium on the Host screen.

## Capabilities

### New Capabilities
- `lobby-management`: Handles real-time lobby creation, room pins, QR code joining, and player presence.
- `music-submission`: Allows players to submit Suno links during the creation phase.
- `game-play`: Coordinates the game states (listening, guessing/voting, revealing, leaderboard) with real-time sync between the central Host screen and player mobile devices.
- `scoring-system`: Computes and distributes points dynamically based on guessing correctness (with decay), music ratings, and vote speeds.

### Modified Capabilities

## Impact

- **Database**: Real-time database (e.g. Firebase or Supabase) to track room status, player submissions, and score calculations.
- **Frontend UI**: Next.js app layout with Host View (/host) and Mobile Player View (/play), featuring dynamic styling, glassmorphism design system, and custom animations.
