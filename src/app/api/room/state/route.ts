import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { GamePhase, Submission, Vote, ScoreState } from '@/lib/types';

export interface RoomState {
  roomCode: string;
  phase: GamePhase;
  theme: string;
  players: string[];
  readyPlayers: string[];
  submissions: Submission[];
  votes: Vote[];
  currentRoundIdx: number;
  scores: ScoreState;
  hostId: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomCode = searchParams.get('room');

  if (!roomCode) {
    return NextResponse.json({ error: 'Room parameter is missing' }, { status: 400 });
  }

  const roomKey = `room:${roomCode.toUpperCase()}`;
  const state = await kv.get<RoomState>(roomKey);

  if (!state) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // Anonymize submissions during active gameplay phases to prevent devtools cheating
  const filteredSubmissions = state.submissions.map((sub, idx) => {
    // Hide creator nickname unless we are in REVEAL or LEADERBOARD phases
    const showCreator = state.phase === 'REVEAL' || state.phase === 'LEADERBOARD';
    return {
      title: sub.title,
      sunoUrl: sub.sunoUrl,
      nickname: showCreator ? sub.nickname : 'Anonymous',
    };
  });

  // Similarly, hide vote details unless we are in REVEAL phase
  const showVotes = state.phase === 'REVEAL' || state.phase === 'LEADERBOARD';
  const anonymizedVotes = showVotes 
    ? state.votes 
    : state.votes.map(v => ({ voter: v.voter, guess: '', rating: 0 }));

  const responseState = {
    ...state,
    submissions: filteredSubmissions,
    votes: anonymizedVotes,
    // Provide true submitter identity for the active song only during guess phase,
    // but ONLY to allow the client app to filter out the creator from self-voting
    currentSongCreator: state.phase === 'GUESSING' && state.submissions[state.currentRoundIdx]
      ? state.submissions[state.currentRoundIdx].nickname
      : null,
  };

  return NextResponse.json(responseState);
}
