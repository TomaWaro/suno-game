## ADDED Requirements

### Requirement: Player can submit a Suno link
The system SHALL allow players to anonymously submit a valid Suno song link and a song title during the creation/submission phase on their mobile devices.

#### Scenario: Successful submission of Suno link
- **WHEN** a player submits a song title and a valid Suno link (e.g. starting with `https://suno.com/`)
- **THEN** the system stores the submission anonymously, parses it into an embed URL, and marks the player as ready in the lobby
