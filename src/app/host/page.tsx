'use client';

import React, { useEffect, useState, useRef } from 'react';
import { generateRoomCode } from '@/lib/roomUtils';
import { supabase } from '@/lib/supabase';
import { parseSunoUrl } from '@/lib/sunoUtils';
import { GamePhase, Submission, Vote, ScoreState } from '@/lib/types';
import confetti from 'canvas-confetti';

interface PlayerPresence {
  nickname: string;
  isHost: boolean;
  isReady: boolean;
}

export default function HostPage() {
  // Game state
  const [roomCode, setRoomCode] = useState<string>('');
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [players, setPlayers] = useState<string[]>([]);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  
  // Game inputs & loop variables
  const [theme, setTheme] = useState<string>('Un morceau épique sur un codeur fatigué');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [scores, setScores] = useState<ScoreState>({});
  
  // Points calculation helper
  const [roundPointsGained, setRoundPointsGained] = useState<{
    nickname: string;
    points: number;
    reason: string;
  }[]>([]);

  // DOM URLs
  const [joinUrl, setJoinUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Channels ref
  const mainChannelRef = useRef<any>(null);
  const hostChannelRef = useRef<any>(null);

  // Generate Room PIN on mount
  useEffect(() => {
    const code = generateRoomCode();
    setRoomCode(code);
    setJoinUrl(`${window.location.origin}/play?room=${code}`);
  }, []);

  // Presence channel config
  useEffect(() => {
    if (!roomCode) return;

    // Join main channel to broadcast state changes
    const mainChannel = supabase.channel(`room_${roomCode}`, {
      config: {
        presence: {
          key: 'host',
        },
      },
    });

    mainChannelRef.current = mainChannel;

    mainChannel
      .on('presence', { event: 'sync' }, () => {
        const state = mainChannel.presenceState();
        const activePlayers: string[] = [];
        
        Object.keys(state).forEach((key) => {
          const presences = state[key] as any[];
          presences.forEach((p) => {
            if (p.nickname && !p.isHost) {
              activePlayers.push(p.nickname);
            }
          });
        });
        
        setPlayers(activePlayers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await mainChannel.track({ isHost: true, isReady: true });
        }
      });

    // Join private Host channel to receive anonymous submissions & votes
    const hostChannel = supabase.channel(`room_${roomCode}_host`);
    hostChannelRef.current = hostChannel;

    hostChannel
      .on('broadcast', { event: 'song_submitted' }, (payload) => {
        const { nickname, title, sunoUrl } = payload.payload;
        const parsedEmbed = parseSunoUrl(sunoUrl);
        
        if (parsedEmbed) {
          setSubmissions((prev) => {
            // Prevent duplicates
            const filtered = prev.filter((s) => s.nickname !== nickname);
            return [...filtered, { nickname, title, sunoUrl: parsedEmbed }];
          });
          setReadyPlayers((prev) => {
            if (!prev.includes(nickname)) return [...prev, nickname];
            return prev;
          });
        }
      })
      .on('broadcast', { event: 'vote_submitted' }, (payload) => {
        const { voter, guess, rating } = payload.payload;
        setVotes((prev) => {
          const filtered = prev.filter((v) => v.voter !== voter);
          return [...filtered, { voter, guess, rating }];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(mainChannel);
      supabase.removeChannel(hostChannel);
    };
  }, [roomCode]);

  // Broadcast current phase to players
  const broadcastPhaseChange = (nextPhase: GamePhase, extraPayload: any = {}) => {
    if (mainChannelRef.current) {
      mainChannelRef.current.send({
        type: 'broadcast',
        event: 'phase_change',
        payload: { phase: nextPhase, theme, ...extraPayload },
      });
    }
  };

  const startSubmissionPhase = () => {
    setSubmissions([]);
    setReadyPlayers([]);
    setPhase('SUBMISSION');
    broadcastPhaseChange('SUBMISSION');
  };

  const startGuessingPhase = (roundIdx: number) => {
    if (submissions.length === 0) return;
    
    setVotes([]);
    setPhase('GUESSING');
    setCurrentRoundIdx(roundIdx);
    
    const activeSong = submissions[roundIdx];
    broadcastPhaseChange('GUESSING', {
      currentSongTitle: activeSong.title,
      creator: activeSong.nickname, // Sent privately to allow clients to filter out the creator
    });
  };

  const calculatePoints = () => {
    const currentSong = submissions[currentRoundIdx];
    const creator = currentSong.nickname;
    
    // Find all votes for the current round
    const roundVotes = votes;
    const correctVotes = roundVotes.filter((v) => v.guess === creator);
    const correctGuessers = correctVotes.map((v) => v.voter);
    
    const G = correctGuessers.length; // Number of correct guesses
    const P = players.length; // Total players

    const pointsList: { nickname: string; points: number; reason: string }[] = [];
    const scoreDelta: ScoreState = {};

    // 1. Guesser points (500 pts for correct guess)
    correctGuessers.forEach((guesser) => {
      pointsList.push({
        nickname: guesser,
        points: 500,
        reason: 'Bonne réponse ! (+500)',
      });
      scoreDelta[guesser] = (scoreDelta[guesser] || 0) + 500;
    });

    // 2. Creator points (Sweet Spot Calculation)
    if (G >= 1) {
      const maxCreatorPoints = 1000;
      const decay = 0.6;
      let creatorBasePoints = maxCreatorPoints;
      
      if (P > 2) {
        // Points decrease as more players guess the creator correctly
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

    // Apply score changes to global state
    setScores((prev) => {
      const nextScores = { ...prev };
      Object.keys(scoreDelta).forEach((nick) => {
        nextScores[nick] = (nextScores[nick] || 0) + scoreDelta[nick];
      });
      return nextScores;
    });

    setRoundPointsGained(pointsList);
    setPhase('REVEAL');
    broadcastPhaseChange('REVEAL');

    // Trigger confetti
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
    });
  };

  const nextRound = () => {
    if (currentRoundIdx + 1 < submissions.length) {
      startGuessingPhase(currentRoundIdx + 1);
    } else {
      setPhase('LEADERBOARD');
      broadcastPhaseChange('LEADERBOARD');
      confetti({
        particleCount: 300,
        spread: 120,
        origin: { y: 0.6 },
      });
    }
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
                    <div key={idx} className="glass-panel p-4 flex items-center justify-between border-l-4 border-l-[hsl(var(--primary))]">
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
          <div className="glass-panel p-8 flex flex-col items-center">
            <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-bold mb-2">
              Morceau {currentRoundIdx + 1} / {submissions.length}
            </span>
            <h1 className="text-3xl font-black text-white text-center mb-6">À qui appartient ce morceau ?</h1>

            {/* Suno Iframe Embed */}
            <div className="w-full max-w-3xl aspect-[16/9] rounded-2xl overflow-hidden bg-black border border-[rgba(255,255,255,0.1)] shadow-2xl mb-8">
              <iframe
                src={submissions[currentRoundIdx].sunoUrl}
                className="w-full h-full border-none"
                allow="autoplay; encrypted-media"
                title={submissions[currentRoundIdx].title}
              />
            </div>

            <div className="w-full max-w-md flex flex-col items-center bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-[hsl(var(--primary))] animate-ping" />
                <span className="text-sm font-semibold text-white">Votes reçus : {votes.length} / {players.length}</span>
              </div>
              <button 
                onClick={calculatePoints}
                className="btn-neon w-full py-3 mt-4"
              >
                Révéler le créateur
              </button>
            </div>
          </div>
        )}

        {/* REVEAL PHASE */}
        {phase === 'REVEAL' && (
          <div className="glass-panel p-8 flex flex-col items-center">
            <span className="text-xs uppercase tracking-widest text-[hsl(var(--secondary))] font-bold mb-2">Révélation</span>
            <h1 className="text-4xl font-black text-white mb-2">C'était le morceau de...</h1>
            <h2 className="text-6xl font-black text-[hsl(var(--primary))] animate-pulse mb-8">
              {submissions[currentRoundIdx].nickname}
            </h2>

            <div className="w-full max-w-2xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-2xl p-6 mb-8">
              <h3 className="font-bold text-lg text-white mb-4 border-b border-[rgba(255,255,255,0.1)] pb-2">Attribution des points</h3>
              <div className="flex flex-col gap-3">
                {roundPointsGained.map((g, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-[rgba(255,255,255,0.03)] p-3 rounded-xl">
                    <span className="font-semibold text-white">{g.nickname}</span>
                    <div className="text-right">
                      <span className="text-[hsl(var(--success))] font-bold text-sm block">+{g.points} pts</span>
                      <span className="text-[10px] text-[rgba(255,255,255,0.4)]">{g.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={nextRound} className="btn-neon w-full max-w-md py-4">
              {currentRoundIdx + 1 < submissions.length ? 'Prochain morceau' : 'Podium final'}
            </button>
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

            <button 
              onClick={() => {
                setPhase('LOBBY');
                setScores({});
                setSubmissions([]);
                setReadyPlayers([]);
                setVotes([]);
              }} 
              className="btn-neon-outline w-full max-w-md py-4"
            >
              Recommencer une partie
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
