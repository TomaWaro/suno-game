## ADDED Requirements

### Requirement: Room state expiration
The system SHALL automatically expire and delete the game lobby state after 2 hours of inactivity.

#### Scenario: Lobby state expires
- **WHEN** a game room has been inactive for 2 hours
- **THEN** the system deletes the room configuration and active players from the database
