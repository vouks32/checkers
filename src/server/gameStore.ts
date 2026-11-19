import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyMove,
  cloneBoard,
  createInitialEngineState,
  parseCoord,
} from '../engine/draughts.ts';
import type {
  AnnotationColor,
  AnnotationsState,
  ClientSeatInfo,
  Coord,
  EngineState,
  GameSessionView,
  MoveRecord,
  PlayerColor,
  PlayerSeat,
  SimulationState,
  SquareMarkerColor,
} from '../types/game.ts';

interface StoredGame extends GameSessionView {
  whiteToken: string | null;
  blackToken: string | null;
}

function createEmptyAnnotations(): AnnotationsState {
  const now = new Date().toISOString();
  return {
    highlights: {},
    arrows: [],
    squareMarkers: {},
    notes: [],
    updatedBy: '',
    updatedAt: now,
  };
}

function cloneEngine(engine: EngineState): EngineState {
  return {
    board: cloneBoard(engine.board),
    turn: engine.turn,
    ply: engine.ply,
    kingOnlyPlies: engine.kingOnlyPlies,
    endgame16Plies: engine.endgame16Plies,
    endgame5Plies: engine.endgame5Plies,
    positionCounts: { ...engine.positionCounts },
    winner: engine.winner,
    endReason: engine.endReason,
  };
}

function sanitizePseudo(raw: string): string {
  const trimmed = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, 30);
}

