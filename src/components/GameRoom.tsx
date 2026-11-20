import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Flag,
  History,
  MessageCircle,
  RefreshCw,
  SlidersHorizontal,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  countPieces,
  createInitialBoard,
  getLegalMoves,
  isDarkCoord,
} from '../engine/draughts.ts';
import {
  confirmPresence,
  joinGame,
  resignGame,
  requestRematch,
  submitMove,
  updateAnnotations,
  updateSimulation,
  watchGame,
} from '../gameApi.ts';
import type { AnnotationAction, SimulationAction } from '../server/gameStore.ts';
import type {
  AnnotationColor,
  ClientSeatInfo,
  Coord,
  EndReason,
  GameSessionView,
  LegalMove,
  PlayerColor,
  SquareMarkerColor,
} from '../types/game.ts';
import {
  getSoundMuted,
  playCaptureSound,
  playMoveSound,
  playPromoteSound,
  setSoundMuted,
} from '../utils/sound.ts';
import { AnalysisPanel } from './AnalysisPanel.tsx';
import { DraughtsBoard, type AnalysisTool } from './DraughtsBoard.tsx';
import { MoveHistoryPanel } from './MoveHistoryPanel.tsx';

interface GameRoomProps {
  gameId: string;
  onNavigateHome: () => void;
  onNavigateGame: (newGameId: string) => void;
  onOpenRules: () => void;
}

const END_REASON_LABELS: Record<EndReason, string> = {
  none: '',
  no_pieces: 'Toutes les pièces adverses ont été capturées.',
  no_moves: 'L’adversaire ne dispose plus d’aucun coup légal.',
  resignation: 'Victoire par abandon.',
  threefold_repetition: 'Triple répétition d’une même position.',
  twenty_five_move_rule: 'Règle officielle des 25 coups sans prise ni mouvement de pion.',
  endgame_16_moves: 'Règle officielle des 16 coups en finale (3 pièces contre 1 dame).',
  endgame_5_moves: 'Règle officielle des 5 coups en finale (2 pièces ou moins contre 1 dame).',
  mutual_draw: 'Match nul par accord mutuel.',
};

function getSeatStorageKey(gameId: string): string {
  return `dames_master_seat_${gameId}`;
}

function loadSavedSeat(gameId: string): ClientSeatInfo | null {
  try {
    const raw = localStorage.getItem(getSeatStorageKey(gameId));
    if (!raw) return null;
    return JSON.parse(raw) as ClientSeatInfo;
  } catch {
    return null;
  }
}

function saveSeat(gameId: string, seat: ClientSeatInfo): void {
  try {
    localStorage.setItem(getSeatStorageKey(gameId), JSON.stringify(seat));
  } catch {
    // Ignorer si le stockage local est indisponible
  }
}

