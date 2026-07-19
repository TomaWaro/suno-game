import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { RoomState } from '../state/route';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, action, hostId, payload } = body;

    if (!roomCode || !action || !hostId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const roomKey = `room:${roomCode.toUpperCase()}`;
    const state = await kv.get<RoomState>(roomKey);

    if (!state) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (state.hostId !== hostId) {
      return NextResponse.json({ error: 'Unauthorized host action' }, { status: 403 });
    }

    switch (action) {
      case 'SET_GAME_MODE':
        if (payload?.gameMode) {
          state.gameMode = payload.gameMode;
        }
        break;

      case 'START_SUBMISSION':
        state.phase = 'SUBMISSION';
        state.submissions = [];
        state.readyPlayers = [];
        state.votes = [];
        state.buzzes = [];
        state.currentRoundIdx = 0;
        state.songRevealed = false;
        break;

      case 'START_GUESSING':
        state.phase = 'GUESSING';
        state.currentRoundIdx = payload?.roundIdx ?? state.currentRoundIdx;
        state.roundStartedAt = Date.now();
        state.buzzes = [];
        state.songRevealed = false;
        break;

      case 'VALIDATE_BUZZ': {
        const candidate = payload?.nickname || state.buzzes?.[0]?.nickname;
        if (candidate) {
          const cleanNick = candidate.trim();
          const pointsGained = payload?.points ?? 500;
          state.scores[cleanNick] = (state.scores[cleanNick] || 0) + pointsGained;

          // Creator bonus points for the player who proposed the song
          const currentSong = state.submissions?.[state.currentRoundIdx];
          if (currentSong && currentSong.nickname) {
            const submitterNick = currentSong.nickname.trim();
            if (submitterNick && submitterNick !== cleanNick) {
              const creatorBonus = payload?.creatorBonus ?? 250;
              state.scores[submitterNick] = (state.scores[submitterNick] || 0) + creatorBonus;
            }
          }

          // Record vote so race track & reveal animation step shows who got points
          state.votes = state.votes || [];
          state.votes.push({
            voter: cleanNick,
            guess: 'BUZZ_SUCCESS',
            rating: 5,
            roundIdx: state.currentRoundIdx,
            createdAt: Date.now(),
          });
        }
        state.buzzes = [];
        state.songRevealed = true;
        break;
      }

      case 'REJECT_BUZZ': {
        const rejectedNick = payload?.nickname || state.buzzes?.[0]?.nickname;
        if (rejectedNick) {
          const cleanNick = rejectedNick.trim();
          // Add 10-second penalty
          state.penalties = state.penalties || {};
          state.penalties[cleanNick] = Date.now() + 10000;

          // Remove candidate from queue
          state.buzzes = (state.buzzes || []).filter((b) => b.nickname.trim() !== cleanNick);
        }
        break;
      }

      case 'CLEAR_BUZZES':
        state.buzzes = [];
        state.songRevealed = true;
        break;

      case 'CONTINUE_ROUND':
        state.phase = 'SUBMISSION';
        state.submissions = [];
        state.readyPlayers = [];
        state.votes = [];
        state.buzzes = [];
        state.currentRoundIdx = 0;
        state.roundStartedAt = 0;
        state.songRevealed = false;
        break;

      case 'SET_STATE':
        if (payload?.phase) state.phase = payload.phase;
        if (payload?.gameMode) state.gameMode = payload.gameMode;
        if (payload?.scores) state.scores = payload.scores;
        if (payload?.votes) state.votes = payload.votes;
        if (payload?.readyPlayers) state.readyPlayers = payload.readyPlayers;
        if (payload?.currentRoundIdx !== undefined) state.currentRoundIdx = payload.currentRoundIdx;
        if (payload?.buzzes !== undefined) state.buzzes = payload.buzzes;
        if (payload?.penalties !== undefined) state.penalties = payload.penalties;
        break;

      case 'RESET':
        state.phase = 'LOBBY';
        state.gameMode = 'SUNO';
        state.submissions = [];
        state.readyPlayers = [];
        state.votes = [];
        state.buzzes = [];
        state.penalties = {};
        state.currentRoundIdx = 0;
        state.scores = {};
        state.roundStartedAt = 0;
        break;

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    await kv.set(roomKey, state, { ex: 7200 }); // Reset room TTL to 2 hours
    return NextResponse.json(state);
  } catch (e: any) {
    console.error('Action API Error:', e);
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 });
  }
}
