'use client';

import React, { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { GamePhase } from '@/lib/types';

const COLORS = ['#ef4444', '#3b82f6', '#eab308', '#10b981', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];

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

  const autoJoinAttempted = useRef(false);

  // Parse query params and attempt auto-join from localStorage
  useEffect(() => {
    if (autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;

    const urlRoom = searchParams.get('room')?.toUpperCase();
    const savedSession = localStorage.getItem('sunogame_session');
    
    let initialRoom = urlRoom || '';
    let initialNickname = '';
    let shouldAutoJoin = false;

    if (savedSession) {
      try {
        const { savedRoom, savedNickname } = JSON.parse(savedSession);
        initialNickname = savedNickname || '';

        if (savedRoom) {
          if (!urlRoom || urlRoom === savedRoom.toUpperCase()) {
            // Match or no URL room -> auto-join
            initialRoom = savedRoom.toUpperCase();
            if (initialNickname) shouldAutoJoin = true;
          } else {
            // Different room in URL! -> do not auto-join, just pre-fill
            shouldAutoJoin = false;
          }
        }
      } catch (e) {
        console.error('Failed to parse session', e);
      }
    }

    if (initialRoom) setRoomCode(initialRoom);
    if (initialNickname) setNickname(initialNickname);

    if (shouldAutoJoin && initialRoom && initialNickname) {
      // Use setTimeout to avoid state conflicts during mount
      setTimeout(() => {
        joinRoom(initialRoom, initialNickname);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Core join logic
  const joinRoom = async (targetRoom: string, targetNickname: string) => {
    if (!targetRoom || !targetNickname) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: targetRoom, nickname: targetNickname }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Impossible de rejoindre le salon.');
        setLoading(false);
        // Clear invalid session
        localStorage.removeItem('sunogame_session');
        return;
      }

      setJoined(true);
      setLoading(false);
      
      // Save session for auto-rejoin on refresh
      localStorage.setItem('sunogame_session', JSON.stringify({
        savedRoom: targetRoom,
        savedNickname: targetNickname
      }));

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

  // Form submit handler
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    joinRoom(roomCode, nickname);
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
      <div className="w-full max-w-md flex flex-col items-center justify-center gap-6 p-2 min-h-screen">
        
        {/* LOBBY PHASE */}
        {phase === 'LOBBY' && (
          <div className="w-full glass-panel p-8 flex flex-col items-center text-center z-10 animate-fade-in gap-4">
            <span className="w-16 h-16 rounded-full bg-[hsla(var(--success),0.2)] flex items-center justify-center text-[hsl(var(--success))] text-2xl mb-2 animate-bounce font-bold">
              ✓
            </span>
            <h2 className="text-3xl font-black text-white font-headings tracking-tight">Lobby Rejoint !</h2>
            <p className="text-sm text-[rgba(255,255,255,0.6)] leading-relaxed">
              Salon : <span className="font-bold text-[hsl(var(--secondary))]">{roomCode}</span><br />
              Joueur : <span className="font-bold text-[hsl(var(--primary))]">{nickname}</span>
            </p>
            <div className="flex flex-col items-center justify-center p-6 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-2xl w-full mt-4">
              <div className="w-8 h-8 border-4 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-xs text-white/50 uppercase tracking-widest font-black">
                En attente du lancement par l'hôte...
              </span>
            </div>
          </div>
        )}

        {/* SUBMISSION FORM */}
        {phase === 'SUBMISSION' && (
          <div className="w-full glass-panel p-8 flex flex-col z-10 animate-fade-in">
            <h2 className="text-3xl font-black text-center text-white mb-6 font-headings">Création du morceau</h2>
            

            {submittedSong ? (
              <div className="text-center p-8 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl">
                <span className="text-5xl mb-4 block">🎉</span>
                <h3 className="font-black text-white text-lg mb-1">Morceau envoyé !</h3>
                <p className="text-xs text-[rgba(255,255,255,0.5)]">Préparez-vous pour l'écoute...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-[rgba(255,255,255,0.6)] uppercase tracking-wider font-bold">Lien direct Suno AI</label>
                  <input
                    type="url"
                    value={songUrl}
                    onChange={(e) => setSongUrl(e.target.value)}
                    placeholder="https://suno.com/song/..."
                    className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl px-4 py-3.5 text-white text-sm focus:outline-none focus:border-[hsl(var(--secondary))]"
                  />
                </div>

                <button 
                  disabled={!songUrl}
                  onClick={submitSong}
                  className="btn-neon w-full py-4 text-base font-black uppercase tracking-wider"
                >
                  Envoyer mon morceau
                </button>
              </div>
            )}
          </div>
        )}

        {/* GUESSING PHASE */}
        {phase === 'GUESSING' && (
          <div className="w-full min-h-screen flex flex-col justify-between bg-slate-900 pt-8 pb-4 px-2">
            
            {submittedVote ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-full max-w-sm bg-white/10 backdrop-blur-md p-8 rounded-3xl text-center">
                  <span className="text-6xl mb-4 block animate-bounce">⏳</span>
                  <h3 className="font-black text-white text-3xl mb-2">Vote enregistré !</h3>
                  <p className="text-white/60 font-bold">Regardez l'écran de l'hôte...</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full">
                {/* Self-voting protection */}
                {songCreatorExclusion === nickname ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <span className="text-6xl mb-4 block">🤫</span>
                    <p className="text-3xl font-black text-white mb-2">C'est votre morceau !</p>
                    <p className="text-lg text-white/60 font-bold">Vous ne pouvez pas voter. Gardez le secret !</p>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-4">
                      <h2 className="text-xl font-black text-white uppercase tracking-widest">Qui est l'auteur ?</h2>
                    </div>
                    
                    {/* Massive Voting Grid */}
                    <div className="flex-1 grid grid-cols-2 gap-2 mb-4">
                      {playersList
                        .filter((p) => p !== nickname)
                        .map((name, idx) => {
                          const buttonColor = COLORS[idx % COLORS.length];
                          const isSelected = creatorGuess === name;
                          return (
                            <button
                              key={idx}
                              onClick={() => setCreatorGuess(name)}
                              className="rounded-xl flex flex-col items-center justify-center shadow-lg transition-transform active:scale-95 relative overflow-hidden"
                              style={{
                                backgroundColor: buttonColor,
                                border: isSelected ? '4px solid white' : 'none',
                                opacity: isSelected ? 1 : 0.9,
                              }}
                            >
                              {isSelected && (
                                <div className="absolute inset-0 border-8 border-white/20 pointer-events-none rounded-xl" />
                              )}
                              <span className="text-4xl mb-2 drop-shadow-md">
                                {['🎵', '🎸', '🎹', '🥁', '🎷', '🎤', '🎻', '🎺'][idx % 8]}
                              </span>
                              <span className="text-white font-black text-xl truncate w-full px-2 drop-shadow-md">
                                {name}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}

                {/* Rating selection (everyone rates!) */}
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex flex-col items-center mb-4">
                  <label className="text-sm text-white font-bold uppercase tracking-widest mb-3">
                    Notez ce morceau !
                  </label>
                  <div className="flex justify-center items-center gap-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setSongRating(star)}
                        className="transition-transform active:scale-125 focus:outline-none"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="w-10 h-10 md:w-12 md:h-12 drop-shadow-lg"
                          fill={songRating >= star ? '#fbbf24' : 'rgba(255,255,255,0.2)'}
                        >
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  disabled={(!creatorGuess && songCreatorExclusion !== nickname) || songRating === 0}
                  onClick={submitVote}
                  className={`w-full py-5 rounded-xl font-black text-2xl uppercase tracking-wider text-white transition-all shadow-[0_6px_0_rgba(0,0,0,0.3)] ${
                    (!creatorGuess && songCreatorExclusion !== nickname) || songRating === 0
                      ? 'bg-slate-500 opacity-50 cursor-not-allowed'
                      : 'bg-blue-600 active:translate-y-2 active:shadow-none'
                  }`}
                >
                  Valider
                </button>
              </div>
            )}
          </div>
        )}

        {/* REVEAL & LEADERBOARD PLACES */}
        {phase === 'REVEAL' && (
          <div className="w-full glass-panel p-8 text-center z-10 animate-fade-in gap-4 flex flex-col items-center">
            <span className="text-5xl mb-2 block animate-pulse">👀</span>
            <h2 className="text-2xl font-black text-white font-headings">Révélation en cours...</h2>
            <p className="text-sm text-[rgba(255,255,255,0.5)] leading-relaxed">
              Regardez l'écran central pour voir le créateur et le classement du Hit-Parade !
            </p>
          </div>
        )}

        {phase === 'LEADERBOARD' && (
          <div className="w-full glass-panel p-8 text-center z-10 animate-fade-in gap-4 flex flex-col items-center">
            <span className="text-5xl mb-2 block animate-bounce">🏆</span>
            <h2 className="text-2xl font-black text-white font-headings">Partie terminée !</h2>
            <p className="text-sm text-[rgba(255,255,255,0.5)] leading-relaxed">
              Découvrez les grands vainqueurs sur le podium de l'écran principal !
            </p>
          </div>
        )}

      </div>
    );
  }

  // Join Form (Lobby connection)
  return (
    <form onSubmit={handleJoin} className="w-full max-w-md glass-panel p-8 flex flex-col z-10 gap-6 animate-fade-in">
      <h2 className="text-4xl font-black text-center text-white mb-2 font-headings tracking-tight">SunoGame</h2>
      <p className="text-center text-sm text-white/50">Rejoins la partie sur ton téléphone !</p>
      
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/35 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-white/60 uppercase tracking-wider font-bold">
            Code PIN du salon
          </label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Ex: 1234"
            maxLength={6}
            disabled={loading}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-3xl font-black tracking-widest text-center focus:outline-none focus:border-[hsl(var(--secondary))] transition-all font-headings"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-white/60 uppercase tracking-wider font-bold">
            Ton Pseudo
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Pseudo..."
            maxLength={15}
            disabled={loading}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-2xl font-black text-center focus:outline-none focus:border-[hsl(var(--primary))] transition-all font-headings"
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !roomCode || !nickname}
        className="btn-neon w-full py-4 text-lg font-black uppercase tracking-wider mt-4"
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
