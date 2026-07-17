import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { RoomState } from '../state/route';
import { parseSunoUrl } from '@/lib/sunoUtils';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, nickname, title, sunoUrl } = body;

    if (!roomCode || !nickname || !sunoUrl) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const roomKey = `room:${roomCode.toUpperCase()}`;
    const state = await kv.get<RoomState>(roomKey);

    if (!state) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const embedUrl = parseSunoUrl(sunoUrl);
    if (!embedUrl) {
      return NextResponse.json({ error: 'Lien Suno invalide' }, { status: 400 });
    }

    // Filter duplicates to prevent multiple submissions by same player
    state.submissions = state.submissions.filter((s) => s.nickname !== nickname);
    state.submissions.push({
      nickname,
      title: title || 'Sans titre',
      sunoUrl: embedUrl,
    });

    if (!state.readyPlayers.includes(nickname)) {
      state.readyPlayers.push(nickname);
    }

    await kv.set(roomKey, state);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
