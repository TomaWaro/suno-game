'use client';

import React, { useEffect, useState, useRef } from 'react';
import { generateRoomCode } from '@/lib/roomUtils';
import { GameMode, GamePhase, Submission, Vote, ScoreState, BuzzItem } from '@/lib/types';
import confetti from 'canvas-confetti';

import { parseYouTubeUrl } from '@/lib/youtubeUtils';

interface PlayerPoints {
  nickname: string;
  points: number;
  reason: string;
}

const getEmbedUrl = (url: string) => {
  if (!url) return '';
  const ytEmbed = parseYouTubeUrl(url);
  if (ytEmbed) {
    return ytEmbed;
  }
  return url.replace('/song/', '/embed/');
};

export default function HostPage() {
  // Room identifiers
  const [roomCode, setRoomCode] = useState<string>('');
  const [hostId, setHostId] = useState<string>('');
  
  // Game states received from server
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [gameMode, setGameMode] = useState<GameMode>('SUNO');
  const [players, setPlayers] = useState<string[]>([]);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [scores, setScores] = useState<ScoreState>({});
  const [displayScores, setDisplayScores] = useState<ScoreState>({});
  const [buzzes, setBuzzes] = useState<BuzzItem[]>([]);
  const [penalties, setPenalties] = useState<{ [key: string]: number }>({});

  // Local reveal states & polling counters
  const [revealedThisRound, setRevealedThisRound] = useState<boolean>(false);
  const [currentRoundVotesCount, setCurrentRoundVotesCount] = useState<number>(0);
  const [revealCurrentVideo, setRevealCurrentVideo] = useState<boolean>(false);
  
  // Local inputs
  const [roundPointsGained, setRoundPointsGained] = useState<PlayerPoints[]>([]);
  const [animationSteps, setAnimationSteps] = useState<PlayerPoints[][]>([]);
  const [animationStepIdx, setAnimationStepIdx] = useState<number>(-1);
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState<string>('');
  const [showLargeQr, setShowLargeQr] = useState<boolean>(false);
  const [roundStartedAt, setRoundStartedAt] = useState<number | undefined>(undefined);

  // Kahoot-style Suspense & Podium states
  const [isSuspense, setIsSuspense] = useState<boolean>(false);
  const [suspenseName, setSuspenseName] = useState<string>('');
  const [podiumRevealStep, setPodiumRevealStep] = useState<number>(4); 

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

  const [currentSongCreator, setCurrentSongCreator] = useState<string>('');

  const syncState = (data: any) => {
    setPhase(data.phase);
    setGameMode(data.gameMode || 'SUNO');
    setPlayers(data.players || []);
    setReadyPlayers(data.readyPlayers || []);
    setSubmissions(data.submissions || []);
    setVotes(data.votes || []);
    setCurrentRoundIdx(data.currentRoundIdx || 0);
    setScores(data.scores || {});
    setCurrentRoundVotesCount(data.currentRoundVotesCount || 0);
    setRoundStartedAt(data.roundStartedAt);
    setBuzzes(data.buzzes || []);
    setPenalties(data.penalties || {});
    if (data.currentSongCreator) {
      setCurrentSongCreator(data.currentSongCreator);
    }
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
      if (podiumRevealStep === 4) {
        const timer = setTimeout(() => setPodiumRevealStep(3), 1000);
        return () => clearTimeout(timer);
      } else if (podiumRevealStep === 3) {
        const timer = setTimeout(() => setPodiumRevealStep(2), 1500);
        return () => clearTimeout(timer);
      } else if (podiumRevealStep === 2) {
        const timer = setTimeout(() => setPodiumRevealStep(1), 1500);
        return () => clearTimeout(timer);
      } else if (podiumRevealStep === 1) {
        // Drumroll suspense for 1st place
        const timer = setTimeout(() => {
          setPodiumRevealStep(0);
          confetti({
            particleCount: 400,
            spread: 120,
            origin: { y: 0.6 },
          });
        }, 2000);
        return () => clearTimeout(timer);
      }
    } else if (podiumRevealStep !== 4) {
      setPodiumRevealStep(4); // Reset when not in leaderboard
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

  const selectMode = (mode: GameMode) => {
    sendAction('SET_GAME_MODE', { gameMode: mode });
  };

  const validateBuzz = (candidateName: string) => {
    setRevealCurrentVideo(true);
    sendAction('VALIDATE_BUZZ', { nickname: candidateName, points: 500, creatorBonus: 250 });

    const pointsList: PlayerPoints[] = [
      {
        nickname: candidateName,
        points: 500,
        reason: '🎯 Bon Buzz Vocal !',
      },
    ];

    if (currentSongCreator && currentSongCreator.trim() !== candidateName.trim()) {
      pointsList.push({
        nickname: currentSongCreator.trim(),
        points: 250,
        reason: '🎶 Chanson trouvée ! Bonus créateur',
      });
    }

    setRoundPointsGained(pointsList);

    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
    });
  };

  const revealBuzzSongWithoutWinner = () => {
    setRevealCurrentVideo(true);
    sendAction('CLEAR_BUZZES');
  };

  const rejectBuzz = (candidateName: string) => {
    sendAction('REJECT_BUZZ', { nickname: candidateName });
  };

  const goToPodium = () => {
    setPodiumRevealStep(4);
    sendAction('SET_STATE', { phase: 'LEADERBOARD' });
    confetti({
      particleCount: 300,
      spread: 120,
      origin: { y: 0.6 },
    });
  };

  const continueNewRound = () => {
    setRevealCurrentVideo(false);
    sendAction('CONTINUE_ROUND');
  };

  const startSubmissionPhase = async () => {
    setRevealCurrentVideo(false);
    sendAction('START_SUBMISSION');
  };

  const startGuessingPhase = (roundIdx: number) => {
    setRevealCurrentVideo(false);
    sendAction('START_GUESSING', { roundIdx });
  };

  const startRevealPhase = () => {
    setRoundPointsGained([]);
    setAnimationSteps([]);
    setAnimationStepIdx(-1);
    setRevealedThisRound(false);
    setPodiumRevealStep(4);
    sendAction('SET_STATE', {
      phase: 'REVEAL',
      currentRoundIdx: 0,
    });
  };

  const startSuspenseReveal = () => {
    setIsSuspense(true);
    const duration = 3000;
    const intervalTime = 100;

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
    const creator = currentSong.nickname.trim();
    
    // Filter votes specifically for the current round index
    const roundVotes = votes.filter((v) => v.roundIdx === currentRoundIdx);
    const G = roundVotes.filter((v) => v.guess.trim() === creator).length;
    const P = players.length;

    const steps: PlayerPoints[][] = [];

    // 1. Guesser points (Time-based decay: up to 1000 pts down to 500 pts over 30s)
    const guesserPoints: PlayerPoints[] = [];
    roundVotes.forEach((v) => {
      if (v.guess.trim() === creator) {
        let earnedPoints = 500;
        let speedReason = '🎯 Bonne réponse !';

        if (roundStartedAt && v.createdAt) {
          const elapsedSeconds = Math.max(0, (v.createdAt - roundStartedAt) / 1000);
          // Decays from 1000 to 500 over 30 seconds
          earnedPoints = Math.max(500, Math.round(1000 - elapsedSeconds * 16.67));
          speedReason = `🎯 Bonne réponse en ${elapsedSeconds.toFixed(1)}s !`;
        }

        guesserPoints.push({
          nickname: v.voter.trim(),
          points: earnedPoints,
          reason: speedReason,
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
        const cleanNick = p.nickname.trim();
        finalScores[cleanNick] = (finalScores[cleanNick] || 0) + p.points;
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
    setPodiumRevealStep(4);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rawSortedLeaderboard = Object.keys(scores)
    .map((nickname) => ({ nickname, score: scores[nickname] }))
    .sort((a, b) => b.score - a.score);

  const sortedLeaderboard = rawSortedLeaderboard.map((item, idx) => {
    // Find the first index with the same score to handle ex-aequo ranks correctly and functionally
    const firstSameScoreIdx = rawSortedLeaderboard.findIndex((x) => x.score === item.score);
    const rank = firstSameScoreIdx !== -1 ? firstSameScoreIdx + 1 : idx + 1;
    return { ...item, rank };
  });

  return (
    <main className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 overflow-hidden bg-[hsl(var(--bg-dark))]">
      {phase !== 'LEADERBOARD' && (
        <div 
          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat z-0" 
          style={{ backgroundImage: 'url(/concert-bg.png)', backgroundColor: '#0f0a1f' }}
        />
      )}
      
      <div className="glow-bg glow-primary top-[-100px] left-[-100px] z-0" />
      <div className="glow-bg glow-accent bottom-[-100px] right-[-100px] z-0" />

      <div className="w-full max-w-5xl z-10">
        
        {/* LOBBY PHASE */}
        {phase === 'LOBBY' && (
          <div className="fixed inset-0 w-full h-full bg-transparent z-50 overflow-hidden">
            {/* Custom Styled Top Banner */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl bg-gradient-to-r from-zinc-950/80 via-purple-950/60 to-zinc-950/80 backdrop-blur-2xl border border-purple-500/30 rounded-3xl shadow-[0_0_50px_rgba(139,92,246,0.3)] flex flex-row items-center justify-between p-6 z-20">
              {/* Left: Join URL & Copy Button */}
              <div className="flex flex-col pl-6">
                <span className="text-purple-300 font-bold text-xs uppercase tracking-widest">Rejoindre la partie</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white font-extrabold text-2xl md:text-3xl tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                    {typeof window !== 'undefined' ? window.location.host : 'suno-game.vercel.app'}/play
                  </span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(joinUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-2 ml-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    title="Copier le lien"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                    </svg>
                    <span className="text-xs font-bold uppercase tracking-wider">{copied ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
              </div>

              {/* Middle: Code PIN */}
              <div className="flex flex-col items-center bg-black/40 border border-white/10 px-8 py-3 rounded-2xl shadow-inner">
                <span className="text-purple-400/80 font-bold text-xs uppercase tracking-widest">Code PIN</span>
                <span className="text-white font-black text-5xl md:text-6xl tracking-widest mt-1 drop-shadow-[0_0_15px_rgba(139,92,246,0.6)]">
                  {roomCode || '----'}
                </span>
              </div>

              {/* Right: Small QR Code (Clickable) */}
              {joinUrl && (
                <div 
                  onClick={() => setShowLargeQr(true)}
                  className="pr-6 flex flex-col items-center gap-1.5 group cursor-pointer"
                  title="Cliquez pour agrandir"
                >
                  <div className="bg-white p-1.5 rounded-2xl shadow-lg border border-purple-500/20 group-hover:scale-105 transition-all duration-300 group-hover:shadow-[0_0_25px_rgba(139,92,246,0.4)]">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(joinUrl)}`}
                      alt="QR Code"
                      className="w-[72px] h-[72px] rounded-xl"
                    />
                  </div>
                  <span className="text-[10px] text-white/50 uppercase tracking-widest font-bold group-hover:text-purple-300 transition-colors">Agrandir 🔍</span>
                </div>
              )}
            </div>

            {/* Centered Mode Selector & Start Button */}
            <div className="absolute top-[24%] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
              {/* Mode Selection Pills */}
              <div className="flex items-center gap-2 p-1.5 bg-black/60 backdrop-blur-md border border-purple-500/30 rounded-2xl shadow-xl">
                <button
                  onClick={() => selectMode('SUNO')}
                  className={`px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                    gameMode === 'SUNO'
                      ? 'bg-[#8b5cf6] text-white shadow-[0_0_15px_rgba(139,92,246,0.6)]'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>🎵</span> Mode Suno
                </button>
                <button
                  onClick={() => selectMode('BUZZ')}
                  className={`px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                    gameMode === 'BUZZ'
                      ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>⚡</span> Mode Buzz YouTube (Vocal)
                </button>
              </div>

              <button 
                disabled={players.length === 0}
                onClick={startSubmissionPhase}
                className={`px-16 py-4 rounded-2xl font-black text-2xl uppercase tracking-wider text-white transition-all shadow-[0_8px_30px_rgba(139,92,246,0.3)] border ${
                  players.length === 0 
                    ? 'bg-white/5 text-white/20 cursor-not-allowed border-white/5 shadow-none' 
                    : 'bg-[#8b5cf6] hover:bg-[#7c3aed] hover:scale-105 hover:shadow-[0_0_40px_rgba(139,92,246,0.8)] active:scale-95 border-[#a78bfa]'
                }`}
              >
                Démarrer la partie 🚀
              </button>
            </div>

            {/* EXACT CENTER: Players Grid Area */}
            <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-5xl z-10 flex flex-col">
              
              {/* Grid block */}
              <div className="w-full flex flex-wrap content-start gap-4 justify-center p-8 min-h-[400px] bg-black/40 backdrop-blur-sm rounded-3xl border border-white/10 shadow-2xl relative">
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-[#8b5cf6]/20 to-transparent pointer-events-none rounded-b-3xl" />
                
                {players.length === 0 ? (
                  <div className="w-full flex items-center justify-center mt-20 z-10">
                    <span className="text-white/80 text-3xl font-bold animate-pulse">En attente de joueurs...</span>
                  </div>
                ) : (
                  players.map((nickname, idx) => (
                    <div 
                      key={idx} 
                      className="w-48 h-16 bg-[#8b5cf6] text-white font-extrabold text-xl px-4 py-2 rounded-lg shadow-[0_4px_15px_rgba(139,92,246,0.6)] flex items-center justify-center overflow-hidden transition-all duration-300 z-10"
                    >
                      <span className="truncate drop-shadow-md">{nickname}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* SUBMISSION PHASE */}
        {phase === 'SUBMISSION' && (
          <div className="fixed inset-0 w-full h-full bg-transparent z-50 overflow-hidden">
            {/* Custom Styled Top Banner */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl bg-gradient-to-r from-zinc-950/80 via-purple-950/60 to-zinc-950/80 backdrop-blur-2xl border border-purple-500/30 rounded-3xl shadow-[0_0_50px_rgba(139,92,246,0.3)] flex flex-row items-center justify-between p-6 z-20">
              <div className="flex flex-col pl-6">
                <span className="text-purple-300 font-bold text-xs uppercase tracking-widest">Soumission des morceaux</span>
                <span className="text-white font-black text-3xl md:text-4xl mt-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Création en cours...</span>
              </div>
              
              {/* Right Side: Avancement & Small QR Code */}
              <div className="pr-6 flex items-center gap-8">
                <div className="bg-black/40 border border-white/10 px-8 py-3 rounded-2xl shadow-inner flex flex-col items-center">
                  <span className="text-purple-400/80 font-bold text-xs uppercase tracking-widest">Avancement</span>
                  <span className="text-white font-black text-4xl mt-1 drop-shadow-[0_0_10px_rgba(139,92,246,0.4)]">
                    {readyPlayers.length} / {players.length}
                  </span>
                </div>

                {joinUrl && (
                  <div 
                    onClick={() => setShowLargeQr(true)}
                    className="flex flex-col items-center gap-1.5 group cursor-pointer"
                    title="Cliquez pour agrandir"
                  >
                    <div className="bg-white p-1.5 rounded-2xl shadow-lg border border-purple-500/20 group-hover:scale-105 transition-all duration-300 group-hover:shadow-[0_0_25px_rgba(139,92,246,0.4)]">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(joinUrl)}`}
                        alt="QR Code"
                        className="w-[60px] h-[60px] rounded-xl"
                      />
                    </div>
                    <span className="text-[10px] text-white/50 uppercase tracking-widest font-bold group-hover:text-purple-300 transition-colors">Agrandir 🔍</span>
                  </div>
                )}
              </div>
            </div>

            {/* Centered Start Button */}
            <div className="absolute top-[26%] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
              <button
                disabled={submissions.length === 0}
                onClick={() => startGuessingPhase(0)}
                className={`px-16 py-5 rounded-2xl font-black text-3xl uppercase tracking-wider text-white transition-all shadow-[0_8px_30px_rgba(139,92,246,0.3)] border ${
                  submissions.length === 0 
                    ? 'bg-white/5 text-white/20 cursor-not-allowed border-white/5 shadow-none' 
                    : 'bg-[#8b5cf6] hover:bg-[#7c3aed] hover:scale-105 hover:shadow-[0_0_40px_rgba(139,92,246,0.8)] active:scale-95 border-[#a78bfa]'
                }`}
              >
                Lancer les votes ! 🚀
              </button>
            </div>

            {/* EXACT CENTER: Players Grid Area */}
            <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-5xl z-10 flex flex-col">
              
              {/* Grid block */}
              <div className="w-full flex flex-wrap content-start gap-4 justify-center p-8 min-h-[400px] bg-black/40 backdrop-blur-sm rounded-3xl border border-white/10 shadow-2xl relative">
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-[#8b5cf6]/20 to-transparent pointer-events-none rounded-b-3xl" />
                
                {players.length === 0 ? (
                  <div className="w-full flex items-center justify-center mt-20 z-10">
                    <span className="text-white/80 text-3xl font-bold animate-pulse">En attente de joueurs...</span>
                  </div>
                ) : (
                  players.map((nickname, idx) => {
                    const isReady = readyPlayers.includes(nickname);
                    return (
                      <div 
                        key={idx} 
                        className={`w-48 h-16 text-white font-extrabold text-xl px-4 py-2 rounded-lg shadow-[0_4px_15px_rgba(139,92,246,0.6)] flex items-center justify-between overflow-hidden transition-all duration-300 z-10 ${isReady ? 'bg-[#10b981]' : 'bg-[#8b5cf6]'}`}
                      >
                        <span className="truncate drop-shadow-md">{nickname}</span>
                        {isReady && <span className="ml-2 bg-white/20 rounded-full min-w-6 w-6 h-6 flex items-center justify-center text-sm">✓</span>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* GUESSING PHASE */}
        {phase === 'GUESSING' && (
          <div className="glass-panel p-8 flex flex-col items-center animate-fade-in w-full max-w-4xl mx-auto">
            <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-black mb-2">
              Morceau {currentRoundIdx + 1} / {submissions.length}
            </span>
            <h1 className="text-4xl font-black text-white text-center mb-8 font-headings">
              {gameMode === 'BUZZ' ? '⚡ Mode Buzz : À qui est ce morceau ?' : 'À qui appartient ce morceau ?'}
            </h1>

            {/* Embed Player */}
            {submissions[currentRoundIdx] && (
              <div className="w-full aspect-[16/9] rounded-3xl overflow-hidden bg-black border-2 border-white/10 shadow-2xl mb-8 relative">
                <iframe
                  src={getEmbedUrl(submissions[currentRoundIdx].sunoUrl)}
                  className="w-full h-full border-none"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  title="Song Player"
                />

                {/* Blind Test Mask Overlay during GUESSING phase in Mode BUZZ (unless revealed) */}
                {gameMode === 'BUZZ' && !revealCurrentVideo && (
                  <div className="absolute inset-0 z-20 bg-gradient-to-br from-zinc-950 via-purple-950/95 to-zinc-950 flex flex-col items-center justify-center p-6 border-2 border-purple-500/30">
                    <div className="relative w-28 h-28 mb-4 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-dashed border-amber-400/50 animate-spin" style={{ animationDuration: '8s' }} />
                      <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-900 to-indigo-600 flex items-center justify-center shadow-lg border border-white/20">
                        <span className="text-4xl animate-pulse">🎵</span>
                      </div>
                    </div>

                    <span className="text-xs uppercase font-extrabold tracking-widest text-amber-400 mb-1">
                      ❓ Morceau Masqué - Blind Test
                    </span>
                    <h3 className="text-2xl font-black text-white text-center mb-4 font-headings">
                      Écoutez attentivement et buzzez !
                    </h3>

                    <button
                      onClick={() => setRevealCurrentVideo(true)}
                      className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-white/80 hover:text-white text-xs uppercase font-bold tracking-wider transition-all flex items-center gap-2"
                    >
                      <span>👁️</span> Afficher la vidéo / le titre (Hôte)
                    </button>
                  </div>
                )}
              </div>
            )}

            {gameMode === 'BUZZ' ? (
              /* BUZZ MODE QUEUE & REVEAL UI */
              <div className="w-full max-w-4xl flex flex-col items-center bg-black/40 border border-amber-500/30 rounded-3xl p-8 shadow-2xl">
                {!revealCurrentVideo ? (
                  <div className="w-full max-w-2xl flex flex-col items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-amber-400 mb-4">
                      ⚡ File des Buzzes en Temps Réel
                    </span>

                    {buzzes.length > 0 ? (
                      <div className="w-full flex flex-col items-center gap-4">
                        {/* Top Buzz Candidate */}
                        <div className="w-full p-6 bg-gradient-to-r from-amber-950/80 via-yellow-900/60 to-amber-950/80 border-2 border-amber-400 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.5)] flex flex-col items-center animate-bounce-in">
                          <span className="text-xs font-bold text-amber-300 uppercase tracking-widest mb-1">🎤 Proposition vocale en cours !</span>
                          <span className="text-4xl font-black text-white drop-shadow-md mb-4">{buzzes[0].nickname}</span>
                          
                          <div className="flex gap-4 w-full">
                            <button
                              onClick={() => validateBuzz(buzzes[0].nickname)}
                              className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 border border-emerald-400 text-white font-black text-xl rounded-xl shadow-lg hover:scale-105 transition-all active:scale-95 uppercase tracking-wider flex items-center justify-center gap-2"
                            >
                              <span>✅</span> Valider (+500 pts)
                            </button>
                            <button
                              onClick={() => rejectBuzz(buzzes[0].nickname)}
                              className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 border border-rose-500 text-white font-black text-xl rounded-xl shadow-lg hover:scale-105 transition-all active:scale-95 uppercase tracking-wider flex items-center justify-center gap-2"
                            >
                              <span>❌</span> Refuser (Pénalité 10s)
                            </button>
                          </div>
                        </div>

                        {/* Subsequent Candidates in Queue */}
                        {buzzes.length > 1 && (
                          <div className="w-full mt-2 flex flex-col gap-2">
                            <span className="text-xs text-white/50 uppercase font-bold tracking-wider">Suivants dans la file :</span>
                            <div className="flex flex-wrap gap-2">
                              {buzzes.slice(1).map((b, idx) => (
                                <span key={idx} className="px-4 py-2 bg-white/10 border border-white/10 rounded-xl text-white font-extrabold text-sm">
                                  #{idx + 2} {b.nickname}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 flex flex-col items-center text-center">
                        <span className="text-4xl mb-2 animate-bounce">⚡</span>
                        <span className="text-xl font-extrabold text-white">En attente d'un buzz...</span>
                        <span className="text-sm text-white/60 mt-1">Appuyez sur le bouton Buzz sur votre téléphone !</span>
                      </div>
                    )}

                    <div className="w-full border-t border-white/10 mt-6 pt-4 flex gap-4">
                      <button 
                        onClick={revealBuzzSongWithoutWinner}
                        className="py-3 px-6 bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 font-bold rounded-xl text-sm uppercase tracking-wider w-full"
                      >
                        Passer & Révéler la chanson 🔍
                      </button>
                    </div>
                  </div>
                ) : (
                  /* REVEALED SONG & IMMEDIATE POINTS BOARD */
                  <div className="w-full flex flex-col items-center animate-fade-in">
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-2">
                      🎉 Morceau Révélé !
                    </span>
                    
                    {currentSongCreator && (
                      <div className="mb-8 text-center">
                        <span className="text-sm text-white/60 uppercase tracking-widest block mb-1">Chanson proposée par</span>
                        <span className="text-5xl font-black text-amber-400 font-headings drop-shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                          {currentSongCreator}
                        </span>
                      </div>
                    )}

                    {/* Hit Parade Kart Race Mini-Track */}
                    <div className="w-full bg-white/5 border border-white/10 rounded-3xl p-8 mb-8 shadow-2xl">
                      <h4 className="font-extrabold text-2xl text-white mb-6 border-b border-white/10 pb-4">🎧 Score en direct</h4>
                      <div className="flex flex-col gap-4 w-full">
                        {players.map((nickname, idx) => {
                          const score = scores[nickname] || 0;
                          const maxScore = Math.max(2000, ...(Object.values(scores) as number[]));
                          const percentage = Math.min(100, Math.max(0, (score / maxScore) * 100));
                          const gainedThisRound = roundPointsGained.filter(g => g.nickname === nickname);
                          const totalGained = gainedThisRound.reduce((sum, g) => sum + g.points, 0);
                          const reasons = gainedThisRound.map(g => g.reason).join(' | ');

                          return (
                            <div key={idx} className="flex flex-col gap-2 w-full bg-white/5 border border-white/10 rounded-2xl p-4 transition-all">
                              <div className="flex justify-between items-center w-full">
                                <div className="flex items-center gap-3">
                                  <span className="font-extrabold text-white text-base">{nickname}</span>
                                  {reasons && (
                                    <span className="font-black px-3 py-1 rounded-full text-xs bg-purple-600 text-white border border-purple-400/40 shadow-lg animate-bounce-in">
                                      {reasons}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  {totalGained > 0 && (
                                    <span className="font-black text-xl text-yellow-300 drop-shadow-md animate-pulse">
                                      +{totalGained}
                                    </span>
                                  )}
                                  <span className="text-amber-400 font-black text-base">{score} pts</span>
                                </div>
                              </div>

                              <div className="w-full h-4 rounded-full relative bg-white/10 overflow-visible mt-1">
                                <div 
                                  className="absolute top-0 left-0 h-full rounded-full flex items-center justify-end bg-gradient-to-r from-purple-500 via-indigo-500 to-amber-400 transition-all duration-1000"
                                  style={{ width: `${percentage}%` }}
                                >
                                  <div className="w-9 h-9 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.6)] transform translate-x-4 flex items-center justify-center text-base z-20 border-2 border-amber-400">
                                    🏎️
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="w-full flex gap-4">
                      {currentRoundIdx + 1 < submissions.length ? (
                        <button 
                          onClick={() => startGuessingPhase(currentRoundIdx + 1)}
                          className="btn-neon w-full py-4 text-lg font-black uppercase tracking-wider"
                        >
                          Chanson suivante ⏩
                        </button>
                      ) : (
                        <button 
                          onClick={goToPodium}
                          className="btn-neon w-full py-4 text-lg font-black uppercase tracking-wider animate-pulse-glow"
                        >
                          Podium Final 🏆
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* SUNO MODE PROGRESS UI */
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
                    Terminer l&apos;écoute & passer aux révélations
                  </button>
                )}
              </div>
            )}
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
                    <h1 className="text-4xl font-black text-white mb-2 text-center">C&apos;était le morceau de...</h1>
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

                             {totalGained > 0 && animationStepIdx < animationSteps.length && (
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
                    <div className="flex flex-col items-center animate-bounce-in mb-4 z-10">
                      <span className="font-black text-white text-2xl truncate max-w-full drop-shadow-lg">{sortedLeaderboard[1].nickname}</span>
                    </div>
                  ) : (
                    <div className="h-[40px]" />
                  )}
                  <div 
                    className="w-full bg-[#8b5cf6] rounded-t-2xl shadow-2xl relative flex flex-col items-center justify-center gap-3 py-6 animate-rise-up z-0 border-t-2 border-purple-400/30"
                    style={{ height: podiumRevealStep <= 2 ? '220px' : '0px', transition: 'height 1s ease-out' }}
                  >
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(255,255,255,0.3)] border-4 border-slate-300/60 z-10 overflow-hidden">
                      <span className="text-[#8b5cf6] font-black text-3xl font-headings leading-none flex items-center justify-center w-full h-full text-center select-none pt-0.5">
                        2
                      </span>
                    </div>
                    {podiumRevealStep <= 2 && (
                      <span className="text-white font-black text-xl drop-shadow-md animate-fade-in">{sortedLeaderboard[1].score} pts</span>
                    )}
                  </div>
                </div>
              )}

              {/* 1st Place Column */}
              {sortedLeaderboard[0] && (
                <div className="flex flex-col items-center w-40 md:w-56 transition-all duration-1000 relative">
                  {podiumRevealStep <= 0 ? (
                    <div className="flex flex-col items-center animate-bounce-in mb-4 z-10 relative">
                      <span className="text-7xl absolute -top-16 animate-bounce drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]">👑</span>
                      <span className="font-black text-white text-3xl truncate max-w-full drop-shadow-lg mt-4">{sortedLeaderboard[0].nickname}</span>
                    </div>
                  ) : (
                    <div className="h-[64px]" />
                  )}
                  <div 
                    className="w-full bg-[#8b5cf6] rounded-t-2xl shadow-2xl relative flex flex-col items-center justify-center gap-4 py-8 animate-rise-up z-0 border-t-2 border-yellow-400/50"
                    style={{ height: podiumRevealStep <= 0 ? '320px' : '0px', transition: 'height 1s ease-out' }}
                  >
                    {podiumRevealStep <= 0 && (
                       <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-transparent to-white/20 animate-pulse-gold pointer-events-none rounded-t-2xl" />
                    )}
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(255,255,255,0.4)] border-4 border-yellow-400/70 z-10 overflow-hidden">
                      <span className="text-[#8b5cf6] font-black text-4xl font-headings leading-none flex items-center justify-center w-full h-full text-center select-none pt-0.5">
                        1
                      </span>
                    </div>
                    {podiumRevealStep <= 0 && (
                      <span className="text-white font-black text-2xl drop-shadow-md animate-fade-in z-10">{sortedLeaderboard[0].score} pts</span>
                    )}
                  </div>
                </div>
              )}

              {/* 3rd Place Column */}
              {sortedLeaderboard[2] && (
                <div className="flex flex-col items-center w-28 md:w-44 transition-all duration-1000 relative">
                  {podiumRevealStep <= 3 ? (
                    <div className="flex flex-col items-center animate-bounce-in mb-4 z-10">
                      <span className="font-black text-white text-xl truncate max-w-full drop-shadow-lg">{sortedLeaderboard[2].nickname}</span>
                    </div>
                  ) : (
                    <div className="h-[36px]" />
                  )}
                  <div 
                    className="w-full bg-[#8b5cf6] rounded-t-2xl shadow-2xl relative flex flex-col items-center justify-center gap-2 py-4 animate-rise-up z-0 border-t-2 border-amber-600/40"
                    style={{ height: podiumRevealStep <= 3 ? '150px' : '0px', transition: 'height 1s ease-out' }}
                  >
                    <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(255,255,255,0.3)] border-4 border-amber-600/50 z-10 overflow-hidden">
                      <span className="text-[#8b5cf6] font-black text-2xl font-headings leading-none flex items-center justify-center w-full h-full text-center select-none pt-0.5">
                        3
                      </span>
                    </div>
                    {podiumRevealStep <= 3 && (
                      <span className="text-white font-black text-lg drop-shadow-md animate-fade-in">{sortedLeaderboard[2].score} pts</span>
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

            {/* Action Buttons */}
            {podiumRevealStep === 0 && (
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl mb-12">
                <button
                  onClick={continueNewRound}
                  className="flex-1 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 py-4 rounded-xl text-lg font-black uppercase tracking-wider shadow-lg hover:scale-105 transition-all"
                >
                  🔄 Continuer (Nouveau tour)
                </button>
                <button
                  onClick={resetGame}
                  className="flex-1 bg-white text-slate-900 py-4 rounded-xl text-lg font-black uppercase tracking-wider shadow-lg hover:scale-105 transition-all"
                >
                  Rejouer une partie
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Giant QR Code Modal Overlay */}
      {showLargeQr && (
        <div 
          className="fixed inset-0 w-full h-full bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center animate-fade-in cursor-pointer"
          onClick={() => setShowLargeQr(false)}
        >
          <div 
            className="bg-zinc-950 border border-purple-500/20 rounded-3xl p-8 max-w-md w-[90%] flex flex-col items-center shadow-[0_0_50px_rgba(139,92,246,0.3)] transition-all scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-black text-white mb-2 text-center uppercase tracking-wider">Scanner pour rejoindre</h3>
            <p className="text-white/60 text-sm text-center mb-6">
              Allez sur <span className="text-purple-300 font-bold">{typeof window !== 'undefined' ? window.location.host : 'suno-game.vercel.app'}/play</span>
            </p>
            
            <div className="bg-white p-4 rounded-3xl shadow-[0_0_40px_rgba(255,255,255,0.2)] mb-6">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}`}
                alt="Large QR Code"
                className="w-[260px] h-[260px] rounded-2xl"
              />
            </div>
            
            <span className="text-purple-400 font-extrabold text-3xl tracking-widest bg-white/5 border border-white/10 px-8 py-3 rounded-2xl mb-6 shadow-inner">
              PIN : {roomCode}
            </span>
            
            <button 
              onClick={() => setShowLargeQr(false)}
              className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold rounded-2xl transition-colors active:scale-95"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
