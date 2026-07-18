'use client';

import React, { useEffect, useState, useRef } from 'react';
import { generateRoomCode } from '@/lib/roomUtils';
import { GamePhase, Submission, Vote, ScoreState } from '@/lib/types';
import confetti from 'canvas-confetti';

interface PlayerPoints {
  nickname: string;
  points: number;
  reason: string;
}

const getEmbedUrl = (url: string) => {
  if (!url) return '';
  return url.replace('/song/', '/embed/');
};

export default function HostPage() {
  // Room identifiers
  const [roomCode, setRoomCode] = useState<string>('');
  const [hostId, setHostId] = useState<string>('');
  
  // Game states received from server
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [players, setPlayers] = useState<string[]>([]);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [scores, setScores] = useState<ScoreState>({});
  const [displayScores, setDisplayScores] = useState<ScoreState>({});

  // Local reveal states & polling counters
  const [revealedThisRound, setRevealedThisRound] = useState<boolean>(false);
  const [currentRoundVotesCount, setCurrentRoundVotesCount] = useState<number>(0);
  
  // Local inputs
  const [theme, setTheme] = useState<string>('Un morceau épique sur un codeur fatigué');
  const [roundPointsGained, setRoundPointsGained] = useState<PlayerPoints[]>([]);
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState<string>('');

  const pollingIntervalRef = useRef<any>(null);
  const isUpdatingRef = useRef<boolean>(false);

  // 1. Initial room creation setup
  useEffect(() => {
    const code = generateRoomCode();
    setRoomCode(code);
    setJoinUrl(`${window.location.origin}/play?room=${code}`);

    const newHostId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    setHostId(newHostId);
  }, []);

  const syncState = (data: any) => {
    setPhase(data.phase);
    setTheme(data.theme);
    setPlayers(data.players || []);
    setReadyPlayers(data.readyPlayers || []);
    setSubmissions(data.submissions || []);
    setVotes(data.votes || []);
    setCurrentRoundIdx(data.currentRoundIdx || 0);
    setScores(data.scores || {});
    setCurrentRoundVotesCount(data.currentRoundVotesCount || 0);
  };

  // Sync displayScores when not animating
  useEffect(() => {
    if (phase !== 'REVEAL' || !revealedThisRound) {
      setDisplayScores(scores);
    }
  }, [scores, phase, revealedThisRound]);

  // 2. Initialize room state on server and start polling
  useEffect(() => {
    if (!roomCode || !hostId) return;

    const initializeRoom = async () => {
      try {
        await fetch('/api/room/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, isHost: true, hostId }),
        });
      } catch (e) {
        console.error('Failed to initialize room state:', e);
      }
    };

    initializeRoom();

    // Start 1s polling interval
    pollingIntervalRef.current = setInterval(async () => {
      if (isUpdatingRef.current) return;
      try {
        const res = await fetch(`/api/room/state?room=${roomCode}`);
        if (res.status === 404) {
          // If room gets deleted or server restarted, re-initialize it
          await initializeRoom();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        
        syncState(data);
      } catch (err) {
        console.error('Polling state error:', err);
      }
    }, 1000);

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [roomCode, hostId]);

  // Helper to send server actions
  const sendAction = async (action: string, payload: any = {}) => {
    isUpdatingRef.current = true;
    try {
      const res = await fetch('/api/room/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, action, hostId, payload }),
      });
      if (res.ok) {
        const data = await res.json();
        syncState(data);
      } else {
        const err = await res.json();
        console.error('Action failed:', err.error);
      }
    } catch (e) {
      console.error('Network error during action:', e);
    } finally {
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 1500);
    }
  };

  const startSubmissionPhase = () => {
    sendAction('START_SUBMISSION', { theme });
  };

  const startGuessingPhase = (roundIdx: number) => {
    sendAction('START_GUESSING', { roundIdx });
  };

  const startRevealPhase = () => {
    setRoundPointsGained([]);
    setRevealedThisRound(false);
    sendAction('SET_STATE', {
      phase: 'REVEAL',
      currentRoundIdx: 0,
    });
  };

  const calculatePoints = () => {
    const currentSong = submissions[currentRoundIdx];
    const creator = currentSong.nickname;
    
    // Filter votes specifically for the current round index
    const roundVotes = votes.filter((v) => v.roundIdx === currentRoundIdx);
    const G = roundVotes.filter((v) => v.guess === creator).length;
    const P = players.length;

    const pointsList: PlayerPoints[] = [];
    const scoreDelta: ScoreState = {};

    // 1. Guesser points (500 pts)
    roundVotes.forEach((v) => {
      if (v.guess === creator) {
        pointsList.push({
          nickname: v.voter,
          points: 500,
          reason: 'Bonne réponse ! (+500)',
        });
        scoreDelta[v.voter] = (scoreDelta[v.voter] || 0) + 500;
      }
    });

    // 2. Creator points (Sweet Spot Calculation)
    if (G >= 1) {
      const maxCreatorPoints = 1000;
      const decay = 0.6;
      let creatorBasePoints = maxCreatorPoints;
      
      if (P > 2) {
        creatorBasePoints = Math.round(maxCreatorPoints * (1 - decay * ((G - 1) / (P - 2))));
      }
      
      pointsList.push({
        nickname: creator,
        points: creatorBasePoints,
        reason: `Sweet Spot: Trouvé par ${G} joueur(s) (+${creatorBasePoints})`,
      });
      scoreDelta[creator] = (scoreDelta[creator] || 0) + creatorBasePoints;
    } else {
      pointsList.push({
        nickname: creator,
        points: 0,
        reason: 'Sweet Spot: Personne ne vous a trouvé (+0)',
      });
    }

    // 3. Rating Bonus (Average star rating * 100)
    const validRatings = roundVotes.filter((v) => v.rating > 0);
    if (validRatings.length > 0) {
      const averageRating = validRatings.reduce((sum, v) => sum + v.rating, 0) / validRatings.length;
      const ratingPoints = Math.round(averageRating * 100);
      
      pointsList.push({
        nickname: creator,
        points: ratingPoints,
        reason: `Note moyenne: ${averageRating.toFixed(1)}/5★ (+${ratingPoints})`,
      });
      scoreDelta[creator] = (scoreDelta[creator] || 0) + ratingPoints;
    }

    // Update global state scores on Redis
    const nextScores = { ...scores };
    Object.keys(scoreDelta).forEach((nick) => {
      nextScores[nick] = (nextScores[nick] || 0) + scoreDelta[nick];
    });

    setRoundPointsGained(pointsList);
    setRevealedThisRound(true);
    
    // Broadcast state update to Redis
    sendAction('SET_STATE', {
      scores: nextScores,
    });

    // Trigger animation after mount
    setTimeout(() => {
      setDisplayScores(nextScores);
    }, 150);

    // Trigger confetti
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
    });
  };

  const nextRevealRound = () => {
    if (currentRoundIdx + 1 < submissions.length) {
      setRoundPointsGained([]);
      setRevealedThisRound(false);
      sendAction('SET_STATE', {
        currentRoundIdx: currentRoundIdx + 1,
      });
    } else {
      sendAction('SET_STATE', { phase: 'LEADERBOARD' });
      confetti({
        particleCount: 300,
        spread: 120,
        origin: { y: 0.6 },
      });
    }
  };

  const resetGame = () => {
    sendAction('RESET');
    setRoundPointsGained([]);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sortedLeaderboard = Object.keys(scores)
    .map((nickname) => ({ nickname, score: scores[nickname] }))
    .sort((a, b) => b.score - a.score);

  return (
    <main className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 overflow-hidden bg-[hsl(var(--bg-dark))]">
      <div className="glow-bg glow-primary top-[-100px] left-[-100px]" />
      <div className="glow-bg glow-accent bottom-[-100px] right-[-100px]" />

      <div className="w-full max-w-5xl z-10">
        
        {/* LOBBY PHASE */}
        {phase === 'LOBBY' && (
          <div className="flex flex-col md:flex-row gap-8 items-stretch justify-center">
            <div className="w-full md:w-1/2 glass-panel p-8 flex flex-col items-center text-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-bold mb-2 block">
                  Salon Créé
                </span>
                <h1 className="text-5xl font-black text-white mb-6">SunoGame</h1>
                
                <div className="flex flex-col items-center bg-[rgba(255,255,255,0.05)] rounded-2xl p-6 border border-[rgba(255,255,255,0.1)] w-full mb-6">
                  <span className="text-xs text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-1">
                    Code de la partie
                  </span>
                  <div className="text-6xl font-black tracking-widest text-[hsl(var(--primary))] select-all">
                    {roomCode || '----'}
                  </div>
                </div>

                {joinUrl && (
                  <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-white rounded-2xl shadow-xl transition-transform hover:scale-105 duration-300">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`}
                        alt="QR Code"
                        className="w-[180px] h-[180px] block"
                      />
                    </div>
                    <span className="text-xs text-[rgba(255,255,255,0.4)] mt-3">
                      Scannez le QR Code pour rejoindre directement !
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 w-full mt-4">
                <button onClick={copyToClipboard} className="btn-neon-outline text-xs w-full py-2">
                  {copied ? 'Copié !' : 'Copier le lien'}
                </button>
                
                <div className="flex flex-col gap-1.5 text-left mt-2">
                  <label className="text-[10px] text-[rgba(255,255,255,0.5)] uppercase tracking-wider">Thème / Inspiration</label>
                  <input 
                    type="text" 
                    value={theme} 
                    onChange={(e) => setTheme(e.target.value)}
                    className="bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[hsl(var(--primary))]"
                  />
                </div>

                <button 
                  disabled={players.length === 0}
                  onClick={startSubmissionPhase}
                  className={`btn-neon w-full py-3 mt-2 ${players.length === 0 ? 'opacity-50 cursor-not-allowed' : 'animate-pulse-glow'}`}
                >
                  Suivant : Création ({players.length})
                </button>
              </div>
            </div>

            <div className="w-full md:w-1/2 glass-panel p-8 min-h-[450px] flex flex-col">
              <div className="flex justify-between items-center mb-6 border-b border-[rgba(255,255,255,0.1)] pb-3">
                <h2 className="text-xl font-bold text-white">Joueurs</h2>
                <span className="text-sm px-3 py-1 rounded-full bg-[rgba(255,255,255,0.1)] font-semibold text-[hsl(var(--secondary))]">
                  {players.length}
                </span>
              </div>

              {players.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-[rgba(255,255,255,0.45)]">
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-[rgba(255,255,255,0.2)] animate-spin mb-4" />
                  <p className="text-sm">En attente de participants...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-2">
                  {players.map((nickname, idx) => (
                    <div key={idx} className="glass-panel p-4 flex items-center justify-between border-l-4 border-l-[hsl(var(--primary))] animate-fade-in">
                      <span className="font-semibold truncate text-white">{nickname}</span>
                      <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUBMISSION PHASE */}
        {phase === 'SUBMISSION' && (
          <div className="glass-panel p-8 flex flex-col items-center">
            <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-bold mb-2">Étape 2 / 5</span>
            <h1 className="text-3xl font-black text-white text-center mb-4">Phase de Création & Soumission</h1>
            
            <div className="w-full max-w-2xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-2xl p-6 text-center mb-8">
              <span className="text-xs text-[rgba(255,255,255,0.4)] uppercase tracking-wider block mb-1">Inspiration / Thème</span>
              <p className="text-2xl font-bold text-[hsl(var(--primary))]">"{theme}"</p>
            </div>

            <div className="w-full max-w-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white">Avancement ({readyPlayers.length} / {players.length})</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-8">
                {players.map((nickname, idx) => {
                  const isReady = readyPlayers.includes(nickname);
                  return (
                    <div key={idx} className={`glass-panel p-4 flex items-center justify-between border-l-4 transition-colors ${isReady ? 'border-l-[hsl(var(--success))]' : 'border-l-[rgba(255,255,255,0.2)]'}`}>
                      <span className="font-semibold text-white">{nickname}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${isReady ? 'bg-[hsla(var(--success),0.2)] text-[hsl(var(--success))]' : 'bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.4)]'}`}>
                        {isReady ? 'Prêt' : 'En création...'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                disabled={submissions.length === 0}
                onClick={() => startGuessingPhase(0)}
                className="btn-neon w-full py-4"
              >
                Lancer les votes ({submissions.length} morceau(x) soumis)
              </button>
            </div>
          </div>
        )}

        {/* GUESSING PHASE */}
        {phase === 'GUESSING' && (
          <div className="glass-panel p-8 flex flex-col items-center animate-fade-in">
            <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-bold mb-2">
              Morceau {currentRoundIdx + 1} / {submissions.length}
            </span>
            <h1 className="text-3xl font-black text-white text-center mb-6">À qui appartient ce morceau ?</h1>

            {/* Suno Iframe Embed */}
            {submissions[currentRoundIdx] && (
              <div className="w-full max-w-3xl aspect-[16/9] rounded-2xl overflow-hidden bg-black border border-[rgba(255,255,255,0.1)] shadow-2xl mb-8">
                <iframe
                  src={getEmbedUrl(submissions[currentRoundIdx].sunoUrl)}
                  className="w-full h-full border-none"
                  allow="autoplay; encrypted-media"
                  title={submissions[currentRoundIdx].title}
                />
              </div>
            )}

            <div className="w-full max-w-md flex flex-col items-center bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-[hsl(var(--primary))] animate-ping" />
                <span className="text-sm font-semibold text-white">Votes reçus : {currentRoundVotesCount} / {players.length}</span>
              </div>
              
              {currentRoundIdx + 1 < submissions.length ? (
                <button 
                  onClick={() => startGuessingPhase(currentRoundIdx + 1)}
                  className="btn-neon w-full py-3 mt-4"
                >
                  Chanson suivante ({currentRoundIdx + 1} / {submissions.length})
                </button>
              ) : (
                <button 
                  onClick={startRevealPhase}
                  className="btn-neon w-full py-3 mt-4 animate-pulse-glow"
                >
                  Terminer l'écoute et passer aux révélations
                </button>
              )}
            </div>
          </div>
        )}

        {/* REVEAL PHASE */}
        {phase === 'REVEAL' && submissions[currentRoundIdx] && (
          <div className="glass-panel p-8 flex flex-col animate-fade-in w-full">
            <div className="text-center mb-6">
              <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-bold">
                Révélation {currentRoundIdx + 1} / {submissions.length}
              </span>
            </div>

            {!revealedThisRound ? (
              <div className="flex flex-col items-center w-full">
                <h1 className="text-3xl font-black text-white text-center mb-2">Qui a créé cette chanson ?</h1>
                <h2 className="text-xl font-semibold text-[hsl(var(--secondary))] mb-6">"{submissions[currentRoundIdx].title}"</h2>

                {/* Optional replay embed */}
                <div className="w-full max-w-2xl aspect-[16/9] rounded-xl overflow-hidden bg-black border border-[rgba(255,255,255,0.05)] shadow-xl mb-8 opacity-75 hover:opacity-100 transition-opacity">
                  <iframe
                    src={getEmbedUrl(submissions[currentRoundIdx].sunoUrl)}
                    className="w-full h-full border-none"
                    allow="autoplay; encrypted-media"
                    title={submissions[currentRoundIdx].title}
                  />
                </div>

                <button 
                  onClick={calculatePoints}
                  className="btn-neon w-full max-w-md py-4 animate-pulse-glow"
                >
                  Découvrir le créateur
                </button>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row w-full gap-8">
                {/* Left Side: Song Reveal */}
                <div className="w-full md:w-1/2 flex flex-col items-center justify-center">
                  <h1 className="text-4xl font-black text-white mb-2 text-center">C'était le morceau de...</h1>
                  <h2 className="text-6xl font-black text-[hsl(var(--primary))] animate-pulse mb-8 text-center">
                    {submissions[currentRoundIdx].nickname}
                  </h2>
                  <div className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-black border border-white/10 shadow-xl mb-8">
                    <iframe
                      src={getEmbedUrl(submissions[currentRoundIdx].sunoUrl)}
                      className="w-full h-full border-none"
                      allow="autoplay; encrypted-media"
                      title={submissions[currentRoundIdx].title}
                    />
                  </div>
                  <button onClick={nextRevealRound} className="btn-neon w-full py-4">
                    {currentRoundIdx + 1 < submissions.length ? 'Révéler le morceau suivant' : 'Podium final'}
                  </button>
                </div>

                {/* Right Side: Race Track */}
                <div className="w-full md:w-1/2 flex flex-col bg-white/5 border border-white/10 rounded-3xl p-6">
                  <h3 className="font-bold text-2xl text-white mb-8 border-b border-white/10 pb-3">Course aux points</h3>
                  <div className="flex flex-col gap-10 w-full mt-4">
                    {players.map((nickname, idx) => {
                      const score = displayScores[nickname] || 0;
                      const maxScore = Math.max(2000, ...(Object.values(displayScores) as number[]));
                      const percentage = Math.min(100, Math.max(0, (score / maxScore) * 100));
                      
                      const gainedThisRound = roundPointsGained.filter(g => g.nickname === nickname);
                      const totalGained = gainedThisRound.reduce((sum, g) => sum + g.points, 0);
                      const reasons = gainedThisRound.map(g => g.reason).join(' | ');

                      return (
                        <div key={idx} className="flex flex-col gap-2 relative w-full">
                          <div className="flex justify-between items-end mb-1">
                            <span className="font-bold text-white text-lg">{nickname}</span>
                            <span className="text-[hsl(var(--secondary))] font-black text-xl">{score} pts</span>
                          </div>
                          
                          <div className="w-full h-4 bg-white/10 rounded-full relative shadow-inner">
                            <div 
                              className="absolute top-0 left-0 h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--secondary))] rounded-full transition-all duration-1000 ease-out flex items-center justify-end"
                              style={{ width: `${percentage}%` }}
                            >
                               <div className="w-10 h-10 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)] transform translate-x-5 flex items-center justify-center text-xl z-10 animate-bounce">
                                  🏎️
                               </div>

                               {totalGained > 0 && (
                                 <div className="absolute -top-14 right-0 transform translate-x-1/2 animate-fade-up-slow flex flex-col items-center">
                                    <span className="text-[hsl(var(--success))] font-black text-2xl drop-shadow-md">+{totalGained}</span>
                                    <span className="text-[10px] text-white/80 font-bold bg-black/50 px-2 py-0.5 rounded-full whitespace-nowrap mt-1">{reasons}</span>
                                 </div>
                               )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LEADERBOARD / PODIUM PHASE */}
        {phase === 'LEADERBOARD' && (
          <div className="glass-panel p-8 flex flex-col items-center">
            <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-bold mb-2">Fin de la partie</span>
            <h1 className="text-4xl font-black text-white mb-8">Classement Final</h1>

            <div className="w-full max-w-2xl flex flex-col gap-3 mb-8">
              {sortedLeaderboard.map((item, idx) => {
                let medal = '';
                if (idx === 0) medal = '🥇 ';
                else if (idx === 1) medal = '🥈 ';
                else if (idx === 2) medal = '🥉 ';
                
                return (
                  <div 
                    key={idx} 
                    className={`glass-panel p-4 flex items-center justify-between border-l-4 ${idx === 0 ? 'border-l-[hsl(var(--primary))] scale-105 shadow-xl bg-[hsla(var(--primary),0.05)]' : 'border-l-[rgba(255,255,255,0.2)]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-[rgba(255,255,255,0.4)]">#{idx + 1}</span>
                      <span className="font-bold text-lg text-white">{medal}{item.nickname}</span>
                    </div>
                    <span className="text-xl font-black text-[hsl(var(--secondary))]">{item.score} pts</span>
                  </div>
                );
              })}
            </div>

            <button onClick={resetGame} className="btn-neon-outline w-full max-w-md py-4">
              Recommencer une partie
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
