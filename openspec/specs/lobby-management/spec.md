# lobby-management Specification

## Purpose
TBD - created by archiving change sunogame. Update Purpose after archive.
## Requirements
### Requirement: Host can create a lobby room
The system SHALL allow a host to create a new game lobby with a unique room pin and QR code.

#### Scenario: Successful lobby creation
- **WHEN** the host initiates a new session
- **THEN** the system generates a unique 4-6 character Room Pin and a QR code pointing to the lobby URL

### Requirement: Player can join lobby room
The system SHALL allow players to join an active lobby by manually entering the room pin or by navigating to a direct join URL (e.g., from scanning a QR code) that automatically fills the room pin, and providing a unique nickname.

#### Scenario: Player joins with unique nickname
- **WHEN** a player submits the active Room Pin (manually or via pre-filled URL query parameter) and a unique nickname
- **THEN** the player is added to the lobby's participant list and appears on the host screen

