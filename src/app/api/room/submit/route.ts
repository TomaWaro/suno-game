import { NextResponse } from 'next/server';
import { runTransaction } from '@/lib/kv';
import { RoomState } from '../state/route';
import { parseSunoUrl } from '@/lib/sunoUtils';
import { parseYouTubeUrl } from '@/lib/youtubeUtils';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomCode, nickname, title, sunoUrl } = body;

    if (!roomCode || !nickname || !sunoUrl) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const trimmedNickname = nickname.trim();
    const roomKey = `room:${roomCode.toUpperCase()}`;

    let resolvedUrl = sunoUrl;
    
    // Resolve short suno.com/s/ share links
    if (sunoUrl.includes('/s/')) {
      try {
        const res = await fetch(sunoUrl, { 
          method: 'GET', 
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        resolvedUrl = res.url;
      } catch (e) {
        console.error('Failed to resolve Suno short link:', e);
      }
    }

    // Attempt YouTube parsing first, then Suno parsing
    let embedUrl = parseYouTubeUrl(resolvedUrl);
    let songType: 'YOUTUBE' | 'SUNO' = 'YOUTUBE';

    if (!embedUrl) {
      embedUrl = parseSunoUrl(resolvedUrl);
      songType = 'SUNO';
    }

    if (!embedUrl) {
      return NextResponse.json({ error: 'Lien Suno ou YouTube invalide' }, { status: 400 });
    }

    // Atomic update of submissions and readyPlayers
    const updatedState = await runTransaction<RoomState, RoomState>(roomKey, (state) => {
      // Filter duplicates to prevent multiple submissions by same player
      state.submissions = (state.submissions || []).filter((s) => s.nickname !== trimmedNickname);
      state.submissions.push({
        nickname: trimmedNickname,
        title: title || 'Sans titre',
        sunoUrl: embedUrl,
        songType,
      });

      if (!state.readyPlayers.includes(trimmedNickname)) {
        state.readyPlayers.push(trimmedNickname);
      }

      return state;
    });

    return NextResponse.json(updatedState);
  } catch (e: any) {
    console.error('Submit API Error:', e);
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 });
  }
}
