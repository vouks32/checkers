import React, { useState } from 'react';
import { BookOpen, LogIn, LogOut, Plus, Users } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { PlayerColor } from '../types/game.ts';

interface HomeScreenProps {
  firebaseUser: User | null;
  onGoogleLogin: () => void;
  onGoogleLogout: () => void;
  onCreateGame: (params: { pseudo: string; color: PlayerColor }) => Promise<void>;
  onJoinByLinkOrId: (input: string) => void;
  onOpenRules: () => void;
  creating: boolean;
  errorMessage: string | null;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  firebaseUser,
  onGoogleLogin,
  onGoogleLogout,
  onCreateGame,
  onJoinByLinkOrId,
  onOpenRules,
  creating,
  errorMessage,
}) => {
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [pseudo, setPseudo] = useState(firebaseUser?.displayName?.split(' ')[0] || '');
  const [color, setColor] = useState<PlayerColor>('white');
  const [joinInput, setJoinInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pseudo.trim();
    if (!trimmed) {
      setLocalError('Veuillez saisir votre pseudonyme.');
      return;
    }
    setLocalError(null);
    await onCreateGame({ pseudo: trimmed, color });
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = joinInput.trim();
    if (!trimmed) {
      setLocalError('Veuillez coller le lien d’invitation ou l’identifiant de la partie.');
      return;
    }
    setLocalError(null);
    onJoinByLinkOrId(trimmed);
  };

  return (
    <div className="min-h-screen bg-[#F1F3F5] text-slate-900 flex flex-col">
      {/* Barre supérieure sobre à 3 zones */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-8">
          <a
            href="/"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Dames Master
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setMode('create')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Créer une partie
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Rejoindre
            </button>
            <button
              type="button"
              onClick={onOpenRules}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Règles officielles
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {firebaseUser ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-600 hidden sm:inline truncate max-w-[140px]">
                  {firebaseUser.displayName || firebaseUser.email}
                </span>
                <button
                  type="button"
                  onClick={onGoogleLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Déconnexion</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onGoogleLogin}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Connexion Google</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-10 sm:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        {/* Colonne gauche : Présentation & actions principales */}
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12] text-balance">
              Dames internationales en ligne et enseignement tactique
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              Affrontez un ami à distance sur un damier officiel 10×10 avec validation des règles côté
              serveur, ou activez le mode analyse pour annoter vos pions, tracer des flèches de
              combinaison et simuler des variantes en direct.
            </p>
          </div>

          {(errorMessage || localError) && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
            >
              {localError || errorMessage}
            </div>
          )}

          {mode === 'menu' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-start="true"
                  data-testid="open-create-btn"
                  onClick={() => {
                    setLocalError(null);
                    setMode('create');
                  }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-800 text-white text-sm font-semibold rounded-lg hover:bg-emerald-900 transition-colors shadow-xs whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Créer une partie</span>
                </button>

                <button
                  type="button"
                  data-testid="open-join-btn"
                  onClick={() => {
                    setLocalError(null);
                    setMode('join');
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-slate-900 border border-slate-300 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Users className="w-4 h-4" />
                  <span>Rejoindre une partie</span>
                </button>
              </div>

              <div>
                <button
                  type="button"
                  data-testid="open-rules-btn"
                  onClick={onOpenRules}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 hover:text-emerald-950 underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Apprendre à jouer aux dames internationales</span>
                </button>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>Damier 10×10 officiel</span>
                <span aria-hidden="true">·</span>
                <span>Prise majoritaire et dames volantes</span>
                <span aria-hidden="true">·</span>
                <span>Annotations et simulation synchronisées</span>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <form
              onSubmit={handleCreateSubmit}
              className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5 max-w-md"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Nouvelle partie</h2>
                <button
                  type="button"
                  onClick={() => setMode('menu')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Retour
                </button>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="creator-pseudo" className="block text-xs font-semibold text-slate-700">
                  Votre pseudonyme
                </label>
                <input
                  id="creator-pseudo"
                  type="text"
                  maxLength={30}
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  placeholder="Ex : Alexandre"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-700">
                  Couleur de vos pièces
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-testid="choose-white-btn"
                    onClick={() => setColor('white')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg border transition-colors ${
                      color === 'white'
                        ? 'border-emerald-800 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-[#FAF8F2] border border-slate-400" />
                    <span>Blancs (en bas)</span>
                  </button>
                  <button
                    type="button"
                    data-testid="choose-black-btn"
                    onClick={() => setColor('black')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg border transition-colors ${
                      color === 'black'
                        ? 'border-emerald-800 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-slate-900 border border-slate-950" />
                    <span>Noirs (en haut)</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                data-testid="submit-create-btn"
                disabled={creating}
                className="w-full py-3 px-4 bg-emerald-800 text-white text-sm font-semibold rounded-lg hover:bg-emerald-900 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Création en cours...' : 'Créer et obtenir le lien d’invitation'}
              </button>
            </form>
          )}

          {mode === 'join' && (
            <form
              onSubmit={handleJoinSubmit}
              className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4 max-w-md"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Rejoindre une partie</h2>
                <button
                  type="button"
                  onClick={() => setMode('menu')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Retour
                </button>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="join-link-input" className="block text-xs font-semibold text-slate-700">
                  Lien d’invitation ou code de partie
                </label>
                <input
                  id="join-link-input"
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  placeholder="https://.../game/a1b2c3d4 ou a1b2c3d4"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                data-testid="submit-join-link-btn"
                className="w-full py-3 px-4 bg-emerald-800 text-white text-sm font-semibold rounded-lg hover:bg-emerald-900 transition-colors"
              >
                Ouvrir la partie
              </button>
            </form>
          )}
        </div>

        {/* Colonne droite : Aperçu géométrique net du damier 10x10 avec coordonnées et annotations */}
        <div className="lg:col-span-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-xs space-y-4">
            <div className="aspect-square max-w-[380px] mx-auto bg-[#2A1E17] rounded-xl p-3 shadow-md">
              <div className="grid grid-cols-10 grid-rows-10 w-full h-full border border-[#1A120D] relative">
                {Array.from({ length: 100 }).map((_, idx) => {
                  const row = Math.floor(idx / 10);
                  const rank = 10 - row;
                  const col = idx % 10;
                  const dark = (col + rank) % 2 === 1;
                  const coord = `${String.fromCharCode(65 + col)}${rank}`;
                  const hasBlack = dark && rank >= 7;
                  const hasWhite = dark && rank <= 4;
                  const isHighlighted = coord === 'B4' || coord === 'C7';
                  return (
                    <div
                      key={coord}
                      className={`relative flex items-center justify-center ${
                        dark ? 'bg-[#523B2B]' : 'bg-[#E6DEC8]'
                      }`}
                    >
                      {(hasWhite || hasBlack) && (
                        <div
                          className={`w-[76%] h-[76%] rounded-full flex items-center justify-center ${
                            hasWhite
                              ? 'bg-[#F5F2E8] border border-[#8E8371] shadow-sm'
                              : 'bg-[#222226] border border-black shadow-sm'
                          } ${isHighlighted ? 'ring-3 ring-yellow-400' : ''}`}
                        >
                          {isHighlighted && (
                            <span className="absolute -top-1.5 -right-1.5 font-mono text-[8px] font-bold px-1 py-0.5 bg-yellow-400 text-slate-950 rounded border border-slate-950 leading-none z-10">
                              {coord}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <svg
                  viewBox="0 0 1000 1000"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  aria-hidden="true"
                >
                  <defs>
                    <marker
                      id="hero-arrow"
                      markerWidth="4.5"
                      markerHeight="4.5"
                      refX="2.8"
                      refY="2.25"
                      orient="auto"
                    >
                      <path d="M0.4,0.4 L4.1,2.25 L0.4,4.1 Z" fill="#FACC15" />
                    </marker>
                  </defs>
                  <line
                    x1="350"
                    y1="650"
                    x2="435"
                    y2="565"
                    stroke="#FACC15"
                    strokeWidth="16"
                    strokeLinecap="round"
                    markerEnd="url(#hero-arrow)"
                  />
                </svg>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-100">
              <span>Orientation identique pour les deux joueurs</span>
              <span className="font-mono font-semibold text-slate-800">A1 – J10</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
