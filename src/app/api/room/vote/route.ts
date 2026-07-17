import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { RoomState } from '../state/route';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, voter, guess, rating } = body;

    if (!roomCode || !voter) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const roomKey = `room:${roomCode.toUpperCase()}`;
    const state = await kv.get<RoomState>(roomKey);

    if (!state) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Filter duplicate votes to allow players to correct their selection
    state.votes = state.votes.filter((v) => v.voter !== voter);
    state.votes.push({
      voter,
      guess: guess || '',
      rating: rating || 0,
    });

    await kv.set(roomKey, state);
    return NextResponse.json(state);
  } catch (e: any) {
    console.error('Vote API Error:', e);
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 });
  }
}
