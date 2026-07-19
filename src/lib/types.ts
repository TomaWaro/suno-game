export type GamePhase = 'LOBBY' | 'SUBMISSION' | 'GUESSING' | 'REVEAL' | 'LEADERBOARD';

export interface Submission {
  nickname: string;
  title: string;
  sunoUrl: string; // Parsed iframe embed URL
}

export interface Vote {
  voter: string;
  guess: string;
  rating: number; // 1-5 stars
  roundIdx: number;
  createdAt?: number;
}

export interface ScoreState {
  [nickname: string]: number; // Accumulated scores
}
