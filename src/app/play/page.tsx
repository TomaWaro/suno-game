'use client';

import React, { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { GamePhase } from '@/lib/types';

function PlayLobbyContent() {
  const searchParams = useSearchParams();
  
  // Lobby state
  const [roomCode, setRoomCode] = useState<string>('');
  const [nickname, setNickname] = useState<string>('');
  const [joined, setJoined] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  
  // Game states polled from server
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [theme, setTheme] = useState<string>('');
  const [playersList, setPlayersList] = useState<string[]>([]);
  const [songTitle, setSongTitle] = useState<string>('');
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [serverVotes, setServerVotes] = useState<any[]>([]);
  
  // Form submissions
  const [songUrl, setSongUrl] = useState<string>('');
  const [submittedSong, setSubmittedSong] = useState<boolean>(false);
  const [creatorGuess, setCreatorGuess] = useState<string>('');
  const [songRating, setSongRating] = useState<number>(0);
  const [submittedVote, setSubmittedVote] = useState<boolean>(false);
  
  // Safety self-voting exclusion key
  const [songCreatorExclusion, setSongCreatorExclusion] = useState<string>('');

  const pollingIntervalRef = useRef<any>(null);
  const isUpdatingRef = useRef<boolean>(false);

  // Parse room query parameter on load
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) {
      setRoomCode(roomParam);
    }
  }, [searchParams]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  // Sync and reset song form when phase changes to SUBMISSION
  useEffect(() => {
    if (phase === 'SUBMISSION' && !readyPlayers.includes(nickname)) {
      setSubmittedSong(false);
      setSongUrl('');
      setSongTitle('');
    }
  }, [phase]);

  // Auto-lock song form if server says we already submitted
  useEffect(() => {
    if (phase === 'SUBMISSION' && readyPlayers.includes(nickname)) {
      setSubmittedSong(true);
    }
  }, [readyPlayers, phase, nickname]);

  // Reset vote form precisely when the round index changes
  useEffect(() => {
    setSubmittedVote(false);
    setCreatorGuess('');
    setSongRating(0);
  }, [currentRoundIdx]);

  // Auto-lock vote form if server says we already voted for this round
  useEffect(() => {
    if (phase === 'GUESSING') {
      const userVoteSubmitted = serverVotes.some(
        (v: any) => v.voter === nickname && v.roundIdx === currentRoundIdx
      );
      if (userVoteSubmitted) {
        setSubmittedVote(true);
      }
    }
  }, [serverVotes, currentRoundIdx, phase, nickname]);

  // Handle room joining
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || !nickname) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, nickname }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Impossible de rejoindre le salon.');
        setLoading(false);
        return;
      }

      setJoined(true);
      setLoading(false);

      // Start polling state
      pollingIntervalRef.current = setInterval(async () => {
        if (isUpdatingRef.current) return;
        try {
          const stateRes = await fetch(`/api/room/state?room=${roomCode}`);
          if (!stateRes.ok) return;
          const state = await stateRes.json();

          // Sync loop values
          setPhase(state.phase);
          setTheme(state.theme);
          setPlayersList(state.players || []);
          setReadyPlayers(state.readyPlayers || []);
          setServerVotes(state.votes || []);
          
          if (state.currentRoundIdx !== undefined) {
            setCurrentRoundIdx(state.currentRoundIdx);
          }
          
          if (state.submissions && state.currentRoundIdx !== undefined) {
            const currentSong = state.submissions[state.currentRoundIdx];
            if (currentSong) {
              setSongTitle(currentSong.title);
            }
          }
          
          if (state.currentSongCreator) {
            setSongCreatorExclusion(state.currentSongCreator);
          }
        } catch (err) {
          console.error('State polling error:', err);
        }
      }, 1000);

    } catch (err) {
      setError('Une erreur est survenue.');
      setLoading(false);
    }
  };

  // Submit Suno URL anonymously
  const submitSong = async () => {
    if (!songUrl) return;
    isUpdatingRef.current = true;
    try {
      const res = await fetch('/api/room/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, nickname, title: songTitle, sunoUrl: songUrl }),
      });

      if (res.ok) {
        setSubmittedSong(true);
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de la soumission.');
      }
    } catch (e) {
      console.error('Song submission error:', e);
    } finally {
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 1500);
    }
  };

  // Submit anonymous vote & rating
  const submitVote = async () => {
    // If it's the player's own song, they don't vote (only rate)
    const isSelfSong = songCreatorExclusion === nickname;
    if (!creatorGuess && !isSelfSong) return;

    isUpdatingRef.current = true;
    try {
      const res = await fetch('/api/room/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          voter: nickname,
          guess: isSelfSong ? '' : creatorGuess,
          rating: songRating,
          roundIdx: currentRoundIdx,
        }),
      });

      if (res.ok) {
        setSubmittedVote(true);
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de l\'envoi du vote.');
      }
    } catch (e) {
      console.error('Vote submission error:', e);
    } finally {
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 1500);
    }
  };

  if (joined) {
    return (
      <div className="w-full max-w-md flex flex-col items-center justify-center gap-6">
        
        {/* LOBBY PHASE */}
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

        {/* SUBMISSION FORM */}
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
                    value={songUrl}
                    onChange={(e) => setSongUrl(e.target.value)}
                    placeholder="https://suno.com/song/..."
                    className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-[hsl(var(--secondary))]"
                  />
                </div>

                <button 
                  disabled={!songUrl}
                  onClick={submitSong}
                  className="btn-neon w-full py-3 mt-2"
                >
                  Envoyer mon morceau
                </button>
              </div>
            )}
          </div>
        )}

        {/* GUESSING PHASE */}
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
                
                {/* Self-voting protection */}
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
                        .filter((p) => p !== nickname) // Exclude voter's own nickname
                        .map((name, idx) => (
                          <div
                            key={idx}
                            onClick={() => setCreatorGuess(name)}
                            className="p-3 rounded-xl border text-sm font-semibold transition-all cursor-pointer text-center"
                            style={{
                              borderColor: creatorGuess === name ? 'hsl(330, 100%, 50%)' : 'rgba(255,255,255,0.1)',
                              backgroundColor: creatorGuess === name ? 'rgba(236, 72, 153, 0.25)' : 'rgba(255,255,255,0.03)',
                              color: creatorGuess === name ? '#ffffff' : 'rgba(255,255,255,0.6)',
                              boxShadow: creatorGuess === name ? '0 0 15px rgba(236, 72, 153, 0.4)' : 'none'
                            }}
                          >
                            {name}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Rating selection (everyone rates!) */}
                <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4 flex flex-col items-center">
                  <label className="text-xs text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-1">
                    Note du morceau
                  </label>
                  <div className="flex justify-center items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <div
                        key={star}
                        onClick={() => setSongRating(star)}
                        className="p-2 transition-all transform active:scale-125 cursor-pointer"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="48"
                          height="48"
                          fill={songRating >= star ? '#fbbf24' : 'rgba(255,255,255,0.2)'}
                          style={{
                            width: '48px',
                            height: '48px',
                            filter: songRating >= star ? 'drop-shadow(0 0 8px rgba(251,191,36,0.6))' : 'none'
                          }}
                        >
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      </div>
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
              Regardez l'écran central pour voir le créateur du morceau et les scores attribués !
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

  // Join Form (Lobby connection)
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
