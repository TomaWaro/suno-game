## ADDED Requirements

### Requirement: Sweet spot creator points calculation
The system SHALL reward the creator with maximum points if exactly one player guesses them, and decay the points exponentially or linearly as more players guess them correctly.

#### Scenario: Maximum points for single guess
- **WHEN** exactly 1 player in the lobby guesses the correct creator
- **THEN** the creator is awarded the maximum creator points (e.g., 1000 points)

#### Scenario: Decayed points for many correct guesses
- **WHEN** more than 1 player guesses the correct creator
- **THEN** the creator is awarded decayed points that decrease as the ratio of correct guesses to total players increases

### Requirement: Rating bonus points
The system SHALL award extra points to the creator based on the average star rating of their song in the round.

#### Scenario: High average rating reward
- **WHEN** the round ends and the song average rating is calculated
- **THEN** the creator is awarded rating points equal to the average rating multiplied by the points multiplier (e.g., 100 points per star)
