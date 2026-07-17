import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { RoomState } from '../state/route';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, voter, guess, rating, roundIdx } = body;

    if (!roomCode || !voter || roundIdx === undefined) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const roomKey = `room:${roomCode.toUpperCase()}`;
    const state = await kv.get<RoomState>(roomKey);

    if (!state) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Filter duplicate votes to allow players to correct their selection for this specific round
    state.votes = state.votes.filter((v) => !(v.voter === voter && v.roundIdx === roundIdx));
    state.votes.push({
      voter,
      guess: guess || '',
      rating: rating || 0,
      roundIdx,
    });

    await kv.set(roomKey, state);
    return NextResponse.json(state);
  } catch (e: any) {
    console.error('Vote API Error:', e);
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 });
  }
}
