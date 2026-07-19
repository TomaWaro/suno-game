import { NextResponse } from 'next/server';
import { runTransaction } from '@/lib/kv';
import { RoomState } from '../state/route';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, nickname } = body;

    if (!roomCode || !nickname) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const trimmedNickname = nickname.trim();
    const roomKey = `room:${roomCode.toUpperCase()}`;

    let penaltySecondsRemaining = 0;
    let buzzError = '';

    const updatedState = await runTransaction<RoomState, RoomState>(roomKey, (state) => {
      if (state.phase !== 'GUESSING') {
        buzzError = 'Le jeu n\'est pas en phase de devinette.';
        return state;
      }

      if (state.songRevealed) {
        buzzError = 'La chanson a déjà été révélée !';
        return state;
      }

      // Check penalty cooldown
      const penaltyUntil = state.penalties?.[trimmedNickname] || 0;
      const now = Date.now();
      if (penaltyUntil > now) {
        penaltySecondsRemaining = Math.ceil((penaltyUntil - now) / 1000);
        buzzError = `Vous devez attendre encore ${penaltySecondsRemaining}s avant de pouvoir ré-essayer !`;
        return state;
      }

      // Initialize buzzes array if not present
      if (!state.buzzes) {
        state.buzzes = [];
      }

      // Check if already in current song's buzz queue
      const alreadyBuzzed = state.buzzes.some((b) => b.nickname === trimmedNickname);
      if (!alreadyBuzzed) {
        state.buzzes.push({
          nickname: trimmedNickname,
          timestamp: now,
        });
      }

      return state;
    });

    if (buzzError) {
      return NextResponse.json({ error: buzzError, penaltySecondsRemaining }, { status: 400 });
    }

    return NextResponse.json(updatedState);
  } catch (e: any) {
    console.error('Buzz API Error:', e);
    return NextResponse.json({ error: e.message || 'Erreur lors du buzz' }, { status: 400 });
  }
}