export const GameRoom: React.FC<GameRoomProps> = ({
  gameId,
  onNavigateHome,
  onNavigateGame,
  onOpenRules,
}) => {
  const [view, setView] = useState<GameSessionView | null>(null);
  const [seat, setSeat] = useState<ClientSeatInfo | null>(() => loadSavedSeat(gameId));
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Formulaire pour rejoindre la partie via lien
  const [joinPseudo, setJoinPseudo] = useState('');
  const [joining, setJoining] = useState(false);

  // Interactions plateau
  const [selectedPath, setSelectedPath] = useState<Coord[]>([]);
  const [movePending, setMovePending] = useState(false);
  const [previewPly, setPreviewPly] = useState<number | null>(null);

  // Mode analyse pédagogique
  const [analysisMode, setAnalysisMode] = useState(false);
  const [analysisTool, setAnalysisTool] = useState<AnalysisTool>('highlight');
  const [activeColor, setActiveColor] = useState<AnnotationColor>('yellow');
  const [activeSquareColor, setActiveSquareColor] = useState<SquareMarkerColor>('red');
  const [draftArrowPoints, setDraftArrowPoints] = useState<Coord[]>([]);

  // Panneaux latéraux / onglets mobiles
  const [activeTab, setActiveTab] = useState<'analysis' | 'history'>('analysis');
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [muted, setMuted] = useState(() => getSoundMuted());

  const prevPlyRef = useRef<number>(0);
  const movePendingRef = useRef(false);

  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/game/${gameId}` : `/game/${gameId}`;

  // Initialisation / restauration de session
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let hasInitialView = false;
    setLoading(true);
    setNotFound(false);
    setErrorMsg(null);
    setView(null);
    setSelectedPath([]);
    setPreviewPly(null);

    const saved = loadSavedSeat(gameId);
    setSeat(saved);

    void watchGame(
      gameId,
      (incomingView, currentSeat) => {
        if (cancelled) return;
        if (hasInitialView && incomingView.engine.ply > prevPlyRef.current) {
          const lastMove = incomingView.moves[incomingView.moves.length - 1];
          if (lastMove?.promoted) playPromoteSound();
          else if (lastMove && lastMove.captured.length > 0) playCaptureSound();
          else playMoveSound();
          setSelectedPath([]);
        }
        hasInitialView = true;
        prevPlyRef.current = incomingView.engine.ply;
        setView(incomingView);
        const nextSeat = currentSeat ?? (saved?.role === 'spectator' ? saved : null);
        setSeat(nextSeat);
        if (nextSeat) saveSeat(gameId, nextSeat);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setNotFound(true);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setErrorMsg('Impossible de charger la partie. Vérifiez la connexion anonyme et les règles Firestore.');
        setLoading(false);
      },
    )
      .then((stopWatching) => {
        if (cancelled) stopWatching();
        else unsubscribe = stopWatching;
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg('Impossible de charger la partie. Vérifiez la connexion anonyme et les règles Firestore.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [gameId]);

  // Redirection automatique vers la partie revanche lorsqu'elle est prête
  useEffect(() => {
    if (!view?.rematchGameId || !seat?.seatToken) return;
    const newGameId = view.rematchGameId;
    // Transférer le même seatToken (conservé côté serveur avec les couleurs inversées)
    const swappedRole: PlayerColor | 'spectator' =
      seat.role === 'white' ? 'black' : seat.role === 'black' ? 'white' : 'spectator';
    saveSeat(newGameId, {
      role: swappedRole,
      pseudo: seat.pseudo,
      seatToken: seat.seatToken,
    });
    onNavigateGame(newGameId);
  }, [view?.rematchGameId, seat, onNavigateGame]);

  const isSpectator = !seat || seat.role === 'spectator';
  const myColor: PlayerColor | null =
    seat && (seat.role === 'white' || seat.role === 'black') ? seat.role : null;

  const isBothFull = Boolean(view?.white && view?.black);

  // Déterminer quel plateau afficher : Aperçu historique > Simulation > Partie réelle
  const isSimulationActive = Boolean(view?.simulation?.active && view.simulation.shared);
  const activeEngine = isSimulationActive && view?.simulation ? view.simulation.engine : view?.engine;

  const displayedBoard = useMemo(() => {
    if (!view) return {};
    if (previewPly !== null) {
      if (previewPly === 0) return createInitialBoard();
      const found = view.moves.find((m) => m.ply === previewPly);
      if (found) return found.boardAfter;
    }
    return activeEngine?.board ?? view.engine.board;
  }, [view, previewPly, activeEngine]);

  const legalMoves = useMemo<LegalMove[]>(() => {
    if (!view || !activeEngine || previewPly !== null) return [];
    if (isSimulationActive) {
      return getLegalMoves(activeEngine.board, activeEngine.turn);
    }
    if (view.status !== 'playing' || !myColor || activeEngine.turn !== myColor) {
      return [];
    }
    return getLegalMoves(activeEngine.board, myColor);
  }, [view, activeEngine, previewPly, isSimulationActive, myColor]);

  const canPlayOnBoard =
    !movePending &&
    !isSpectator &&
    previewPly === null &&
    !analysisMode &&
    ((isSimulationActive && view?.simulation?.active) ||
      (view?.status === 'playing' && myColor !== null && view.engine.turn === myColor));

  const pieceCounts = useMemo(() => countPieces(displayedBoard), [displayedBoard]);

  const lastMove = useMemo(() => {
    if (!view || previewPly !== null) return null;
    if (isSimulationActive && view.simulation) {
      const last = view.simulation.history[view.simulation.history.length - 1];
      return last ? { from: last.from, to: last.to } : null;
    }
    const last = view.moves[view.moves.length - 1];
    return last ? { from: last.from, to: last.to } : null;
  }, [view, previewPly, isSimulationActive]);

  const handleJoinSeat = async (asSpectator: boolean) => {
    if (!asSpectator && !joinPseudo.trim()) {
      setErrorMsg('Veuillez choisir un pseudonyme.');
      return;
    }
    setJoining(true);
    setErrorMsg(null);
    try {
      const result = await joinGame({
        gameId,
        pseudo: joinPseudo.trim() || 'Spectateur',
        asSpectator,
      });
      if (!result.ok) {
        setErrorMsg(result.error || 'Impossible de rejoindre la partie.');
        if (result.view) setView(result.view);
        return;
      }
      setView(result.view);
      setSeat(result.seat);
      saveSeat(gameId, result.seat);
      prevPlyRef.current = result.view.engine.ply;
    } catch {
      setErrorMsg('Impossible de rejoindre cette partie. Vérifiez les règles Firestore.');
    } finally {
      setJoining(false);
    }
  };

  const handleConfirmPresence = async () => {
    if (!seat?.seatToken) return;
    setErrorMsg(null);
    try {
      const result = await confirmPresence(gameId, seat.seatToken);
      if (result.ok) setView(result.view);
      else setErrorMsg(result.error);
    } catch {
      setErrorMsg('Impossible de confirmer la présence. Vérifiez les règles Firestore.');
    }
  };

  const submitBoardMove = useCallback(
    async (movePath: Coord[]) => {
      if (movePendingRef.current || !view || !seat?.seatToken || movePath.length < 2) return;
      movePendingRef.current = true;
      setMovePending(true);
      const from = movePath[0];
      const to = movePath[movePath.length - 1];
      setErrorMsg(null);

      try {
        if (isSimulationActive) {
          try {
            const result = await updateSimulation(gameId, seat.seatToken, {
              type: 'move',
              from,
              to,
              path: movePath,
            });
            if (result.ok) {
              setView(result.view);
              setSelectedPath([]);
              playMoveSound();
            } else {
              setErrorMsg(result.error);
              setSelectedPath([]);
            }
          } catch {
            setErrorMsg('Impossible de modifier la simulation. Vérifiez les règles Firestore.');
            setSelectedPath([]);
          }
          return;
        }

        try {
          const result = await submitMove({
            gameId,
            seatToken: seat.seatToken,
            expectedVersion: view.version,
            from,
            to,
            path: movePath,
          });
          if (result.ok) {
            setView(result.view);
            setSelectedPath([]);
            prevPlyRef.current = result.view.engine.ply;
            if (result.move?.promoted) playPromoteSound();
            else if (result.move?.captured?.length > 0) playCaptureSound();
            else playMoveSound();
          } else {
            setErrorMsg(result.error || 'Coup refusé.');
            if (result.view) setView(result.view);
            setSelectedPath([]);
          }
        } catch {
          setErrorMsg('Impossible d’enregistrer le coup. Vérifiez les règles Firestore.');
          setSelectedPath([]);
        }
      } finally {
        movePendingRef.current = false;
        setMovePending(false);
      }
    },
    [view, seat?.seatToken, gameId, isSimulationActive],
  );

  const sendAnnotationAction = useCallback(
    async (action: AnnotationAction) => {
      if (!seat?.seatToken) return;
      try {
        const result = await updateAnnotations(gameId, seat.seatToken, action);
        if (result.ok) setView(result.view);
        else setErrorMsg(result.error);
      } catch {
        setErrorMsg('Impossible d’enregistrer les annotations. Vérifiez les règles Firestore.');
      }
    },
    [gameId, seat?.seatToken],
  );

  const sendSimulationAction = useCallback(
    async (action: SimulationAction) => {
      if (!seat?.seatToken) return;
      setSelectedPath([]);
      try {
        const result = await updateSimulation(gameId, seat.seatToken, action);
        if (result.ok) setView(result.view);
        else setErrorMsg(result.error);
      } catch {
        setErrorMsg('Impossible de modifier la simulation. Vérifiez les règles Firestore.');
      }
    },
    [gameId, seat?.seatToken],
  );

  const handleSquareClick = useCallback(
    (coord: Coord) => {
      if (movePendingRef.current) return;
      if (!view) return;

      // 1. Mode analyse pédagogique (jamais de modification de la partie réelle)
      if (analysisMode && !isSpectator) {
        if (analysisTool === 'highlight') {
          if (displayedBoard[coord]) {
            void sendAnnotationAction({
              type: 'toggle_highlight',
              coord,
              color: activeColor,
            });
          }
        } else if (analysisTool === 'square') {
          void sendAnnotationAction({
            type: 'toggle_square',
            coord,
            color: activeSquareColor,
          });
        } else if (analysisTool === 'arrow') {
          if (draftArrowPoints.length === 0) {
            setDraftArrowPoints([coord]);
          } else if (draftArrowPoints[draftArrowPoints.length - 1] === coord) {
            // Double-clic / clic sur la dernière case pour valider une flèche multi-segments
            if (draftArrowPoints.length >= 2) {
              void sendAnnotationAction({
                type: 'add_arrow',
                points: draftArrowPoints,
                color: activeColor,
              });
            }
            setDraftArrowPoints([]);
          } else {
            const nextPts = [...draftArrowPoints, coord];
            // Si on a 2 points et l'utilisateur continue ou s'il veut une flèche simple directe ?
            // Garder en brouillon si multi-segment ou valider facilement : pour fluidité maximale,
            // si 2 points sont différents, on propose le bouton "Valider flèche" OU un 2e clic si souhaité,
            // MAIS pour une expérience immédiate 2-clics, validons directement à 2 points si ce n'est pas un tracé multi-étapes ?
            // Mieux : on laisse en brouillon s'il veut continuer une combinaison, mais s'il clique sur "Valider flèche" ou re-clique la case finale ça valide!
            // Encore plus intuitif : on affiche l'aperçu immédiatement dès 2 points, et si on clique sur une 3e case ça prolonge la flèche; si on clique sur la même case ou "Valider flèche" ça publie!
            setDraftArrowPoints(nextPts);
          }
        }
        return;
      }

      // 2. Mode jeu ou simulation
      if (!canPlayOnBoard) return;
      if (!isDarkCoord(coord)) return;

      // Si aucune pièce sélectionnée
      if (selectedPath.length === 0) {
        const hasMovesFromHere = legalMoves.some((m) => m.from === coord);
        if (hasMovesFromHere) {
          setSelectedPath([coord]);
        }
        return;
      }

      // Clic sur la case déjà sélectionnée -> annuler sélection
      if (selectedPath[selectedPath.length - 1] === coord) {
        setSelectedPath([]);
        return;
      }

      // Clic sur une autre pièce jouable au tout début -> changer de sélection
      if (selectedPath.length === 1 && legalMoves.some((m) => m.from === coord)) {
        setSelectedPath([coord]);
        return;
      }

      // Vérifier si `coord` est une étape suivante valide pour `selectedPath`
      const nextStepIdx = selectedPath.length;
      const matching = legalMoves.filter((m) => {
        if (m.path.length <= nextStepIdx) return false;
        for (let i = 0; i < selectedPath.length; i++) {
          if (m.path[i] !== selectedPath[i]) return false;
        }
        return m.path[nextStepIdx] === coord;
      });

      if (matching.length === 0) {
        // Clic ailleurs -> annuler la sélection si on est à l'étape 1
        if (selectedPath.length === 1) {
          setSelectedPath([]);
        }
        return;
      }

      const extendedPath = [...selectedPath, coord];
      const exactFinished = matching.filter((m) => m.path.length === extendedPath.length);
      const hasLongerExtensions = matching.some((m) => m.path.length > extendedPath.length);

      if (exactFinished.length > 0 && !hasLongerExtensions) {
        void submitBoardMove(extendedPath);
      } else {
        setSelectedPath(extendedPath);
      }
    },
    [
      view,
      analysisMode,
      isSpectator,
      analysisTool,
      displayedBoard,
      activeColor,
      activeSquareColor,
      draftArrowPoints,
      canPlayOnBoard,
      selectedPath,
      legalMoves,
      sendAnnotationAction,
      submitBoardMove,
    ],
  );

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setErrorMsg(`Lien d’invitation : ${inviteUrl}`);
    }
  };

  const handleResign = async () => {
    if (!seat?.seatToken) return;
    if (!confirmResign) {
      setConfirmResign(true);
      window.setTimeout(() => setConfirmResign(false), 4000);
      return;
    }
    setConfirmResign(false);
    try {
      const result = await resignGame(gameId, seat.seatToken);
      if (result.ok) setView(result.view);
      else setErrorMsg(result.error);
    } catch {
      setErrorMsg('Impossible d’abandonner la partie. Vérifiez les règles Firestore.');
    }
  };

  const handleRematch = async () => {
    if (!seat?.seatToken) return;
    try {
      const result = await requestRematch(gameId, seat.seatToken);
      if (result.ok) setView(result.view);
      else setErrorMsg(result.error);
    } catch {
      setErrorMsg('Impossible de demander une revanche. Vérifiez les règles Firestore.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F1F3F5] flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600">Chargement de la partie...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F1F3F5] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Partie introuvable</h1>
          <p className="text-sm text-slate-600">
            Ce lien d’invitation ne correspond à aucune partie active ou archivée.
          </p>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-5 py-2.5 bg-emerald-800 text-white text-sm font-medium rounded-lg hover:bg-emerald-900"
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="min-h-screen bg-[#F1F3F5] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Partie indisponible</h1>
          <p role="alert" className="text-sm text-slate-600">
            {errorMsg || 'Impossible de charger la partie. Veuillez réessayer.'}
          </p>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-5 py-2.5 bg-emerald-800 text-white text-sm font-medium rounded-lg hover:bg-emerald-900"
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    );
  }

  const topPlayer = view.black; // Noirs toujours en haut
  const bottomPlayer = view.white; // Blancs toujours en bas

  const mySeatObj =
    myColor === 'white' ? view.white : myColor === 'black' ? view.black : null;
  const needsMyConfirmation =
    !isSpectator &&
    mySeatObj &&
    !mySeatObj.confirmed &&
    (view.status === 'waiting' || view.status === 'confirming');

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Rejoins ma partie de dames internationales sur Dames Master : ${inviteUrl}`,
  )}`;

  const turnStatusText = (() => {
    if (view.status === 'waiting') return 'En attente du deuxième joueur';
    if (view.status === 'confirming') {
      if (needsMyConfirmation) return 'Confirmez votre présence pour démarrer';
      return 'En attente de la confirmation de l’adversaire';
    }
    if (view.status === 'finished') {
      if (view.engine.winner === 'draw') return 'Partie terminée — Match nul';
      return view.engine.winner === 'white'
        ? 'Partie terminée — Victoire des Blancs'
        : 'Partie terminée — Victoire des Noirs';
    }
    if (isSpectator) {
      return `Tour des ${view.engine.turn === 'white' ? 'Blancs' : 'Noirs'} (Spectateur)`;
    }
    return view.engine.turn === myColor ? 'À toi de jouer' : 'En attente de l’adversaire';
  })();

  const forcedCaptureCount = legalMoves[0]?.captured.length ?? 0;
  const finishedBoardMessage =
    view.status !== 'finished'
      ? null
      : (() => {
          const endReason = END_REASON_LABELS[view.engine.endReason];
          if (view.engine.winner === 'draw') {
            return {
              outcome: 'draw' as const,
              title: isSpectator ? 'Match nul' : `Bien joué, ${seat.pseudo} !`,
              message: 'La partie se termine sans vainqueur.',
              detail: endReason,
            };
          }
          if (view.engine.winner === 'none') {
            return {
              outcome: 'spectator' as const,
              title: 'Partie terminée',
              message: 'La partie est terminée.',
              detail: endReason,
            };
          }

          const winnerColor = view.engine.winner;
          const winnerPseudo =
            (winnerColor === 'white' ? view.white?.pseudo : view.black?.pseudo) ??
            (winnerColor === 'white' ? 'Les Blancs' : 'Les Noirs');
          if (isSpectator) {
            return {
              outcome: 'spectator' as const,
              title: `${winnerPseudo} a gagné`,
              message: 'La partie est terminée.',
              detail: endReason,
            };
          }
          if (myColor === winnerColor) {
            return {
              outcome: 'winner' as const,
              title: `Bravo, ${seat.pseudo} !`,
              message: 'Vous avez remporté la partie.',
              detail: endReason,
            };
          }
          return {
            outcome: 'loser' as const,
            title: `Partie terminée, ${seat.pseudo}`,
            message: `${winnerPseudo} a remporté la partie. Vous avez perdu.`,
            detail: endReason,
          };
        })();

  return (
    <div className="min-h-screen bg-[#F1F3F5] text-slate-900 flex flex-col">
      {/* Barre supérieure compacte */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onNavigateHome}
              aria-label="Retour à l'accueil"
              className="p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="font-display text-lg font-bold text-slate-900 whitespace-nowrap shrink-0">
              Dames Master
            </span>
            <span className="hidden sm:inline text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="hidden sm:inline font-mono text-xs text-slate-500 tabular-nums truncate">
              Partie {view.id}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {view.spectatorCount > 0 && (
              <span className="hidden md:inline-flex items-center gap-1 text-xs text-slate-500 mr-2 tabular-nums">
                <Users className="w-3.5 h-3.5" />
                <span>{view.spectatorCount} spectateur(s)</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                const next = !muted;
                setMuted(next);
                setSoundMuted(next);
              }}
              aria-label={muted ? 'Activer le son' : 'Couper le son'}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onOpenRules}
              aria-label="Règles officielles"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Règles</span>
            </button>
          </div>
        </div>
      </header>

      {/* Espace de jeu principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Colonne centrale/gauche : Joueur haut + Plateau + Joueur bas */}
        <section className="lg:col-span-7 xl:col-span-7 space-y-2.5">
          {/* Bannière de statut du tour / simulation / aperçu */}
          <div
            data-testid="turn-banner"
            className={`px-4 py-2.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-sm ${
              isSimulationActive
                ? 'bg-sky-50 border-sky-200 text-sky-950'
                : previewPly !== null
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : view.status === 'playing' && view.engine.turn === myColor
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950 font-semibold'
                    : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span>
                {previewPly !== null
                  ? `Aperçu visuel du coup #${previewPly} (partie réelle inchangée)`
                  : isSimulationActive
                    ? `Mode simulation — Tour des ${activeEngine?.turn === 'white' ? 'Blancs' : 'Noirs'}`
                    : turnStatusText}
              </span>
              {canPlayOnBoard && forcedCaptureCount > 0 && (
                <span className="text-xs font-semibold text-amber-800">
                  · Prise obligatoire ({forcedCaptureCount})
                </span>
              )}
            </div>

            {selectedPath.length > 1 && (
              <button
                type="button"
                onClick={() => setSelectedPath([])}
                className="text-xs font-semibold text-slate-700 underline hover:text-slate-950 whitespace-nowrap"
              >
                Annuler l’étape
              </button>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-800 flex items-center justify-between gap-2"
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-red-900 font-semibold underline shrink-0"
              >
                Fermer
              </button>
            </div>
          )}

          {/* Barre Joueur du HAUT (Noirs — fixe en haut) */}
          <div
            data-testid="top-player-bar"
            className={`px-3.5 py-2.5 bg-white border rounded-lg flex items-center justify-between gap-3 ${
              activeEngine?.turn === 'black' && view.status === 'playing'
                ? 'border-emerald-700'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-5 h-5 rounded-full bg-[#1F1F24] border border-black shrink-0 shadow-xs"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {topPlayer ? topPlayer.pseudo : 'Place disponible (Noirs)'}
                  </span>
                  {myColor === 'black' && (
                    <span className="text-xs font-medium text-emerald-800">(Vous)</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Noirs</span>
                  <span aria-hidden="true">·</span>
                  {topPlayer ? (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        topPlayer.connected ? 'text-emerald-700' : 'text-red-700 font-medium'
                      }`}
                    >
                      {topPlayer.connected ? (
                        <Wifi className="w-3 h-3" />
                      ) : (
                        <WifiOff className="w-3 h-3" />
                      )}
                      <span>{topPlayer.connected ? 'Connecté' : 'Joueur déconnecté'}</span>
                    </span>
                  ) : (
                    <span>En attente</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                {pieceCounts.black}
              </div>
              <div className="text-[11px] text-slate-500">pièce(s)</div>
            </div>
          </div>

          {/* Plateau 10x10 central */}
          <DraughtsBoard
            board={displayedBoard}
            legalMoves={legalMoves}
            canPlay={canPlayOnBoard}
            analysisMode={analysisMode}
            analysisTool={analysisTool}
            activeColor={activeColor}
            activeSquareColor={activeSquareColor}
            annotations={view.annotations}
            draftArrowPoints={draftArrowPoints}
            lastMove={lastMove}
            selectedPath={selectedPath}
            isSimulation={isSimulationActive}
            isHistoryPreview={previewPly !== null}
            movePending={movePending}
            finishedMessage={finishedBoardMessage}
            onSquareClick={handleSquareClick}
          />

          {/* Barre Joueur du BAS (Blancs — fixe en bas) */}
          <div
            data-testid="bottom-player-bar"
            className={`px-3.5 py-2.5 bg-white border rounded-lg flex items-center justify-between gap-3 ${
              activeEngine?.turn === 'white' && view.status === 'playing'
                ? 'border-emerald-700'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-5 h-5 rounded-full bg-[#FAF8F2] border border-slate-400 shrink-0 shadow-xs"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {bottomPlayer ? bottomPlayer.pseudo : 'Place disponible (Blancs)'}
                  </span>
                  {myColor === 'white' && (
                    <span className="text-xs font-medium text-emerald-800">(Vous)</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Blancs</span>
                  <span aria-hidden="true">·</span>
                  {bottomPlayer ? (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        bottomPlayer.connected ? 'text-emerald-700' : 'text-red-700 font-medium'
                      }`}
                    >
                      {bottomPlayer.connected ? (
                        <Wifi className="w-3 h-3" />
                      ) : (
                        <WifiOff className="w-3 h-3" />
                      )}
                      <span>{bottomPlayer.connected ? 'Connecté' : 'Joueur déconnecté'}</span>
                    </span>
                  ) : (
                    <span>En attente</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                {pieceCounts.white}
              </div>
              <div className="text-[11px] text-slate-500">pièce(s)</div>
            </div>
          </div>
        </section>

        {/* Colonne droite : Accès / Invitation / Analyse / Historique */}
        <aside className="lg:col-span-5 xl:col-span-5 space-y-4">
          {/* Carte Rejoindre si le visiteur n'a pas encore de siège */}
          {!seat && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              {!isBothFull ? (
                <>
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-slate-900">
                      Rejoindre cette partie
                    </h2>
                    <p className="text-xs text-slate-600">
                      Une place est libre ({!view.white ? 'Blancs' : 'Noirs'}). Saisissez votre
                      pseudonyme pour prendre place automatiquement.
                    </p>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleJoinSeat(false);
                    }}
                    className="space-y-3"
                  >
                    <label htmlFor="visitor-pseudo" className="sr-only">
                      Votre pseudonyme
                    </label>
                    <input
                      id="visitor-pseudo"
                      type="text"
                      maxLength={30}
                      value={joinPseudo}
                      onChange={(e) => setJoinPseudo(e.target.value)}
                      placeholder="Votre pseudonyme"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                    <button
                      type="submit"
                      data-testid="join-seat-btn"
                      disabled={joining}
                      className="w-full py-2.5 px-4 bg-emerald-800 text-white text-sm font-semibold rounded-lg hover:bg-emerald-900 disabled:opacity-50 transition-colors"
                    >
                      {joining ? 'Connexion...' : 'Prendre la place disponible'}
                    </button>
                  </form>
                </>
              ) : (
                <div className="space-y-3">
                  <h2 className="text-base font-semibold text-slate-900">Partie complète</h2>
                  <p className="text-sm text-slate-600" data-testid="room-full-message">
                    Les deux places sont occupées ({view.white?.pseudo} et {view.black?.pseudo}).
                    Vous pouvez suivre la partie en direct sans modifier le jeu.
                  </p>
                  <button
                    type="button"
                    data-testid="enter-spectator-btn"
                    onClick={() => void handleJoinSeat(true)}
                    disabled={joining}
                    className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Rejoindre en mode spectateur
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Carte Confirmation de présence & Lien d'invitation */}
          {(view.status === 'waiting' || view.status === 'confirming') && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-slate-900">
                  Invitation et démarrage de la partie
                </h2>
                <p className="text-xs text-slate-600">
                  La partie démarre dès que les deux joueurs sont connectés et ont confirmé leur
                  présence.
                </p>
              </div>

              {/* Lien d'invitation + Copier + WhatsApp */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    aria-label="Lien d'invitation unique"
                    value={inviteUrl}
                    className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                  />
                  <button
                    type="button"
                    data-testid="copy-invite-btn"
                    onClick={handleCopyInvite}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Lien copié' : 'Copier le lien'}</span>
                  </button>
                </div>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="whatsapp-share-link"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Partager le lien sur WhatsApp</span>
                </a>
              </div>

              {/* État de confirmation des deux sièges */}
              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">
                    Blancs : <strong className="text-slate-900">{view.white?.pseudo || 'En attente'}</strong>
                  </span>
                  <span className={view.white?.confirmed ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                    {view.white?.confirmed ? 'Confirmé' : 'Non confirmé'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">
                    Noirs : <strong className="text-slate-900">{view.black?.pseudo || 'En attente'}</strong>
                  </span>
                  <span className={view.black?.confirmed ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                    {view.black?.confirmed ? 'Confirmé' : 'Non confirmé'}
                  </span>
                </div>
              </div>

              {needsMyConfirmation && (
                <button
                  type="button"
                  data-testid="confirm-presence-btn"
                  onClick={handleConfirmPresence}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-800 text-white text-sm font-semibold rounded-lg hover:bg-emerald-900 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmer ma présence</span>
                </button>
              )}
            </div>
          )}

          {/* Carte Résultat & Revanche lorsque la partie est terminée */}
          {view.status === 'finished' && (
            <div
              data-testid="game-over-card"
              className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-3"
            >
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  {view.engine.winner === 'draw'
                    ? 'Match nul'
                    : view.engine.winner === 'white'
                      ? 'Victoire des Blancs'
                      : 'Victoire des Noirs'}
                </h2>
                <p className="text-xs text-slate-600">
                  {END_REASON_LABELS[view.engine.endReason]}
                </p>
              </div>

              {!isSpectator && (
                <button
                  type="button"
                  data-testid="rematch-btn"
                  onClick={handleRematch}
                  disabled={view.rematchRequestedBy === myColor}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-800 text-white text-sm font-semibold rounded-lg hover:bg-emerald-900 disabled:opacity-60 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>
                    {view.rematchRequestedBy === myColor
                      ? 'Demande de revanche envoyée...'
                      : view.rematchRequestedBy
                        ? 'Accepter la revanche'
                        : 'Demander une revanche'}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Panneau principal Pédagogie / Historique */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 p-1 gap-1">
              <button
                type="button"
                data-testid="tab-analysis"
                onClick={() => setActiveTab('analysis')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'analysis'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Analyse & Simulation</span>
              </button>
              <button
                type="button"
                data-testid="tab-history"
                onClick={() => setActiveTab('history')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Historique ({view.moves.length})</span>
              </button>
            </div>

            <div className="p-4 sm:p-5">
              {activeTab === 'analysis' ? (
                <AnalysisPanel
                  isSpectator={isSpectator}
                  analysisMode={analysisMode}
                  analysisTool={analysisTool}
                  activeColor={activeColor}
                  activeSquareColor={activeSquareColor}
                  annotations={view.annotations}
                  draftArrowPoints={draftArrowPoints}
                  simulation={view.simulation}
                  localSimulationActive={isSimulationActive}
                  onToggleAnalysisMode={() => {
                    setAnalysisMode((v) => !v);
                    setDraftArrowPoints([]);
                  }}
                  onSelectTool={(t) => {
                    setAnalysisTool(t);
                    setDraftArrowPoints([]);
                  }}
                  onSelectColor={setActiveColor}
                  onSelectSquareColor={setActiveSquareColor}
                  onFinishArrow={() => {
                    if (draftArrowPoints.length >= 2) {
                      void sendAnnotationAction({
                        type: 'add_arrow',
                        points: draftArrowPoints,
                        color: activeColor,
                      });
                    }
                    setDraftArrowPoints([]);
                  }}
                  onCancelArrow={() => setDraftArrowPoints([])}
                  onRemoveArrow={(arrowId) =>
                    void sendAnnotationAction({ type: 'remove_arrow', arrowId })
                  }
                  onClearAnnotations={() => void sendAnnotationAction({ type: 'clear' })}
                  onSendNote={(text) => void sendAnnotationAction({ type: 'add_note', text })}
                  onStartSimulation={(shared) =>
                    void sendSimulationAction({ type: 'start', shared })
                  }
                  onUndoSimulation={() => void sendSimulationAction({ type: 'undo' })}
                  onResetSimulation={() => void sendSimulationAction({ type: 'reset' })}
                  onStopSimulation={() => void sendSimulationAction({ type: 'stop' })}
                  onToggleShareSimulation={(shared) =>
                    void sendSimulationAction({ type: 'set_shared', shared })
                  }
                />
              ) : (
                <MoveHistoryPanel
                  moves={view.moves}
                  previewPly={previewPly}
                  onSelectPreviewPly={setPreviewPly}
                />
              )}
            </div>
          </div>

          {/* Contrôles secondaires de la partie en cours */}
          {view.status === 'playing' && !isSpectator && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedLink ? 'Lien copié' : 'Partager le lien'}</span>
              </button>

              <button
                type="button"
                data-testid="resign-btn"
                onClick={handleResign}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  confirmResign
                    ? 'bg-red-700 text-white hover:bg-red-800'
                    : 'text-red-700 border border-red-200 hover:bg-red-50'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>
                  {confirmResign ? 'Confirmer l’abandon' : 'Abandonner la partie'}
                </span>
              </button>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
};
