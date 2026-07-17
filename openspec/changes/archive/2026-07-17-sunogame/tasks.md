## 1. Setup & Foundations

- [x] 1.1 Configure Supabase Real-time client configuration and environment variables
- [x] 1.2 Setup Next.js route structures for Host (/host) and Mobile Players (/play)
- [x] 1.3 Create layout and global styling system (HSL colors, dark theme, Outfit/Inter typography, glassmorphism UI tokens)

## 2. Lobby & Presence Management

- [x] 2.1 Implement lobby host creation screen with Room Pin and QR code display
- [x] 2.2 Implement player join screen on mobile using Room Pin and nickname validation
- [x] 2.3 Set up Supabase Presence to broadcast active player list to the Host screen

## 3. Submission Phase

- [x] 3.1 Design mobile track submission form (song title, Suno URL text field)
- [x] 3.2 Implement utility to parse standard Suno song URLs into embed URLs (e.g. `https://suno.com/embed/...`)
- [x] 3.3 Create state logic to mark players as "Ready" on the Host screen when their URL is submitted

## 4. Game Play & Synchronization

- [x] 4.1 Implement game state broadcast transitions (Lobby -> Submission -> Listening/Guessing -> Reveal -> Leaderboard)
- [x] 4.2 Build Host view containing the iframe Suno player embed
- [x] 4.3 Design mobile voting buttons (nickname list) and 1-5 stars track rating slider

## 5. Scoring & Results

- [x] 5.1 Implement the "Sweet Spot" guessing decay algorithm and rating points math
- [x] 5.2 Build round reveal screens on the Host screen showing creator identity, points won, and confetti animations
- [x] 5.3 Implement final leaderboards and podium on the Host screen