function generateGameId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export class GameStore {
  private games = new Map<string, StoredGame>();
  private spectators = new Map<string, Set<string>>();
  private persistencePath: string | null;

  constructor(persistencePath: string | null = path.resolve(process.cwd(), 'data', 'games.json')) {
    this.persistencePath = persistencePath;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.persistencePath) return;
    try {
      if (fs.existsSync(this.persistencePath)) {
        const raw = fs.readFileSync(this.persistencePath, 'utf8');
        const parsed = JSON.parse(raw) as StoredGame[];
        if (Array.isArray(parsed)) {
          for (const g of parsed) {
            if (g && typeof g.id === 'string') {
              // On startup, mark sockets disconnected until clients reconnect
              if (g.white) g.white.connected = false;
              if (g.black) g.black.connected = false;
              this.games.set(g.id, g);
            }
          }
        }
      }
    } catch (err) {
      console.error('Erreur chargement parties sur disque:', err);
    }
  }

  private saveToDisk(): void {
    if (!this.persistencePath) return;
    try {
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.games.values());
      const tmpPath = `${this.persistencePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(list), 'utf8');
      fs.renameSync(tmpPath, this.persistencePath);
    } catch (err) {
      console.error('Erreur sauvegarde parties sur disque:', err);
    }
  }

  private toPublicView(game: StoredGame): GameSessionView {
    const spectatorSet = this.spectators.get(game.id);
    return {
      id: game.id,
      creatorColor: game.creatorColor,
      status: game.status,
      version: game.version,
      white: game.white ? { ...game.white } : null,
      black: game.black ? { ...game.black } : null,
      spectatorCount: spectatorSet ? spectatorSet.size : 0,
      engine: cloneEngine(game.engine),
      moves: game.moves.map((m) => ({ ...m, boardAfter: cloneBoard(m.boardAfter) })),
      annotations: {
        highlights: { ...game.annotations.highlights },
        arrows: game.annotations.arrows.map((a) => ({ ...a, points: [...a.points] })),
        squareMarkers: { ...game.annotations.squareMarkers },
        notes: game.annotations.notes.map((n) => ({ ...n })),
        updatedBy: game.annotations.updatedBy,
        updatedAt: game.annotations.updatedAt,
      },
      simulation: game.simulation
        ? {
            ...game.simulation,
            engine: cloneEngine(game.simulation.engine),
            history: game.simulation.history.map((h) => ({ ...h, boardAfter: cloneBoard(h.boardAfter) })),
          }
        : null,
      rematchRequestedBy: game.rematchRequestedBy,
      rematchGameId: game.rematchGameId,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    };
  }

  getGameView(gameId: string): GameSessionView | null {
    const game = this.games.get(gameId);
    return game ? this.toPublicView(game) : null;
  }

  identifySeat(gameId: string, seatToken?: string): PlayerColor | 'spectator' {
    const game = this.games.get(gameId);
    if (!game || !seatToken) return 'spectator';
    if (game.whiteToken && game.whiteToken === seatToken) return 'white';
    if (game.blackToken && game.blackToken === seatToken) return 'black';
    return 'spectator';
  }

  createGame(params: { pseudo: string; color: PlayerColor }): {
    ok: true;
    view: GameSessionView;
    seat: ClientSeatInfo;
  } | { ok: false; error: string } {
    const pseudo = sanitizePseudo(params.pseudo);
    if (!pseudo) {
      return { ok: false, error: 'Veuillez saisir un pseudonyme valide.' };
    }
    const color: PlayerColor = params.color === 'black' ? 'black' : 'white';
    let id = generateGameId();
    while (this.games.has(id)) {
      id = generateGameId();
    }
    const token = crypto.randomUUID();
    const now = new Date().toISOString();

    const creatorSeat: PlayerSeat = {
      pseudo,
      color,
      confirmed: false,
      connected: true,
      lastSeenAt: now,
    };

    const stored: StoredGame = {
      id,
      creatorColor: color,
      status: 'waiting',
      version: 1,
      white: color === 'white' ? creatorSeat : null,
      black: color === 'black' ? creatorSeat : null,
      whiteToken: color === 'white' ? token : null,
      blackToken: color === 'black' ? token : null,
      spectatorCount: 0,
      engine: createInitialEngineState(),
      moves: [],
      annotations: createEmptyAnnotations(),
      simulation: null,
      rematchRequestedBy: null,
      rematchGameId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.games.set(id, stored);
    this.saveToDisk();

    return {
      ok: true,
      view: this.toPublicView(stored),
      seat: { role: color, pseudo, seatToken: token },
    };
  }

  joinGame(params: {
    gameId: string;
    pseudo?: string;
    seatToken?: string;
    asSpectator?: boolean;
  }): {
    ok: true;
    view: GameSessionView;
    seat: ClientSeatInfo;
    restored: boolean;
  } | {
    ok: false;
    code: 'NOT_FOUND' | 'FULL' | 'INVALID_PSEUDO';
    error: string;
    view?: GameSessionView;
  } {
    const game = this.games.get(params.gameId);
    if (!game) {
      return { ok: false, code: 'NOT_FOUND', error: 'Partie introuvable.' };
    }

    const now = new Date().toISOString();

    // 1. Restauration automatique si seatToken correspond à un siège existant
    if (params.seatToken) {
      if (game.whiteToken === params.seatToken && game.white) {
        game.white.connected = true;
        game.white.lastSeenAt = now;
        game.updatedAt = now;
        this.saveToDisk();
        return {
          ok: true,
          view: this.toPublicView(game),
          seat: { role: 'white', pseudo: game.white.pseudo, seatToken: params.seatToken },
          restored: true,
        };
      }
      if (game.blackToken === params.seatToken && game.black) {
        game.black.connected = true;
        game.black.lastSeenAt = now;
        game.updatedAt = now;
        this.saveToDisk();
        return {
          ok: true,
          view: this.toPublicView(game),
          seat: { role: 'black', pseudo: game.black.pseudo, seatToken: params.seatToken },
          restored: true,
        };
      }
    }

    // 2. Mode spectateur explicite
    if (params.asSpectator) {
      const pseudo = sanitizePseudo(params.pseudo ?? '') || 'Spectateur';
      return {
        ok: true,
        view: this.toPublicView(game),
        seat: { role: 'spectator', pseudo },
        restored: false,
      };
    }

    // 3. Attribution du siège vacant (jamais écraser un siège déjà occupé!)
    const vacantColor: PlayerColor | null = !game.white ? 'white' : !game.black ? 'black' : null;
    if (!vacantColor) {
      return {
        ok: false,
        code: 'FULL',
        error: 'Les deux places sont déjà occupées.',
        view: this.toPublicView(game),
      };
    }

    const pseudo = sanitizePseudo(params.pseudo ?? '');
    if (!pseudo) {
      return {
        ok: false,
        code: 'INVALID_PSEUDO',
        error: 'Veuillez choisir un pseudonyme pour rejoindre la partie.',
        view: this.toPublicView(game),
      };
    }

    const token = crypto.randomUUID();
    const seat: PlayerSeat = {
      pseudo,
      color: vacantColor,
      confirmed: false,
      connected: true,
      lastSeenAt: now,
    };

    if (vacantColor === 'white') {
      game.white = seat;
      game.whiteToken = token;
    } else {
      game.black = seat;
      game.blackToken = token;
    }

    if (game.white && game.black && game.status === 'waiting') {
      game.status = 'confirming';
    }
    game.version += 1;
    game.updatedAt = now;
    this.saveToDisk();

    return {
      ok: true,
      view: this.toPublicView(game),
      seat: { role: vacantColor, pseudo, seatToken: token },
      restored: false,
    };
  }

  confirmPresence(gameId: string, seatToken: string): { ok: true; view: GameSessionView } | { ok: false; error: string } {
    const game = this.games.get(gameId);
    if (!game) return { ok: false, error: 'Partie introuvable.' };

    const role = this.identifySeat(gameId, seatToken);
    if (role === 'spectator') {
      return { ok: false, error: 'Seuls les joueurs assis peuvent confirmer leur présence.' };
    }

    const now = new Date().toISOString();
    if (role === 'white' && game.white) {
      game.white.confirmed = true;
      game.white.connected = true;
      game.white.lastSeenAt = now;
    } else if (role === 'black' && game.black) {
      game.black.confirmed = true;
      game.black.connected = true;
      game.black.lastSeenAt = now;
    }

    if (
      game.white?.confirmed &&
      game.black?.confirmed &&
      (game.status === 'waiting' || game.status === 'confirming')
    ) {
      game.status = 'playing';
    }

    game.version += 1;
    game.updatedAt = now;
    this.saveToDisk();
    return { ok: true, view: this.toPublicView(game) };
  }

  setConnectionState(gameId: string, role: PlayerColor | 'spectator', clientId: string, connected: boolean): GameSessionView | null {
    const game = this.games.get(gameId);
    if (!game) return null;
    const now = new Date().toISOString();

    if (role === 'spectator') {
      let set = this.spectators.get(gameId);
      if (!set) {
        set = new Set();
        this.spectators.set(gameId, set);
      }
      if (connected) set.add(clientId);
      else set.delete(clientId);
      return this.toPublicView(game);
    }

    if (role === 'white' && game.white) {
      game.white.connected = connected;
      game.white.lastSeenAt = now;
    } else if (role === 'black' && game.black) {
      game.black.connected = connected;
      game.black.lastSeenAt = now;
    }
    this.saveToDisk();
    return this.toPublicView(game);
  }

  submitMove(params: {
    gameId: string;
    seatToken: string;
    expectedVersion: number;
    from: Coord;
    to: Coord;
    path?: Coord[];
  }): { ok: true; view: GameSessionView; move: MoveRecord } | { ok: false; error: string; conflict?: boolean; view?: GameSessionView } {
    const game = this.games.get(params.gameId);
    if (!game) return { ok: false, error: 'Partie introuvable.' };

    const role = this.identifySeat(params.gameId, params.seatToken);
    if (role === 'spectator') {
      return { ok: false, error: 'Action refusée : vous êtes en mode spectateur.' };
    }

    if (game.status !== 'playing') {
      return { ok: false, error: 'La partie doit être active et confirmée par les deux joueurs.' };
    }

    if (params.expectedVersion !== game.version) {
      return {
        ok: false,
        conflict: true,
        error: 'Conflit de synchronisation : la position a déjà été mise à jour.',
        view: this.toPublicView(game),
      };
    }

    if (game.engine.turn !== role) {
      return { ok: false, error: 'Ce n’est pas votre tour de jouer.' };
    }

    const result = applyMove(game.engine, {
      from: params.from,
      to: params.to,
      path: params.path,
    });

    if (!result.ok) {
      return { ok: false, error: result.error, view: this.toPublicView(game) };
    }

    const now = new Date().toISOString();
    const playerPseudo = role === 'white' ? game.white?.pseudo ?? 'Blancs' : game.black?.pseudo ?? 'Noirs';

    const record: MoveRecord = {
      id: `${result.nextState.ply}-${result.move.from}-${result.move.to}`,
      ply: result.nextState.ply,
      color: role,
      pseudo: playerPseudo,
      from: result.move.from,
      to: result.move.to,
      path: result.move.path,
      captured: result.move.captured,
      promoted: result.move.promoted,
      boardAfter: cloneBoard(result.nextState.board),
      createdAt: now,
    };

    game.engine = result.nextState;
    game.moves.push(record);
    // Déplacer automatiquement la surbrillance si le pion déplacé était sélectionné
    const movedHighlight = game.annotations.highlights[result.move.from];
    if (movedHighlight) {
      delete game.annotations.highlights[result.move.from];
      game.annotations.highlights[result.move.to] = movedHighlight;
    }
    for (const capCoord of result.move.captured) {
      delete game.annotations.highlights[capCoord];
    }
    if (game.engine.winner !== 'none') {
      game.status = 'finished';
    }
    game.version += 1;
    game.updatedAt = now;
    this.saveToDisk();

    return { ok: true, view: this.toPublicView(game), move: record };
  }

  resignGame(gameId: string, seatToken: string): { ok: true; view: GameSessionView } | { ok: false; error: string } {
    const game = this.games.get(gameId);
    if (!game) return { ok: false, error: 'Partie introuvable.' };

    const role = this.identifySeat(gameId, seatToken);
    if (role === 'spectator') {
      return { ok: false, error: 'Un spectateur ne peut pas abandonner la partie.' };
    }
    if (game.status === 'finished') {
      return { ok: false, error: 'La partie est déjà terminée.' };
    }

    const now = new Date().toISOString();
    game.engine.winner = role === 'white' ? 'black' : 'white';
    game.engine.endReason = 'resignation';
    game.status = 'finished';
    game.version += 1;
    game.updatedAt = now;
    this.saveToDisk();

    return { ok: true, view: this.toPublicView(game) };
  }

  requestRematch(gameId: string, seatToken: string): {
    ok: true;
    view: GameSessionView;
    newGameView?: GameSessionView;
    newSeatTokens?: { whiteToken: string | null; blackToken: string | null };
  } | { ok: false; error: string } {
    const game = this.games.get(gameId);
    if (!game) return { ok: false, error: 'Partie introuvable.' };

    const role = this.identifySeat(gameId, seatToken);
    if (role === 'spectator') {
      return { ok: false, error: 'Seuls les joueurs peuvent demander une revanche.' };
    }

    if (game.rematchGameId) {
      return { ok: true, view: this.toPublicView(game) };
    }

    const now = new Date().toISOString();

    if (!game.rematchRequestedBy) {
      game.rematchRequestedBy = role;
      game.version += 1;
      game.updatedAt = now;
      this.saveToDisk();
      return { ok: true, view: this.toPublicView(game) };
    }

    if (game.rematchRequestedBy === role) {
      return { ok: true, view: this.toPublicView(game) };
    }

    // L'adversaire accepte la revanche : créer une nouvelle partie avec les couleurs inversées
    let newId = generateGameId();
    while (this.games.has(newId)) {
      newId = generateGameId();
    }

    const newWhiteToken = game.blackToken ?? crypto.randomUUID();
    const newBlackToken = game.whiteToken ?? crypto.randomUUID();

    const newGame: StoredGame = {
      id: newId,
      creatorColor: game.creatorColor === 'white' ? 'black' : 'white',
      status: 'playing',
      version: 1,
      white: game.black
        ? { pseudo: game.black.pseudo, color: 'white', confirmed: true, connected: true, lastSeenAt: now }
        : null,
      black: game.white
        ? { pseudo: game.white.pseudo, color: 'black', confirmed: true, connected: true, lastSeenAt: now }
        : null,
      whiteToken: newWhiteToken,
      blackToken: newBlackToken,
      spectatorCount: 0,
      engine: createInitialEngineState(),
      moves: [],
      annotations: createEmptyAnnotations(),
      simulation: null,
      rematchRequestedBy: null,
      rematchGameId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.games.set(newId, newGame);
    game.rematchGameId = newId;
    game.version += 1;
    game.updatedAt = now;
    this.saveToDisk();

    return {
      ok: true,
      view: this.toPublicView(game),
      newGameView: this.toPublicView(newGame),
      newSeatTokens: { whiteToken: newWhiteToken, blackToken: newBlackToken },
    };
  }

  // --- Mode Pédagogique / Annotations (ne modifie JAMAIS l'état réel de la partie) ---

  updateAnnotations(
    gameId: string,
    seatToken: string,
    action:
      | { type: 'toggle_highlight'; coord: Coord; color: AnnotationColor }
      | { type: 'add_arrow'; points: Coord[]; color: AnnotationColor }
      | { type: 'remove_arrow'; arrowId: string }
      | { type: 'toggle_square'; coord: Coord; color: SquareMarkerColor }
      | { type: 'add_note'; text: string }
      | { type: 'clear' },
  ): { ok: true; view: GameSessionView } | { ok: false; error: string } {
    const game = this.games.get(gameId);
    if (!game) return { ok: false, error: 'Partie introuvable.' };

    const role = this.identifySeat(gameId, seatToken);
    if (role === 'spectator') {
      return { ok: false, error: 'Seuls les joueurs peuvent annoter le plateau.' };
    }

    const pseudo = role === 'white' ? game.white?.pseudo ?? 'Blancs' : game.black?.pseudo ?? 'Noirs';
    const now = new Date().toISOString();

    if (action.type === 'toggle_highlight') {
      if (!parseCoord(action.coord)) return { ok: false, error: 'Coordonnée invalide.' };
      if (game.annotations.highlights[action.coord] === action.color) {
        delete game.annotations.highlights[action.coord];
      } else {
        game.annotations.highlights[action.coord] = action.color;
      }
    } else if (action.type === 'add_arrow') {
      if (!Array.isArray(action.points) || action.points.length < 2) {
        return { ok: false, error: 'Une flèche nécessite au moins deux cases.' };
      }
      const validPoints = action.points.filter((p) => parseCoord(p) !== null).slice(0, 8);
      if (validPoints.length < 2) return { ok: false, error: 'Coordonnées de flèche invalides.' };
      game.annotations.arrows.push({
        id: crypto.randomBytes(4).toString('hex'),
        points: validPoints,
        color: action.color,
      });
      if (game.annotations.arrows.length > 24) {
        game.annotations.arrows.shift();
      }
    } else if (action.type === 'remove_arrow') {
      game.annotations.arrows = game.annotations.arrows.filter((a) => a.id !== action.arrowId);
    } else if (action.type === 'toggle_square') {
      if (!parseCoord(action.coord)) return { ok: false, error: 'Coordonnée invalide.' };
      if (game.annotations.squareMarkers[action.coord] === action.color) {
        delete game.annotations.squareMarkers[action.coord];
      } else {
        game.annotations.squareMarkers[action.coord] = action.color;
      }
    } else if (action.type === 'add_note') {
      const clean = String(action.text ?? '').trim().slice(0, 500);
      if (!clean) return { ok: false, error: 'Le message explicatif est vide.' };
      game.annotations.notes.push({
        id: crypto.randomBytes(4).toString('hex'),
        authorPseudo: pseudo,
        authorRole: role,
        text: clean,
        createdAt: now,
      });
      if (game.annotations.notes.length > 40) {
        game.annotations.notes.shift();
      }
    } else if (action.type === 'clear') {
      game.annotations.highlights = {};
      game.annotations.arrows = [];
      game.annotations.squareMarkers = {};
    }

    game.annotations.updatedBy = pseudo;
    game.annotations.updatedAt = now;
    game.updatedAt = now;
    this.saveToDisk();

    return { ok: true, view: this.toPublicView(game) };
  }

  // --- Mode Simulation (copie temporaire, n'altère jamais game.engine) ---

  updateSimulation(
    gameId: string,
    seatToken: string,
    action:
      | { type: 'start'; shared: boolean }
      | { type: 'move'; from: Coord; to: Coord; path?: Coord[] }
      | { type: 'undo' }
      | { type: 'reset' }
      | { type: 'stop' }
      | { type: 'set_shared'; shared: boolean },
  ): { ok: true; view: GameSessionView } | { ok: false; error: string } {
    const game = this.games.get(gameId);
    if (!game) return { ok: false, error: 'Partie introuvable.' };

    const role = this.identifySeat(gameId, seatToken);
    if (role === 'spectator') {
      return { ok: false, error: 'Seuls les joueurs peuvent piloter la simulation partagée.' };
    }

    const pseudo = role === 'white' ? game.white?.pseudo ?? 'Blancs' : game.black?.pseudo ?? 'Noirs';
    const now = new Date().toISOString();

    if (action.type === 'start') {
      const sim: SimulationState = {
        active: true,
        shared: Boolean(action.shared),
        controllerPseudo: pseudo,
        engine: cloneEngine(game.engine),
        history: [],
      };
      game.simulation = sim;
    } else if (action.type === 'stop') {
      game.simulation = null;
    } else if (action.type === 'reset') {
      game.simulation = {
        active: true,
        shared: game.simulation?.shared ?? true,
        controllerPseudo: pseudo,
        engine: cloneEngine(game.engine),
        history: [],
      };
    } else if (action.type === 'set_shared') {
      if (!game.simulation) return { ok: false, error: 'Aucune simulation active.' };
      game.simulation.shared = Boolean(action.shared);
    } else if (action.type === 'move') {
      if (!game.simulation) {
        game.simulation = {
          active: true,
          shared: true,
          controllerPseudo: pseudo,
          engine: cloneEngine(game.engine),
          history: [],
        };
      }
      const res = applyMove(game.simulation.engine, {
        from: action.from,
        to: action.to,
        path: action.path,
      });
      if (!res.ok) {
        return { ok: false, error: `Simulation : ${res.error}` };
      }
      game.simulation.engine = res.nextState;
      game.simulation.history.push({
        id: `sim-${res.nextState.ply}-${res.move.from}-${res.move.to}`,
        ply: res.nextState.ply,
        color: game.simulation.engine.turn === 'white' ? 'black' : 'white',
        pseudo,
        from: res.move.from,
        to: res.move.to,
        path: res.move.path,
        captured: res.move.captured,
        promoted: res.move.promoted,
        boardAfter: cloneBoard(res.nextState.board),
        createdAt: now,
      });
    } else if (action.type === 'undo') {
      if (!game.simulation || game.simulation.history.length === 0) {
        return { ok: false, error: 'Aucun coup simulé à annuler.' };
      }
      // Rejouer depuis la position réelle moins le dernier coup simulé
      const remaining = game.simulation.history.slice(0, -1);
      let rebuilt = cloneEngine(game.engine);
      for (const step of remaining) {
        const applied = applyMove(rebuilt, { from: step.from, to: step.to, path: step.path });
        if (applied.ok) rebuilt = applied.nextState;
      }
      game.simulation.engine = rebuilt;
      game.simulation.history = remaining;
    }

    game.updatedAt = now;
    this.saveToDisk();
    return { ok: true, view: this.toPublicView(game) };
  }
}
