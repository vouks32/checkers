import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  COLUMNS,
  RANKS,
  isDarkSquare,
  parseCoord,
} from '../engine/draughts.ts';
import type {
  AnnotationColor,
  AnnotationsState,
  BoardState,
  Coord,
  LegalMove,
  SquareMarkerColor,
} from '../types/game.ts';

export type AnalysisTool = 'highlight' | 'arrow' | 'square';

interface DraughtsBoardProps {
  board: BoardState;
  legalMoves: LegalMove[];
  canPlay: boolean;
  analysisMode: boolean;
  analysisTool: AnalysisTool;
  activeColor: AnnotationColor;
  activeSquareColor: SquareMarkerColor;
  annotations: AnnotationsState;
  draftArrowPoints: Coord[];
  lastMove?: { from: Coord; to: Coord } | null;
  selectedPath: Coord[]; // [from] or [from, step1, ...] during multi-capture
  isSimulation?: boolean;
  isHistoryPreview?: boolean;
  movePending?: boolean;
  finishedMessage?: {
    outcome: 'winner' | 'loser' | 'draw' | 'spectator';
    title: string;
    message: string;
    detail: string;
  } | null;
  onSquareClick: (coord: Coord) => void;
}

const HIGHLIGHT_STYLES: Record<AnnotationColor, { ring: string; badge: string; stroke: string }> = {
  yellow: {
    ring: 'ring-4 ring-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.85)]',
    badge: 'bg-yellow-400 text-slate-950 border-slate-950',
    stroke: '#FACC15',
  },
  red: {
    ring: 'ring-4 ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.85)]',
    badge: 'bg-red-600 text-white border-white',
    stroke: '#EF4444',
  },
  green: {
    ring: 'ring-4 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]',
    badge: 'bg-emerald-600 text-white border-white',
    stroke: '#22C55E',
  },
  blue: {
    ring: 'ring-4 ring-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.85)]',
    badge: 'bg-blue-600 text-white border-white',
    stroke: '#3B82F6',
  },
  orange: {
    ring: 'ring-4 ring-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.85)]',
    badge: 'bg-orange-500 text-slate-950 border-slate-950',
    stroke: '#F97316',
  },
};

const SQUARE_MARKER_STYLES: Record<SquareMarkerColor, string> = {
  red: 'bg-red-500/45 ring-2 ring-inset ring-red-400',
  green: 'bg-emerald-500/40 ring-2 ring-inset ring-emerald-400',
  yellow: 'bg-yellow-400/45 ring-2 ring-inset ring-yellow-300',
};

function coordToSvgPoint(coord: Coord): { x: number; y: number } | null {
  const parsed = parseCoord(coord);
  if (!parsed) return null;
  return {
    x: parsed.col * 100 + 50,
    y: (10 - parsed.rank) * 100 + 50,
  };
}

