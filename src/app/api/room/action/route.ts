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
      case 'START_SUBMISSION':
        state.phase = 'SUBMISSION';
        state.theme = payload?.theme || state.theme;
        state.submissions = [];
        state.readyPlayers = [];
        state.votes = [];
        state.currentRoundIdx = 0;
        break;

      case 'START_GUESSING':
        state.phase = 'GUESSING';
        state.currentRoundIdx = payload?.roundIdx ?? state.currentRoundIdx;
        break;

      case 'SET_STATE':
        if (payload?.phase) state.phase = payload.phase;
        if (payload?.scores) state.scores = payload.scores;
        if (payload?.votes) state.votes = payload.votes;
        if (payload?.readyPlayers) state.readyPlayers = payload.readyPlayers;
        break;

      case 'RESET':
        state.phase = 'LOBBY';
        state.submissions = [];
        state.readyPlayers = [];
        state.votes = [];
        state.currentRoundIdx = 0;
        state.scores = {};
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
