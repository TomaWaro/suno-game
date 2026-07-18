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
  const [animationSteps, setAnimationSteps] = useState<PlayerPoints[][]>([]);
  const [animationStepIdx, setAnimationStepIdx] = useState<number>(-1);
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState<string>('');

  // Kahoot-style Suspense & Podium states
  const [isSuspense, setIsSuspense] = useState<boolean>(false);
  const [suspenseName, setSuspenseName] = useState<string>('');
  const [podiumRevealStep, setPodiumRevealStep] = useState<number>(3); 

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

  // Handle sequential animation steps
  useEffect(() => {
    if (phase === 'REVEAL' && revealedThisRound && animationStepIdx >= 0 && animationStepIdx < animationSteps.length) {
      const currentStepPoints = animationSteps[animationStepIdx];
      
      // 1. Show floating text
      setRoundPointsGained(currentStepPoints);
      
      // 2. Advance car
      setDisplayScores(prev => {
        const next = { ...prev };
        currentStepPoints.forEach(p => {
          next[p.nickname] = (next[p.nickname] || 0) + p.points;
        });
        return next;
      });

      // 3. Schedule next step
      const timer = setTimeout(() => {
        setAnimationStepIdx(idx => idx + 1);
      }, 2500);

      return () => clearTimeout(timer);
    } else if (animationStepIdx === animationSteps.length && animationSteps.length > 0) {
      // Sequence finished
      const timer = setTimeout(() => {
        setRoundPointsGained([]); // hide popups smoothly after a while
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [phase, revealedThisRound, animationStepIdx, animationSteps]);

  // Automatic Kahoot-style Podium Animation Sequence
  useEffect(() => {
    if (phase === 'LEADERBOARD') {
      if (podiumRevealStep === 3) {
        const timer = setTimeout(() => setPodiumRevealStep(2), 2000);
        return () => clearTimeout(timer);
      } else if (podiumRevealStep === 2) {
        const timer = setTimeout(() => setPodiumRevealStep(1), 2000);
        return () => clearTimeout(timer);
      } else if (podiumRevealStep === 1) {
        const timer = setTimeout(() => {
          setPodiumRevealStep(0);
          confetti({
            particleCount: 400,
            spread: 120,
            origin: { y: 0.6 },
          });
        }, 4000);
        return () => clearTimeout(timer);
      }
    } else if (podiumRevealStep !== 3) {
      setPodiumRevealStep(3); // Reset when not in leaderboard
    }
  }, [phase, podiumRevealStep]);

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
    setAnimationSteps([]);
    setAnimationStepIdx(-1);
    setRevealedThisRound(false);
    setPodiumRevealStep(3);
    sendAction('SET_STATE', {
      phase: 'REVEAL',
      currentRoundIdx: 0,
    });
  };

  const startSuspenseReveal = () => {
    setIsSuspense(true);
    let duration = 3000;
    let intervalTime = 100;

    const interval = setInterval(() => {
      if (players.length > 0) {
        const randomNick = players[Math.floor(Math.random() * players.length)];
        setSuspenseName(randomNick);
      }
    }, intervalTime);

    setTimeout(() => {
      clearInterval(interval);
      setIsSuspense(false);
      calculatePoints();
    }, duration);
  };

  const calculatePoints = () => {
    const currentSong = submissions[currentRoundIdx];
    const creator = currentSong.nickname;
    
    // Filter votes specifically for the current round index
    const roundVotes = votes.filter((v) => v.roundIdx === currentRoundIdx);
    const G = roundVotes.filter((v) => v.guess === creator).length;
    const P = players.length;

    const steps: PlayerPoints[][] = [];

    // 1. Guesser points (500 pts)
    const guesserPoints: PlayerPoints[] = [];
    roundVotes.forEach((v) => {
      if (v.guess === creator) {
        guesserPoints.push({
          nickname: v.voter,
          points: 500,
          reason: '🎯 Bonne réponse !',
        });
      }
    });
    if (guesserPoints.length > 0) steps.push(guesserPoints);

    // 2. Creator points (Sweet Spot Calculation)
    const sweetSpotPoints: PlayerPoints[] = [];
    if (G >= 1) {
      const maxCreatorPoints = 1000;
      const decay = 0.6;
      let creatorBasePoints = maxCreatorPoints;
      
      if (P > 2) {
        creatorBasePoints = Math.round(maxCreatorPoints * (1 - decay * ((G - 1) / (P - 2))));
      }
      
      sweetSpotPoints.push({
        nickname: creator,
        points: creatorBasePoints,
        reason: `🕵️ Démasqué (${G} joueur${G > 1 ? 's' : ''})`,
      });
    } else {
      sweetSpotPoints.push({
        nickname: creator,
        points: 0,
        reason: 'Fantôme : Personne ne vous a trouvé !',
      });
    }
    steps.push(sweetSpotPoints);

    // 3. Rating Bonus (Average star rating * 100)
    const ratingPointsList: PlayerPoints[] = [];
    const validRatings = roundVotes.filter((v) => v.rating > 0);
    if (validRatings.length > 0) {
      const averageRating = validRatings.reduce((sum, v) => sum + v.rating, 0) / validRatings.length;
      const ratingPoints = Math.round(averageRating * 100);
      
      ratingPointsList.push({
        nickname: creator,
        points: ratingPoints,
        reason: `⭐ Note: ${averageRating.toFixed(1)}/5`,
      });
    }
    if (ratingPointsList.length > 0) steps.push(ratingPointsList);

    // Calculate final scores for Redis
    const finalScores = { ...scores };
    steps.forEach(step => {
      step.forEach(p => {
        finalScores[p.nickname] = (finalScores[p.nickname] || 0) + p.points;
      });
    });

    setAnimationSteps(steps);
    setRevealedThisRound(true);
    
    // Broadcast state update to Redis
    sendAction('SET_STATE', {
      scores: finalScores,
    });

    // Start animation sequence shortly after mount
    setTimeout(() => {
      setAnimationStepIdx(0);
    }, 500);

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
      setAnimationSteps([]);
      setAnimationStepIdx(-1);
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
    setPodiumRevealStep(3);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rawSortedLeaderboard = Object.keys(scores)
    .map((nickname) => ({ nickname, score: scores[nickname] }))
    .sort((a, b) => b.score - a.score);

  let lastRank = 1;
  const sortedLeaderboard = rawSortedLeaderboard.map((item, idx) => {
    let rank = idx + 1;
    if (idx > 0 && item.score === rawSortedLeaderboard[idx - 1].score) {
      rank = lastRank;
    } else {
      lastRank = rank;
    }
    return { ...item, rank };
  });

  return (
    <main className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 overflow-hidden bg-[hsl(var(--bg-dark))]">
      <div className="glow-bg glow-primary top-[-100px] left-[-100px]" />
      <div className="glow-bg glow-accent bottom-[-100px] right-[-100px]" />

      <div className="w-full max-w-5xl z-10">
        
        {/* LOBBY PHASE */}
        {phase === 'LOBBY' && (
          <div className="w-full min-h-screen flex flex-col pt-32 px-8">
            {/* Top White Banner (Kahoot Style) */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl bg-white rounded-xl shadow-2xl flex flex-row items-center justify-between p-6 z-20">
              <div className="flex flex-col pl-6">
                <span className="text-slate-600 font-bold text-xl md:text-2xl">
                  Rejoignez sur <span className="text-slate-900 font-black">play.suno.game</span>
                </span>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-slate-900 font-black text-4xl md:text-6xl tracking-tight">Code PIN:</span>
                  <span className="text-slate-900 font-black text-5xl md:text-7xl tracking-widest bg-slate-100 px-4 py-2 rounded-lg">{roomCode || '----'}</span>
                </div>
              </div>
              
              {joinUrl && (
                <div className="pr-6 flex items-center gap-6">
                  <div className="bg-slate-100 p-2 rounded-xl">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(joinUrl)}`}
                      alt="QR Code"
                      className="w-[120px] h-[120px] rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Start Button Container (Right Aligned) */}
            <div className="absolute top-48 right-[2.5%] md:right-[5%] z-20 flex flex-col gap-3 w-80">
              <button 
                disabled={players.length === 0}
                onClick={startSubmissionPhase}
                className={`w-full py-6 rounded-2xl font-black text-3xl uppercase tracking-wider text-white transition-all shadow-[0_8px_0_rgba(0,0,0,0.4)] ${
                  players.length === 0 
                    ? 'bg-slate-500 opacity-50 cursor-not-allowed' 
                    : 'bg-[#8b5cf6] hover:bg-[#7c3aed] hover:-translate-y-2 hover:shadow-[0_12px_0_rgba(0,0,0,0.4)] active:translate-y-2 active:shadow-none'
                }`}
              >
                Démarrer
              </button>
            </div>

            {/* Players Grid Area */}
            <div className="flex-1 mt-20 flex flex-col gap-4 max-w-6xl mx-auto w-full">
              <div className="w-full flex justify-end px-4">
                <div className="bg-white/10 backdrop-blur-sm px-6 py-2 rounded-full border border-white/20 shadow-lg">
                  <span className="text-white font-bold text-xl">{players.length} Joueur{players.length > 1 ? 's' : ''}</span>
                </div>
              </div>
              
              <div className="w-full flex flex-wrap content-start gap-4 justify-start p-4">
              
              {players.length === 0 ? (
                <div className="w-full flex items-center justify-center mt-20">
                  <span className="text-white/60 text-2xl font-bold animate-pulse">En attente de joueurs...</span>
                </div>
              ) : (
                players.map((nickname, idx) => (
                  <div 
                    key={idx} 
                    className="w-48 h-16 bg-[#8b5cf6] text-white font-extrabold text-xl px-4 py-2 rounded shadow-md flex items-center justify-center overflow-hidden animate-bounce-in"
                  >
                    <span className="truncate">{nickname}</span>
                  </div>
                ))
              )}
              </div>
            </div>
          </div>
        )}
        
        {/* SUBMISSION PHASE */}
        {phase === 'SUBMISSION' && (
          <div className="w-full min-h-screen flex flex-col pt-32 px-8">
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl bg-white rounded-xl shadow-2xl flex flex-row items-center justify-between p-6 z-20">
              <div className="flex flex-col pl-6">
                <span className="text-slate-600 font-bold text-xl">Soumission des morceaux</span>
                <span className="text-slate-900 font-black text-4xl md:text-5xl tracking-tight mt-2">Création en cours...</span>
              </div>
              <div className="pr-6">
                <div className="bg-slate-100 px-6 py-4 rounded-xl flex flex-col items-center">
                  <span className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">Avancement</span>
                  <span className="text-slate-900 font-black text-4xl">{readyPlayers.length} / {players.length}</span>
                </div>
              </div>
            </div>

            {/* Launch Game Button */}
            <div className="absolute top-48 right-[2.5%] md:right-[5%] z-20 flex flex-col gap-3 w-80">
              <button
                disabled={submissions.length === 0}
                onClick={() => startGuessingPhase(0)}
                className={`w-full py-6 rounded-2xl font-black text-2xl uppercase tracking-wider text-white transition-all shadow-[0_8px_0_rgba(0,0,0,0.4)] ${
                  submissions.length === 0 
                    ? 'bg-slate-500 opacity-50 cursor-not-allowed' 
                    : 'bg-[#8b5cf6] hover:bg-[#7c3aed] hover:-translate-y-2 hover:shadow-[0_12px_0_rgba(0,0,0,0.4)] active:translate-y-2 active:shadow-none'
                }`}
              >
                Lancer les votes !
              </button>
            </div>

            {/* Players Grid */}
            <div className="flex-1 mt-20 flex flex-wrap content-start gap-4 justify-start max-w-6xl mx-auto w-full">
              {players.map((nickname, idx) => {
                const isReady = readyPlayers.includes(nickname);
                return (
                  <div 
                    key={idx} 
                    className={`w-48 h-16 text-white font-extrabold text-xl px-4 py-2 rounded shadow-md flex items-center justify-between overflow-hidden transition-all duration-300 ${isReady ? 'bg-[#10b981]' : 'bg-[#8b5cf6]'}`}
                  >
                    <span className="truncate">{nickname}</span>
                    {isReady && <span className="ml-2 bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-sm">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* GUESSING PHASE */}
        {phase === 'GUESSING' && (
          <div className="glass-panel p-8 flex flex-col items-center animate-fade-in w-full max-w-4xl mx-auto">
            <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-black mb-2">
              Morceau {currentRoundIdx + 1} / {submissions.length}
            </span>
            <h1 className="text-4xl font-black text-white text-center mb-8 font-headings">À qui appartient ce morceau ?</h1>

            {/* Suno Iframe Embed */}
            {submissions[currentRoundIdx] && (
              <div className="w-full aspect-[16/9] rounded-3xl overflow-hidden bg-black border-2 border-white/10 shadow-2xl mb-8 transition-all hover:border-[hsl(var(--primary))]/30">
                <iframe
                  src={getEmbedUrl(submissions[currentRoundIdx].sunoUrl)}
                  className="w-full h-full border-none"
                  allow="autoplay; encrypted-media"
                  title="Suno Player"
                />
              </div>
            )}

            {/* Giant Vote progress bar */}
            <div className="w-full max-w-2xl flex flex-col items-center bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl">
              <div className="flex justify-between items-center w-full mb-3">
                <span className="text-sm font-bold text-white/60">VOTES ENREGISTRÉS</span>
                <span className="text-lg font-black text-[hsl(var(--secondary))]">{currentRoundVotesCount} / {players.length}</span>
              </div>
              
              {/* Progress bar container */}
              <div className="w-full h-5 bg-black/40 rounded-full relative overflow-hidden mb-6 shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--secondary))] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(currentRoundVotesCount / (players.length || 1)) * 100}%` }}
                />
              </div>
              
              {currentRoundIdx + 1 < submissions.length ? (
                <button 
                  onClick={() => startGuessingPhase(currentRoundIdx + 1)}
                  className="btn-neon w-full py-4 text-base font-black uppercase tracking-wider"
                >
                  Chanson suivante
                </button>
              ) : (
                <button 
                  onClick={startRevealPhase}
                  className="btn-neon w-full py-4 text-base font-black uppercase tracking-wider animate-pulse-glow"
                >
                  Terminer l'écoute & passer aux révélations
                </button>
              )}
            </div>
          </div>
        )}

        {/* REVEAL PHASE */}
        {phase === 'REVEAL' && submissions[currentRoundIdx] && (
          <div className="glass-panel p-8 flex flex-col animate-fade-in w-full">
            <div className="text-center mb-6">
              <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-black">
                Révélation {currentRoundIdx + 1} / {submissions.length}
              </span>
            </div>

            <div className="flex flex-col md:flex-row w-full gap-8">
              {/* Left Side: Guessing or Reveal */}
              <div className="w-full md:w-1/2 flex flex-col items-center justify-center">
                {isSuspense ? (
                  /* Suspense machine / slot machine */
                  <div className="flex flex-col items-center justify-center p-8 bg-black/40 border border-white/10 rounded-2xl w-full aspect-[16/9] shadow-2xl">
                    <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-black mb-4 animate-pulse">
                      🥁 ROULEMENT DE TAMBOUR...
                    </span>
                    <div className="text-5xl font-black text-white p-6 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] rounded-2xl shadow-[0_0_30px_hsla(var(--primary),0.6)] animate-pulse uppercase tracking-wider font-headings">
                      {suspenseName}
                    </div>
                  </div>
                ) : !revealedThisRound ? (
                  <>
                    <h1 className="text-3xl font-black text-white text-center mb-4 font-headings">Qui a créé cette chanson ?</h1>
                    
                    {/* Replay embed */}
                    <div className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-black border border-[rgba(255,255,255,0.05)] shadow-xl mb-8 opacity-75 hover:opacity-100 transition-opacity" style={{ width: '100%' }}>
                      <iframe
                        src={getEmbedUrl(submissions[currentRoundIdx].sunoUrl)}
                        className="w-full h-full border-none"
                        allow="autoplay; encrypted-media"
                        title="Suno Player"
                      />
                    </div>

                    <button 
                      onClick={startSuspenseReveal}
                      className="btn-neon w-full py-4 animate-pulse-glow text-lg font-black uppercase tracking-wider"
                    >
                      Découvrir le créateur 🕵️
                    </button>
                  </>
                ) : (
                  <>
                    <h1 className="text-4xl font-black text-white mb-2 text-center">C'était le morceau de...</h1>
                    <h2 className="text-6xl font-black text-[hsl(var(--primary))] animate-pulse mb-8 text-center font-headings">
                      {submissions[currentRoundIdx].nickname}
                    </h2>
                    <div className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-black border border-white/10 shadow-xl mb-8" style={{ width: '100%' }}>
                      <iframe
                        src={getEmbedUrl(submissions[currentRoundIdx].sunoUrl)}
                        className="w-full h-full border-none"
                        allow="autoplay; encrypted-media"
                        title="Suno Player"
                      />
                    </div>
                    <button onClick={nextRevealRound} className="btn-neon w-full py-4 text-base font-black uppercase tracking-wider">
                      {currentRoundIdx + 1 < submissions.length ? 'Révéler le morceau suivant' : 'Podium final 🏆'}
                    </button>
                  </>
                )}
              </div>

              {/* Right Side: Race Track */}
              <div className="w-full md:w-1/2 flex flex-col rounded-3xl p-6" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', width: '100%', display: 'flex', flexDirection: 'column' }}>
                <h3 className="font-bold text-2xl text-white mb-8 border-b pb-3" style={{ borderBottomColor: 'rgba(255,255,255,0.1)' }}>🎧 Le Hit-Parade</h3>
                <div className="flex flex-col gap-10 w-full mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%' }}>
                  {players.map((nickname, idx) => {
                    const score = displayScores[nickname] || 0;
                    const maxScore = Math.max(2000, ...(Object.values(displayScores) as number[]));
                    const percentage = Math.min(100, Math.max(0, (score / maxScore) * 100));
                    
                    const gainedThisRound = roundPointsGained.filter(g => g.nickname === nickname);
                    const totalGained = gainedThisRound.reduce((sum, g) => sum + g.points, 0);
                    const reasons = gainedThisRound.map(g => g.reason).join(' | ');

                    return (
                      <div key={idx} className="flex flex-col gap-2 relative w-full" style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '2rem' }}>
                        <div className="flex justify-between items-end mb-1" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span className="font-bold text-white text-lg">{nickname}</span>
                          <span className="text-[hsl(var(--secondary))] font-black text-xl">{score} pts</span>
                        </div>
                        
                        <div className="w-full h-4 rounded-full relative shadow-inner" style={{ width: '100%', height: '16px', backgroundColor: 'rgba(255,255,255,0.1)', position: 'relative' }}>
                          <div 
                            className="absolute top-0 left-0 h-full rounded-full flex items-center justify-end"
                            style={{ 
                              width: `${percentage}%`,
                              background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--secondary)))',
                              transition: 'width 1000ms ease-out',
                              height: '100%',
                              position: 'absolute',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end'
                            }}
                          >
                             <div className="w-10 h-10 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)] transform translate-x-5 flex items-center justify-center text-xl z-10 animate-bounce" style={{ position: 'absolute', right: '-20px', transform: 'scaleX(-1)' }}>
                                🏎️
                             </div>

                             {totalGained > 0 && (
                               <div key={animationStepIdx} className="absolute -top-14 right-0 transform translate-x-1/2 animate-fade-up-slow flex flex-col items-center" style={{ position: 'absolute', top: '-60px', right: '-20px', zIndex: 50 }}>
                                  <span className="font-black text-3xl" style={{ color: '#FFD700', textShadow: '0 0 10px rgba(255, 215, 0, 0.8), 0 2px 4px rgba(0,0,0,0.8)' }}>+{totalGained}</span>
                                  <span className="font-bold px-3 py-1 rounded-full whitespace-nowrap mt-1 shadow-lg" style={{ backgroundColor: 'hsl(var(--primary))', color: 'white', fontSize: '12px', border: '1px solid rgba(255,255,255,0.3)' }}>{reasons}</span>
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
          </div>
        )}

        {/* LEADERBOARD / PODIUM PHASE */}
        {phase === 'LEADERBOARD' && (
          <div className="w-full min-h-screen flex flex-col pt-16 px-8 items-center justify-between">
            <div className="text-center mt-8">
              <span className="text-xl uppercase tracking-widest text-slate-300 font-black mb-2 block">Fin de la partie</span>
              <h1 className="text-6xl font-black text-white font-headings tracking-widest drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">Podium Final</h1>
            </div>

            {/* Kahoot-style Animated Podium Columns */}
            <div className="flex items-end justify-center gap-4 md:gap-8 w-full max-w-4xl h-[450px] mb-12">
              
              {/* 2nd Place Column */}
              {sortedLeaderboard[1] && (
                <div className="flex flex-col items-center w-32 md:w-48 transition-all duration-1000 relative">
                  {podiumRevealStep <= 2 ? (
                    <div className="flex flex-col items-center animate-bounce-in mb-2 z-10">
                      <span className="font-black text-white text-2xl truncate max-w-full drop-shadow-lg">{sortedLeaderboard[1].nickname}</span>
                    </div>
                  ) : (
                    <div className="h-[40px]" />
                  )}
                  <div 
                    className="w-full bg-[#8b5cf6] rounded-t-sm shadow-2xl relative flex flex-col items-center justify-start pt-6 animate-rise-up z-0"
                    style={{ height: podiumRevealStep <= 2 ? '200px' : '0px', transition: 'height 1s ease-out' }}
                  >
                    <div className="w-16 h-16 bg-white rotate-45 flex items-center justify-center rounded-sm shadow-inner z-10">
                      <span className="text-[#8b5cf6] -rotate-45 font-black text-3xl font-headings">2</span>
                    </div>
                    {podiumRevealStep <= 2 && (
                      <span className="text-white font-black text-xl mt-8 drop-shadow-md animate-fade-in">{sortedLeaderboard[1].score} pts</span>
                    )}
                  </div>
                </div>
              )}

              {/* 1st Place Column */}
              {sortedLeaderboard[0] && (
                <div className="flex flex-col items-center w-40 md:w-56 transition-all duration-1000 relative">
                  {podiumRevealStep <= 1 ? (
                    <div className="flex flex-col items-center animate-bounce-in mb-2 z-10 relative">
                      <span className="text-6xl absolute -top-14 animate-bounce drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]">👑</span>
                      <span className="font-black text-white text-3xl truncate max-w-full drop-shadow-lg mt-2">{sortedLeaderboard[0].nickname}</span>
                    </div>
                  ) : (
                    <div className="h-[60px]" />
                  )}
                  <div 
                    className="w-full bg-[#8b5cf6] rounded-t-sm shadow-2xl relative flex flex-col items-center justify-start pt-6 animate-rise-up z-0"
                    style={{ height: podiumRevealStep <= 1 ? '300px' : '0px', transition: 'height 1s ease-out' }}
                  >
                    {podiumRevealStep <= 1 && (
                       <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-transparent to-white/20 animate-pulse-gold pointer-events-none rounded-t-sm" />
                    )}
                    <div className="w-20 h-20 bg-white rotate-45 flex items-center justify-center rounded-sm shadow-inner z-10">
                      <span className="text-[#8b5cf6] -rotate-45 font-black text-5xl font-headings">1</span>
                    </div>
                    {podiumRevealStep <= 1 && (
                      <span className="text-white font-black text-2xl mt-10 drop-shadow-md animate-fade-in z-10">{sortedLeaderboard[0].score} pts</span>
                    )}
                  </div>
                </div>
              )}

              {/* 3rd Place Column */}
              {sortedLeaderboard[2] && (
                <div className="flex flex-col items-center w-28 md:w-44 transition-all duration-1000 relative">
                  {podiumRevealStep <= 3 ? (
                    <div className="flex flex-col items-center animate-bounce-in mb-2 z-10">
                      <span className="font-black text-white text-xl truncate max-w-full drop-shadow-lg">{sortedLeaderboard[2].nickname}</span>
                    </div>
                  ) : (
                    <div className="h-[32px]" />
                  )}
                  <div 
                    className="w-full bg-[#8b5cf6] rounded-t-sm shadow-2xl relative flex flex-col items-center justify-start pt-6 animate-rise-up z-0"
                    style={{ height: podiumRevealStep <= 3 ? '130px' : '0px', transition: 'height 1s ease-out' }}
                  >
                    <div className="w-14 h-14 bg-white rotate-45 flex items-center justify-center rounded-sm shadow-inner z-10">
                      <span className="text-[#8b5cf6] -rotate-45 font-black text-2xl font-headings">3</span>
                    </div>
                    {podiumRevealStep <= 3 && (
                      <span className="text-white font-black text-lg mt-6 drop-shadow-md animate-fade-in">{sortedLeaderboard[2].score} pts</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Remaining leaderboard list */}
            {podiumRevealStep === 0 && sortedLeaderboard.length > 3 && (
              <div className="w-full max-w-xl flex flex-col gap-2 mt-4 mb-8 animate-fade-in bg-white/10 backdrop-blur-md p-6 rounded-2xl shadow-xl">
                <h4 className="text-center font-bold text-white/70 mb-4 uppercase tracking-widest text-sm">Suite du classement</h4>
                <div className="max-h-64 overflow-y-auto pr-2">
                  {sortedLeaderboard.slice(3).map((item, idx) => (
                    <div key={idx} className="bg-white/10 hover:bg-white/20 transition-colors px-6 py-4 flex items-center justify-between rounded-lg mb-2">
                      <span className="text-lg font-bold text-white"><span className="text-white/50 mr-3">#{item.rank}</span> {item.nickname}</span>
                      <span className="text-lg font-black text-white bg-black/30 px-3 py-1 rounded-md">{item.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Button */}
            {podiumRevealStep === 0 && (
              <button
                onClick={resetGame}
                className="bg-white text-slate-900 w-full max-w-md py-4 rounded-xl text-xl font-black uppercase tracking-wider shadow-[0_6px_0_rgba(255,255,255,0.4)] hover:-translate-y-1 hover:shadow-[0_8px_0_rgba(255,255,255,0.4)] transition-all mb-12"
              >
                Rejouer une partie
              </button>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
