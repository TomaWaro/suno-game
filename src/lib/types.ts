export type GameMode = 'SUNO' | 'BUZZ';

export type GamePhase = 'LOBBY' | 'SUBMISSION' | 'GUESSING' | 'REVEAL' | 'LEADERBOARD';

export interface Submission {
  nickname: string;
  title: string;
  sunoUrl: string; // Embed URL (Suno or YouTube)
  songType?: 'SUNO' | 'YOUTUBE';
}

export interface BuzzItem {
  nickname: string;
  timestamp: number;
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

