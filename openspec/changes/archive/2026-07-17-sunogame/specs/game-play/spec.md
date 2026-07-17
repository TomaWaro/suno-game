## ADDED Requirements

### Requirement: Host plays song via Suno embed
The central Host screen SHALL render the Suno player iframe using the parsed embed URL and play the track anonymously during the listening phase.

#### Scenario: Listening phase starts
- **WHEN** the host initiates the round
- **THEN** the Host screen renders the Suno embed player and starts audio playback, displaying native scrolling lyrics

### Requirement: Player guesses creator and rates track on mobile
The system SHALL allow players to select the creator of the track and rate the song out of 5 stars on their mobile devices while the Host screen plays the song.

#### Scenario: Mobile player submits guess and rating
- **WHEN** a player selects a nickname from the list and submits a 1-5 star rating on their mobile device
- **THEN** the system registers the vote and rating anonymously, and sends a status update to the Host screen

### Requirement: Creator cannot vote for themselves
The system SHALL exclude the song's creator from being able to vote for themselves. On their mobile device, their own nickname SHALL NOT be selectable as a guess option.

#### Scenario: Creator voting screen shows other nicknames only
- **WHEN** the guessing phase starts for a song
- **THEN** the creator's mobile voting screen displays a list of participant nicknames excluding their own
