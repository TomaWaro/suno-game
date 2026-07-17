'use client';

import React from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 overflow-hidden bg-[hsl(var(--bg-dark))]">
      {/* Background Glows */}
      <div className="glow-bg glow-primary top-[-50px] left-[-50px]" />
      <div className="glow-bg glow-accent bottom-[-50px] right-[-50px]" />

      <div className="w-full max-w-md glass-panel p-10 flex flex-col items-center text-center z-10 animate-fade-in">
        <span className="text-sm font-bold text-[hsl(var(--secondary))] uppercase tracking-widest mb-2">
          Le Kahoot de la musique IA
        </span>
        <h1 className="text-5xl font-black text-white mb-4 tracking-tight font-headings">
          SunoGame
        </h1>
        <p className="text-sm text-[rgba(255,255,255,0.6)] mb-8 max-w-xs">
          Créez des morceaux sur Suno, soumettez-les anonymement, et devinez qui est l'auteur dans une partie multijoueur interactive !
        </p>

        <div className="flex flex-col gap-4 w-full">
          <Link href="/host" className="btn-neon w-full py-4 text-center">
            Créer un salon (Hôte / TV)
          </Link>
          <Link href="/play" className="btn-neon-outline w-full py-4 text-center">
            Rejoindre une partie
          </Link>
        </div>
      </div>
    </main>
  );
}
