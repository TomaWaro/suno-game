import { NextResponse } from 'next/server';
import { runTransaction } from '@/lib/kv';
import { RoomState } from '../state/route';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, nickname, isHost, hostId } = body;

    if (!roomCode) {
      return NextResponse.json({ error: 'Room code is missing' }, { status: 400 });
    }

    const roomKey = `room:${roomCode.toUpperCase()}`;

    // Host initialization
    if (isHost) {
      if (!hostId) {
        return NextResponse.json({ error: 'Host ID is missing' }, { status: 400 });
      }
      
      const { kv } = await import('@/lib/kv');
      let state = await kv.get<RoomState>(roomKey);
      if (!state) {
        state = {
          roomCode: roomCode.toUpperCase(),
          gameMode: 'SUNO',
          phase: 'LOBBY',
          players: [],
          readyPlayers: [],
          submissions: [],
          votes: [],
          currentRoundIdx: 0,
          scores: {},
          hostId,
          buzzes: [],
          penalties: {},
        };
        await kv.set(roomKey, state);
      }
      return NextResponse.json(state);
    }

    // Player joining
    if (!nickname) {
      return NextResponse.json({ error: 'Nickname is missing' }, { status: 400 });
    }

    const trimmedNickname = nickname.trim();

    // Atomic update of lobby players
    const updatedState = await runTransaction<RoomState, RoomState>(roomKey, (state) => {
      if (!state.players.includes(trimmedNickname)) {
        state.players.push(trimmedNickname);
      }
      return state;
    });

    return NextResponse.json(updatedState);
  } catch (e: any) {
    console.error('Join API Error:', e);
    return NextResponse.json({ error: e.message || 'Room not found' }, { status: 400 });
  }
}
