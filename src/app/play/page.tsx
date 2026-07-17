'use client';

import React, { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { GamePhase } from '@/lib/types';

function PlayLobbyContent() {
  const searchParams = useSearchParams();
  const [roomCode, setRoomCode] = useState<string>('');
  const [nickname, setNickname] = useState<string>('');
  const [joined, setJoined] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  
  // Game states received from host
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [theme, setTheme] = useState<string>('');
  const [playersList, setPlayersList] = useState<string[]>([]);
  const [songTitle, setSongTitle] = useState<string>('');
  const [sunoUrl, setSunoUrl] = useState<string>('');
  const [submittedSong, setSubmittedSong] = useState<boolean>(false);

  // Voting states
  const [creatorGuess, setCreatorGuess] = useState<string>('');
  const [songRating, setSongRating] = useState<number>(0);
  const [submittedVote, setSubmittedVote] = useState<boolean>(false);
  const [songCreatorExclusion, setSongCreatorExclusion] = useState<string>('');

  const channelRef = useRef<any>(null);

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) {
      setRoomCode(roomParam);
    }
  }, [searchParams]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || !nickname) return;

    setLoading(true);
    setError('');

    try {
      const channel = supabase.channel(`room_${roomCode}`, {
        config: {
          presence: {
            key: nickname,
          },
        },
      });

      channelRef.current = channel;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const list: string[] = [];
          Object.keys(state).forEach((key) => {
            const presences = state[key] as any[];
            presences.forEach((p) => {
              if (p.nickname && !p.isHost) {
                list.push(p.nickname);
              }
            });
          });
          setPlayersList(list);
        })
        .on('broadcast', { event: 'phase_change' }, (payload) => {
          const { phase: nextPhase, theme: nextTheme, currentSongTitle, creator } = payload.payload;
          setPhase(nextPhase);
          if (nextTheme) setTheme(nextTheme);
          if (currentSongTitle) setSongTitle(currentSongTitle);
          if (creator) setSongCreatorExclusion(creator);

          // Reset forms on phase reset/change
          if (nextPhase === 'SUBMISSION') {
            setSubmittedSong(false);
            setSunoUrl('');
          }
          if (nextPhase === 'GUESSING') {
            setSubmittedVote(false);
            setCreatorGuess('');
            setSongRating(0);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ nickname, isHost: false, isReady: false });
            setJoined(true);
          } else {
            setError('Impossible de rejoindre le salon.');
            setLoading(false);
          }
        });
    } catch (err) {
      setError('Une erreur est survenue.');
      setLoading(false);
    }
  };

  const submitSong = () => {
    if (!sunoUrl) return;
    
    // Broadcast anonymously to the private host channel
    const hostChannel = supabase.channel(`room_${roomCode}_host`);
    hostChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        hostChannel.send({
          type: 'broadcast',
          event: 'song_submitted',
          payload: { nickname, title: songTitle || 'Sans titre', sunoUrl },
        });
        setSubmittedSong(true);
        
        // Track updated ready status in presence
        if (channelRef.current) {
          await channelRef.current.track({ nickname, isHost: false, isReady: true });
        }
      }
    });
  };

  const submitVote = () => {
    if (!creatorGuess) return;

    // Send vote anonymously to the host
    const hostChannel = supabase.channel(`room_${roomCode}_host`);
    hostChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        hostChannel.send({
          type: 'broadcast',
          event: 'vote_submitted',
          payload: { voter: nickname, guess: creatorGuess, rating: songRating },
        });
        setSubmittedVote(true);
      }
    });
  };

  // Render Joined/Lobby State
  if (joined) {
    return (
      <div className="w-full max-w-md flex flex-col items-center justify-center gap-6">
        
        {/* Waiting in Lobby */}
        {phase === 'LOBBY' && (
          <div className="w-full glass-panel p-8 flex flex-col items-center text-center z-10 animate-fade-in">
            <span className="w-12 h-12 rounded-full bg-[hsla(var(--success),0.2)] flex items-center justify-center text-[hsl(var(--success))] mb-4 animate-bounce font-bold">
              ✓
            </span>
            <h2 className="text-2xl font-bold text-white mb-2 font-headings">Lobby Rejoint</h2>
            <p className="text-sm text-[rgba(255,255,255,0.6)] mb-6">
              Salon : <span className="font-bold text-[hsl(var(--secondary))]">{roomCode}</span><br />
              Pseudo : <span className="font-bold text-[hsl(var(--primary))]">{nickname}</span>
            </p>
            <div className="flex flex-col items-center justify-center p-4 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full">
              <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin mb-3" />
              <span className="text-xs text-[rgba(255,255,255,0.5)]">
                En attente du lancement par l'hôte...
              </span>
            </div>
          </div>
        )}

        {/* Submission Form */}
        {phase === 'SUBMISSION' && (
          <div className="w-full glass-panel p-8 flex flex-col z-10 animate-fade-in">
            <h2 className="text-2xl font-bold text-center text-white mb-4">Créez votre chanson !</h2>
            
            <div className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-4 text-center mb-6">
              <span className="text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider block mb-1">Thème imposé</span>
              <p className="text-md font-bold text-[hsl(var(--primary))]">"{theme}"</p>
            </div>

            {submittedSong ? (
              <div className="text-center p-6 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl">
                <span className="text-4xl mb-3 block">🎉</span>
                <h3 className="font-bold text-white mb-1">Morceau envoyé !</h3>
                <p className="text-xs text-[rgba(255,255,255,0.5)]">Attente des autres joueurs...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[rgba(255,255,255,0.6)] uppercase tracking-wider">Titre de la chanson</label>
                  <input
                    type="text"
                    value={songTitle}
                    onChange={(e) => setSongTitle(e.target.value)}
                    placeholder="Ex: Toast in the Rain"
                    className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[hsl(var(--primary))]"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[rgba(255,255,255,0.6)] uppercase tracking-wider">Lien direct Suno AI</label>
                  <input
                    type="url"
                    value={sunoUrl}
                    onChange={(e) => setSunoUrl(e.target.value)}
                    placeholder="https://suno.com/song/..."
                    className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-[hsl(var(--secondary))]"
                  />
                </div>

                <button 
                  disabled={!sunoUrl}
                  onClick={submitSong}
                  className="btn-neon w-full py-3 mt-2"
                >
                  Envoyer mon morceau
                </button>
              </div>
            )}
          </div>
        )}

        {/* Voting & Guessing */}
        {phase === 'GUESSING' && (
          <div className="w-full glass-panel p-8 flex flex-col z-10 animate-fade-in">
            <h2 className="text-xl font-bold text-center text-white mb-2">Vote & Estimation</h2>
            <p className="text-xs text-[rgba(255,255,255,0.5)] text-center mb-6">
              Morceau écouté : <span className="text-[hsl(var(--secondary))] font-bold">"{songTitle}"</span>
            </p>

            {submittedVote ? (
              <div className="text-center p-6 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl">
                <span className="text-4xl mb-3 block">🗳️</span>
                <h3 className="font-bold text-white mb-1">Vote enregistré !</h3>
                <p className="text-xs text-[rgba(255,255,255,0.5)]">Regardez l'écran central pour la révélation.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Exclude creator from voting for themselves */}
                {songCreatorExclusion === nickname ? (
                  <div className="p-4 bg-[rgba(255,255,255,0.05)] rounded-xl text-center border border-[rgba(255,255,255,0.1)]">
                    <p className="text-sm font-semibold text-[hsl(var(--primary))]">C'est votre morceau !</p>
                    <p className="text-xs text-[rgba(255,255,255,0.4)] mt-1">Vous ne pouvez pas voter sur votre propre chanson.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-[rgba(255,255,255,0.6)] uppercase tracking-wider mb-1">
                      Qui a créé ce morceau ?
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                      {playersList
                        .filter((p) => p !== nickname) // Exclude oneself from the list of choices
                        .map((name, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setCreatorGuess(name)}
                            className={`p-3 rounded-xl border text-sm font-semibold text-white transition-all ${creatorGuess === name ? 'border-[hsl(var(--primary))] bg-[hsla(var(--primary),0.1)]' : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)]'}`}
                          >
                            {name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Rating (Open to all, including creator!) */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-[rgba(255,255,255,0.6)] uppercase tracking-wider">
                    Notez le morceau
                  </label>
                  <div className="flex justify-between items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSongRating(star)}
                        className={`text-3xl transition-transform active:scale-90 ${songRating >= star ? 'text-yellow-400' : 'text-[rgba(255,255,255,0.2)]'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  disabled={(!creatorGuess && songCreatorExclusion !== nickname) || songRating === 0}
                  onClick={submitVote}
                  className="btn-neon w-full py-3"
                >
                  Envoyer le vote
                </button>
              </div>
            )}
          </div>
        )}

        {/* REVEAL & LEADERBOARD PLACES */}
        {phase === 'REVEAL' && (
          <div className="w-full glass-panel p-8 text-center z-10 animate-fade-in">
            <span className="text-4xl mb-4 block">👀</span>
            <h2 className="text-2xl font-bold text-white mb-2">Révélation en cours...</h2>
            <p className="text-xs text-[rgba(255,255,255,0.5)]">
              Regardez l'écran central pour voir qui a créé la chanson et découvrir les scores !
            </p>
          </div>
        )}

        {phase === 'LEADERBOARD' && (
          <div className="w-full glass-panel p-8 text-center z-10 animate-fade-in">
            <span className="text-4xl mb-4 block">🏆</span>
            <h2 className="text-2xl font-bold text-white mb-2">Partie terminée !</h2>
            <p className="text-xs text-[rgba(255,255,255,0.5)]">
              Découvrez le gagnant sur le podium final de l'écran principal !
            </p>
          </div>
        )}

      </div>
    );
  }

  // Lobby Input Form (First join screen)
  return (
    <form onSubmit={handleJoin} className="w-full max-w-md glass-panel p-8 flex flex-col z-10">
      <h2 className="text-3xl font-black text-center text-white mb-6">Rejoindre la partie</h2>
      
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-red-400 text-xs text-center">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-[rgba(255,255,255,0.6)] uppercase tracking-wider">
            Code de salon (Room PIN)
          </label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Ex: 1234"
            maxLength={6}
            disabled={loading}
            className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3 text-white text-lg font-bold tracking-widest text-center focus:outline-none focus:border-[hsl(var(--secondary))] transition-colors"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-[rgba(255,255,255,0.6)] uppercase tracking-wider">
            Votre pseudo
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Ex: Johnny"
            maxLength={15}
            disabled={loading}
            className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3 text-white text-lg font-semibold text-center focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !roomCode || !nickname}
        className="btn-neon w-full py-3"
      >
        {loading ? 'Connexion...' : 'Prêt à Jouer !'}
      </button>
    </form>
  );
}

export default function PlayPage() {
  return (
    <main className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 overflow-hidden bg-[hsl(var(--bg-dark))]">
      {/* Background Glows */}
      <div className="glow-bg glow-primary top-[-50px] right-[-50px]" />
      <div className="glow-bg glow-accent bottom-[-50px] left-[-50px]" />

      <Suspense fallback={<div className="text-white text-center">Chargement...</div>}>
        <PlayLobbyContent />
      </Suspense>
    </main>
  );
}
