import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { RoomState } from '../state/route';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, nickname, isHost, hostId } = body;

    if (!roomCode) {
      return NextResponse.json({ error: 'Room code is missing' }, { status: 400 });
    }

    const roomKey = `room:${roomCode.toUpperCase()}`;
    let state = await kv.get<RoomState>(roomKey);

    // Host initialization
    if (isHost) {
      if (!hostId) {
        return NextResponse.json({ error: 'Host ID is missing' }, { status: 400 });
      }
      
      if (!state) {
        state = {
          roomCode: roomCode.toUpperCase(),
          phase: 'LOBBY',
          theme: 'Un morceau épique sur un codeur fatigué',
          players: [],
          readyPlayers: [],
          submissions: [],
          votes: [],
          currentRoundIdx: 0,
          scores: {},
          hostId,
        };
        await kv.set(roomKey, state);
      }
      return NextResponse.json(state);
    }

    // Player joining
    if (!state) {
      return NextResponse.json({ error: 'Game lobby not found' }, { status: 404 });
    }

    if (!nickname) {
      return NextResponse.json({ error: 'Nickname is missing' }, { status: 400 });
    }

    const trimmedNickname = nickname.trim();
    if (state.players.includes(trimmedNickname)) {
      // Re-joining with same name is allowed
      return NextResponse.json(state);
    }

    state.players.push(trimmedNickname);
    await kv.set(roomKey, state);

    return NextResponse.json(state);
  } catch (e: any) {
    console.error('Join API Error:', e);
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 });
  }
}