function CrownIcon({ color }: { color: 'white' | 'black' }) {
  const fill = color === 'white' ? '#854D0E' : '#F6D365';
  const stroke = color === 'white' ? '#422006' : '#713F12';
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-[54%] h-[54%] pointer-events-none drop-shadow-sm"
      aria-hidden="true"
    >
      <path
        d="M3 18h18v2H3v-2zm0-2L5 7l4.5 4L12 5l2.5 6L19 7l2 9H3z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const DraughtsBoard: React.FC<DraughtsBoardProps> = ({
  board,
  legalMoves,
  canPlay,
  analysisMode,
  annotations,
  draftArrowPoints,
  lastMove,
  selectedPath,
  isSimulation = false,
  isHistoryPreview = false,
  movePending = false,
  finishedMessage = null,
  onSquareClick,
}) => {
  // Calculer les pièces jouables et les cases cibles pour le chemin sélectionné
  const movableSources = new Set(legalMoves.map((m) => m.from));
  const nextStepTargets = new Set<Coord>();
  const futureTargets = new Set<Coord>();
  const pendingCaptured = new Set<Coord>();

  if (selectedPath.length > 0 && canPlay && !analysisMode) {
    const stepIndex = selectedPath.length;
    const matchingMoves = legalMoves.filter((m) => {
      if (m.path.length <= stepIndex) return false;
      for (let i = 0; i < selectedPath.length; i++) {
        if (m.path[i] !== selectedPath[i]) return false;
      }
      return true;
    });

    for (const m of matchingMoves) {
      if (m.path[stepIndex]) {
        nextStepTargets.add(m.path[stepIndex]);
      }
      for (let j = stepIndex + 1; j < m.path.length; j++) {
        futureTargets.add(m.path[j]);
      }
      // Pièces déjà sautées dans les étapes précédentes de selectedPath
      for (let c = 0; c < selectedPath.length - 1; c++) {
        if (m.captured[c]) pendingCaptured.add(m.captured[c]);
      }
    }
  }

  // Position temporaire de la pièce en cours de prise multiple pour affichage visuel fluide
  const effectiveBoard: BoardState = { ...board };
  if (selectedPath.length > 1 && effectiveBoard[selectedPath[0]]) {
    const moving = effectiveBoard[selectedPath[0]];
    delete effectiveBoard[selectedPath[0]];
    effectiveBoard[selectedPath[selectedPath.length - 1]] = moving;
  }

  const activePieceCoord = selectedPath.length > 0 ? selectedPath[selectedPath.length - 1] : null;
  const resultTone =
    finishedMessage?.outcome === 'winner'
      ? 'border-emerald-300/70 bg-emerald-950/90'
      : finishedMessage?.outcome === 'loser'
        ? 'border-rose-300/70 bg-slate-950/90'
        : finishedMessage?.outcome === 'draw'
          ? 'border-amber-300/70 bg-amber-950/90'
          : 'border-white/40 bg-slate-950/90';

  const allArrows = [
    ...annotations.arrows,
    ...(draftArrowPoints.length >= 2
      ? [{ id: '__draft__', points: draftArrowPoints, color: 'yellow' as AnnotationColor }]
      : []),
  ];

  return (
    <div
      className="w-full max-w-[600px] mx-auto select-none"
      data-testid="draughts-board"
      data-simulation={isSimulation ? 'true' : 'false'}
      data-analysis={analysisMode ? 'true' : 'false'}
    >
      {/* Cadre en noyer avec coordonnées fixes sur les 4 côtés */}
      <div
        className={`rounded-xl p-1.5 sm:p-3 shadow-lg border transition-colors ${
          isSimulation
            ? 'bg-[#1D2D3E] border-sky-500/70'
            : isHistoryPreview
              ? 'bg-[#2D2A26] border-amber-500/70'
              : 'bg-[#2A1E17] border-[#4A3528]'
        }`}
      >
        {/* Ligne de coordonnées supérieure (A à J) */}
        <div className="grid grid-cols-[18px_1fr_18px] sm:grid-cols-[26px_1fr_26px] items-center mb-1">
          <div />
          <div className="grid grid-cols-10 text-center">
            {COLUMNS.map((col) => (
              <span
                key={`top-${col}`}
                className="font-mono text-[10px] sm:text-xs font-semibold text-[#E6DEC8]/90 tabular-nums leading-none py-0.5"
              >
                {col}
              </span>
            ))}
          </div>
          <div />
        </div>

        {/* Corps principal : Coordonnées gauches + Grille 10x10 + Coordonnées droites */}
        <div className="grid grid-cols-[18px_1fr_18px] sm:grid-cols-[26px_1fr_26px] items-stretch">
          {/* Rangées gauches (10 -> 1) */}
          <div className="grid grid-rows-10 items-center text-center pr-0.5">
            {RANKS.map((rank) => (
              <span
                key={`left-${rank}`}
                className="font-mono text-[10px] sm:text-xs font-semibold text-[#E6DEC8]/90 tabular-nums leading-none"
              >
                {rank}
              </span>
            ))}
          </div>

          {/* Plateau 10x10 carré */}
          <div className="relative aspect-square w-full border border-[#1A120D] shadow-inner overflow-hidden rounded-[2px]">
            <div className="grid grid-cols-10 grid-rows-10 w-full h-full">
              {RANKS.map((rank) =>
                COLUMNS.map((colLetter, colIdx) => {
                  const coord: Coord = `${colLetter}${rank}`;
                  const dark = isDarkSquare(colIdx, rank);
                  const piece = effectiveBoard[coord];
                  const highlightColor = annotations.highlights[coord];
                  const squareMarker = annotations.squareMarkers[coord];
                  const isLastMoveSq =
                    lastMove && (lastMove.from === coord || lastMove.to === coord);
                  const isSelected = activePieceCoord === coord;
                  const isNextTarget = nextStepTargets.has(coord);
                  const isFutureTarget = !isNextTarget && futureTargets.has(coord);
                  const isPendingCaptured = pendingCaptured.has(coord);
                  const isMovable =
                    canPlay && !analysisMode && selectedPath.length === 0 && movableSources.has(coord);
                  const isDraftArrowPoint = draftArrowPoints.includes(coord);

                  const pieceLabel = piece
                    ? `${piece.type === 'king' ? 'dame' : 'pion'} ${piece.color === 'white' ? 'blanc' : 'noir'}`
                    : 'vide';

                  return (
                    <button
                      key={coord}
                      type="button"
                      data-coord={coord}
                      data-dark={dark ? 'true' : 'false'}
                      aria-label={`Case ${coord}, ${pieceLabel}`}
                      onClick={() => onSquareClick(coord)}
                      className={`relative w-full h-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:z-20 transition-colors duration-150 ${
                        dark ? 'bg-[#523B2B]' : 'bg-[#E6DEC8]'
                      } ${
                        isLastMoveSq && !squareMarker
                          ? dark
                            ? 'bg-[#684D33]'
                            : 'bg-[#DDD0AA]'
                          : ''
                      } ${
                        canPlay || analysisMode ? 'cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      {/* Marquage pédagogique de case */}
                      {squareMarker && (
                        <span
                          className={`absolute inset-0 pointer-events-none ${SQUARE_MARKER_STYLES[squareMarker]}`}
                        />
                      )}

                      {/* Point de départ/passage de flèche en cours de tracé */}
                      {isDraftArrowPoint && (
                        <span className="absolute inset-1 rounded-sm border-2 border-dashed border-yellow-300 pointer-events-none z-20" />
                      )}

                      {/* Cible immédiate légale */}
                      {isNextTarget && (
                        <span
                          data-target={coord}
                          className="absolute w-[38%] h-[38%] rounded-full bg-emerald-400/80 ring-4 ring-emerald-200/70 shadow-sm pointer-events-none z-10 transition-transform duration-150 scale-100"
                        />
                      )}

                      {/* Cible future dans une combinaison de prises multiples */}
                      {isFutureTarget && (
                        <span className="absolute w-[32%] h-[32%] rounded-full border-2 border-dashed border-amber-300/90 pointer-events-none z-10" />
                      )}

                      {/* Pièce */}
                      {piece && (
                        <div
                          data-piece={`${piece.color}-${piece.type}`}
                          className={`relative w-[78%] h-[78%] rounded-full flex items-center justify-center transition-transform duration-150 ${
                            piece.color === 'white'
                              ? 'bg-gradient-to-b from-[#FFFFFF] via-[#F3EFE4] to-[#D4CAB8] border border-[#7D7261]/70 shadow-[0_3px_5px_rgba(0,0,0,0.45)]'
                              : 'bg-gradient-to-b from-[#3E3E45] via-[#212126] to-[#101013] border border-black/90 shadow-[0_3px_6px_rgba(0,0,0,0.65)]'
                          } ${
                            highlightColor
                              ? HIGHLIGHT_STYLES[highlightColor].ring
                              : isSelected
                                ? 'ring-3 ring-emerald-400 scale-105'
                                : isMovable
                                  ? 'hover:scale-105 ring-1 ring-emerald-300/50'
                                  : ''
                          } ${isPendingCaptured ? 'opacity-45 scale-90' : ''}`}
                        >
                          {/* Anneau intérieur tourné */}
                          <span
                            className={`absolute inset-[14%] rounded-full border pointer-events-none ${
                              piece.color === 'white'
                                ? 'border-[#C0B5A0]/80'
                                : 'border-[#52525B]/70'
                            }`}
                          />

                          {/* Couronne pour les dames */}
                          {piece.type === 'king' && <CrownIcon color={piece.color} />}

                          {/* Marque de capture intermédiaire en attente */}
                          {isPendingCaptured && (
                            <span className="absolute inset-0 flex items-center justify-center text-red-500 font-bold text-lg pointer-events-none">
                              ×
                            </span>
                          )}

                          {/* Badge de coordonnée directement sur le pion lorsqu'il est surligné */}
                          {highlightColor && (
                            <span
                              data-testid={`highlight-badge-${coord}`}
                              className={`absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 z-30 font-mono text-[8px] sm:text-[11px] font-bold leading-none px-1 py-0.5 rounded border shadow-md tabular-nums pointer-events-none ${HIGHLIGHT_STYLES[highlightColor].badge}`}
                            >
                              {coord}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                }),
              )}
            </div>

            {finishedMessage ? (
              <div
                role="status"
                aria-live="polite"
                data-testid="board-game-result"
                className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] pointer-events-none"
              >
                <div
                  className={`max-w-[92%] rounded-xl border px-5 py-4 text-center text-white shadow-2xl sm:px-7 sm:py-6 ${resultTone}`}
                >
                  <h2 className="font-display text-lg font-bold sm:text-2xl">
                    {finishedMessage.title}
                  </h2>
                  <p className="mt-2 text-sm font-medium sm:text-base">
                    {finishedMessage.message}
                  </p>
                  {finishedMessage.detail && (
                    <p className="mt-2 text-xs text-white/80 sm:text-sm">
                      {finishedMessage.detail}
                    </p>
                  )}
                </div>
              </div>
            ) : movePending ? (
              <div
                role="status"
                aria-live="polite"
                aria-label="Envoi du coup en cours"
                data-testid="board-move-pending"
                className="absolute inset-0 z-30 flex cursor-wait items-center justify-center bg-slate-950/35"
              >
                <div className="flex flex-col items-center gap-2 rounded-xl border border-white/30 bg-slate-950/85 px-5 py-4 text-white shadow-xl">
                  <Loader2 className="h-9 w-9 animate-spin text-emerald-300" />
                  <span className="text-sm font-semibold">Envoi du coup...</span>
                </div>
              </div>
            ) : null}

            {/* Calque SVG des flèches pédagogiques */}
            <svg
              viewBox="0 0 1000 1000"
              className="absolute inset-0 w-full h-full pointer-events-none z-20"
              aria-hidden="true"
            >
              <defs>
                {(['yellow', 'red', 'green', 'blue', 'orange'] as AnnotationColor[]).map((color) => (
                  <marker
                    key={color}
                    id={`arrow-head-${color}`}
                    markerWidth="4.5"
                    markerHeight="4.5"
                    refX="2.8"
                    refY="2.25"
                    orient="auto"
                  >
                    <path
                      d="M0.4,0.4 L4.1,2.25 L0.4,4.1 Z"
                      fill={HIGHLIGHT_STYLES[color].stroke}
                      stroke="#111827"
                      strokeWidth="0.35"
                    />
                  </marker>
                ))}
              </defs>

              {allArrows.map((arrow) => {
                const pts = arrow.points
                  .map(coordToSvgPoint)
                  .filter((p): p is { x: number; y: number } => p !== null);
                if (pts.length < 2) return null;

                // Raccourcir légèrement le tout dernier segment pour que la pointe tombe proprement sur la case cible
                const last = pts[pts.length - 1];
                const prev = pts[pts.length - 2];
                const dx = last.x - prev.x;
                const dy = last.y - prev.y;
                const len = Math.hypot(dx, dy) || 1;
                const shortenedLast = {
                  x: last.x - (dx / len) * 20,
                  y: last.y - (dy / len) * 20,
                };
                const adjusted = [...pts.slice(0, -1), shortenedLast];
                const pointsStr = adjusted.map((p) => `${p.x},${p.y}`).join(' ');
                const strokeColor = HIGHLIGHT_STYLES[arrow.color].stroke;

                return (
                  <g key={arrow.id} opacity={arrow.id === '__draft__' ? 0.75 : 0.92}>
                    <polyline
                      points={pointsStr}
                      fill="none"
                      stroke="#111827"
                      strokeWidth="22"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.45"
                    />
                    <polyline
                      points={pointsStr}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd={`url(#arrow-head-${arrow.color})`}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Rangées droites (10 -> 1) */}
          <div className="grid grid-rows-10 items-center text-center pl-0.5">
            {RANKS.map((rank) => (
              <span
                key={`right-${rank}`}
                className="font-mono text-[10px] sm:text-xs font-semibold text-[#E6DEC8]/90 tabular-nums leading-none"
              >
                {rank}
              </span>
            ))}
          </div>
        </div>

        {/* Ligne de coordonnées inférieure (A à J) */}
        <div className="grid grid-cols-[18px_1fr_18px] sm:grid-cols-[26px_1fr_26px] items-center mt-1">
          <div />
          <div className="grid grid-cols-10 text-center">
            {COLUMNS.map((col) => (
              <span
                key={`bottom-${col}`}
                className="font-mono text-[10px] sm:text-xs font-semibold text-[#E6DEC8]/90 tabular-nums leading-none py-0.5"
              >
                {col}
              </span>
            ))}
          </div>
          <div />
        </div>
      </div>
    </div>
  );
};
