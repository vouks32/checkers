import type {
  BoardState,
  Coord,
  EndReason,
  EngineState,
  LegalMove,
  Piece,
  PlayerColor,
} from '../types/game.ts';

export const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export const RANKS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

const DIAGONALS: ReadonlyArray<readonly [number, number]> = [
  [-1, 1],
  [1, 1],
  [-1, -1],
  [1, -1],
];

export function parseCoord(coord: string): { col: number; rank: number } | null {
  if (typeof coord !== 'string' || coord.length < 2 || coord.length > 3) {
    return null;
  }
  const colChar = coord[0].toUpperCase();
  const col = COLUMNS.indexOf(colChar as (typeof COLUMNS)[number]);
  if (col === -1) return null;
  const rank = Number(coord.slice(1));
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) return null;
  return { col, rank };
}

export function formatCoord(col: number, rank: number): Coord {
  return `${COLUMNS[col]}${rank}`;
}

export function isInBounds(col: number, rank: number): boolean {
  return col >= 0 && col <= 9 && rank >= 1 && rank <= 10;
}

export function isDarkSquare(col: number, rank: number): boolean {
  return (col + rank) % 2 === 1;
}

export function isDarkCoord(coord: Coord): boolean {
  const parsed = parseCoord(coord);
  if (!parsed) return false;
  return isDarkSquare(parsed.col, parsed.rank);
}

export function cloneBoard(board: BoardState): BoardState {
  const next: BoardState = {};
  for (const [key, piece] of Object.entries(board)) {
    next[key] = { color: piece.color, type: piece.type };
  }
  return next;
}

export function createInitialBoard(): BoardState {
  const board: BoardState = {};
  for (let rank = 1; rank <= 10; rank++) {
    for (let col = 0; col < 10; col++) {
      if (!isDarkSquare(col, rank)) continue;
      if (rank <= 4) {
        board[formatCoord(col, rank)] = { color: 'white', type: 'man' };
      } else if (rank >= 7) {
        board[formatCoord(col, rank)] = { color: 'black', type: 'man' };
      }
    }
  }
  return board;
}

export function serializePosition(board: BoardState, turn: PlayerColor): string {
  const keys = Object.keys(board).sort();
  const parts = keys.map((k) => {
    const p = board[k];
    return `${k}:${p.color === 'white' ? 'w' : 'b'}${p.type === 'king' ? 'k' : 'm'}`;
  });
  return `${turn}|${parts.join(',')}`;
}

export function createInitialEngineState(): EngineState {
  const board = createInitialBoard();
  const initialKey = serializePosition(board, 'white');
  return {
    board,
    turn: 'white',
    ply: 0,
    kingOnlyPlies: 0,
    endgame16Plies: 0,
    endgame5Plies: 0,
    positionCounts: { [initialKey]: 1 },
    winner: 'none',
    endReason: 'none',
  };
}

export function countPieces(board: BoardState): {
  white: number;
  black: number;
  whiteMen: number;
  whiteKings: number;
  blackMen: number;
  blackKings: number;
} {
  let whiteMen = 0;
  let whiteKings = 0;
  let blackMen = 0;
  let blackKings = 0;
  for (const piece of Object.values(board)) {
    if (piece.color === 'white') {
      if (piece.type === 'king') whiteKings++;
      else whiteMen++;
    } else {
      if (piece.type === 'king') blackKings++;
      else blackMen++;
    }
  }
  return {
    white: whiteMen + whiteKings,
    black: blackMen + blackKings,
    whiteMen,
    whiteKings,
    blackMen,
    blackKings,
  };
}

function getPromotionRank(color: PlayerColor): number {
  return color === 'white' ? 10 : 1;
}

interface CaptureSequence {
  path: Coord[]; // squares after origin: [step1, step2, ...]
  captured: Coord[];
}

function findManCaptureSequences(
  board: BoardState,
  pos: Coord,
  color: PlayerColor,
  alreadyCaptured: ReadonlySet<Coord>,
): CaptureSequence[] {
  const parsed = parseCoord(pos);
  if (!parsed) return [];
  const results: CaptureSequence[] = [];

  for (const [dc, dr] of DIAGONALS) {
    const midCol = parsed.col + dc;
    const midRank = parsed.rank + dr;
    const landCol = parsed.col + 2 * dc;
    const landRank = parsed.rank + 2 * dr;

    if (!isInBounds(midCol, midRank) || !isInBounds(landCol, landRank)) continue;

    const midCoord = formatCoord(midCol, midRank);
    const landCoord = formatCoord(landCol, landRank);

    const midPiece = board[midCoord];
    if (!midPiece || midPiece.color === color) continue;
    if (alreadyCaptured.has(midCoord)) continue;
    if (board[landCoord]) continue;

    // Déplacer temporairement le pion tout en laissant les pièces déjà capturées sur le plateau (règle FMJD)
    const nextBoard = cloneBoard(board);
    const movingPiece = nextBoard[pos];
    delete nextBoard[pos];
    nextBoard[landCoord] = movingPiece;

    const nextCaptured = new Set(alreadyCaptured);
    nextCaptured.add(midCoord);

    const continuations = findManCaptureSequences(nextBoard, landCoord, color, nextCaptured);
    if (continuations.length === 0) {
      results.push({
        path: [landCoord],
        captured: [midCoord],
      });
    } else {
      for (const cont of continuations) {
        results.push({
          path: [landCoord, ...cont.path],
          captured: [midCoord, ...cont.captured],
        });
      }
    }
  }

  return results;
}

function findKingCaptureSequences(
  board: BoardState,
  pos: Coord,
  color: PlayerColor,
  alreadyCaptured: ReadonlySet<Coord>,
): CaptureSequence[] {
  const parsed = parseCoord(pos);
  if (!parsed) return [];
  const results: CaptureSequence[] = [];

  for (const [dc, dr] of DIAGONALS) {
    let step = 1;
    while (true) {
      const c = parsed.col + step * dc;
      const r = parsed.rank + step * dr;
      if (!isInBounds(c, r)) break;

      const sq = formatCoord(c, r);
      const occupant = board[sq];

      if (occupant) {
        // Bloqué par une pièce alliée ou déjà capturée pendant ce coup
        if (occupant.color === color || alreadyCaptured.has(sq)) {
          break;
        }

        // Pièce adverse trouvée : explorer toutes les cases libres derrière elle sur la même diagonale
        let landStep = step + 1;
        while (true) {
          const lc = parsed.col + landStep * dc;
          const lr = parsed.rank + landStep * dr;
          if (!isInBounds(lc, lr)) break;

          const landCoord = formatCoord(lc, lr);
          if (board[landCoord]) break;

          const nextBoard = cloneBoard(board);
          const movingPiece = nextBoard[pos];
          delete nextBoard[pos];
          nextBoard[landCoord] = movingPiece;

          const nextCaptured = new Set(alreadyCaptured);
          nextCaptured.add(sq);

          const continuations = findKingCaptureSequences(nextBoard, landCoord, color, nextCaptured);
          if (continuations.length === 0) {
            results.push({
              path: [landCoord],
              captured: [sq],
            });
          } else {
            for (const cont of continuations) {
              results.push({
                path: [landCoord, ...cont.path],
                captured: [sq, ...cont.captured],
              });
            }
          }

          landStep++;
        }
        // Une dame ne peut pas traverser deux pièces en un seul saut
        break;
      }

      step++;
    }
  }

  return results;
}

function findSimpleMovesForPiece(board: BoardState, pos: Coord, piece: Piece): LegalMove[] {
  const parsed = parseCoord(pos);
  if (!parsed) return [];
  const moves: LegalMove[] = [];

  if (piece.type === 'man') {
    const forwardDir = piece.color === 'white' ? 1 : -1;
    const promoRank = getPromotionRank(piece.color);
    for (const dc of [-1, 1]) {
      const nc = parsed.col + dc;
      const nr = parsed.rank + forwardDir;
      if (!isInBounds(nc, nr)) continue;
      const target = formatCoord(nc, nr);
      if (board[target]) continue;
      moves.push({
        from: pos,
        to: target,
        path: [pos, target],
        captured: [],
        promoted: nr === promoRank,
      });
    }
  } else {
    for (const [dc, dr] of DIAGONALS) {
      let step = 1;
      while (true) {
        const nc = parsed.col + step * dc;
        const nr = parsed.rank + step * dr;
        if (!isInBounds(nc, nr)) break;
        const target = formatCoord(nc, nr);
        if (board[target]) break;
        moves.push({
          from: pos,
          to: target,
          path: [pos, target],
          captured: [],
          promoted: false,
        });
        step++;
      }
    }
  }

  return moves;
}

/**
 * Calcule tous les coups légaux pour le joueur dont c'est le tour,
 * en appliquant strictement les règles internationales :
 * - prise obligatoire
 * - prise majoritaire (nombre maximal de pièces capturées)
 * - promotion différée à la fin de la séquence
 */
export function getLegalMoves(board: BoardState, turn: PlayerColor): LegalMove[] {
  const captureMoves: LegalMove[] = [];
  let maxCaptures = 0;

  for (const [pos, piece] of Object.entries(board)) {
    if (piece.color !== turn) continue;
    const sequences =
      piece.type === 'man'
        ? findManCaptureSequences(board, pos, turn, new Set())
        : findKingCaptureSequences(board, pos, turn, new Set());

    const promoRank = getPromotionRank(turn);

    for (const seq of sequences) {
      if (seq.captured.length === 0) continue;
      const dest = seq.path[seq.path.length - 1];
      const destParsed = parseCoord(dest);
      const promoted = piece.type === 'man' && destParsed !== null && destParsed.rank === promoRank;
      const move: LegalMove = {
        from: pos,
        to: dest,
        path: [pos, ...seq.path],
        captured: seq.captured,
        promoted,
      };
      if (move.captured.length > maxCaptures) {
        maxCaptures = move.captured.length;
      }
      captureMoves.push(move);
    }
  }

  if (maxCaptures > 0) {
    return captureMoves.filter((m) => m.captured.length === maxCaptures);
  }

  const simpleMoves: LegalMove[] = [];
  for (const [pos, piece] of Object.entries(board)) {
    if (piece.color !== turn) continue;
    simpleMoves.push(...findSimpleMovesForPiece(board, pos, piece));
  }
  return simpleMoves;
}

export function isMoveMatching(legalMove: LegalMove, candidate: { from: Coord; to: Coord; path?: Coord[] }): boolean {
  if (legalMove.from !== candidate.from || legalMove.to !== candidate.to) return false;
  if (candidate.path && candidate.path.length > 0) {
    if (legalMove.path.length !== candidate.path.length) return false;
    for (let i = 0; i < legalMove.path.length; i++) {
      if (legalMove.path[i] !== candidate.path[i]) return false;
    }
  }
  return true;
}

function isEndgame3v1(counts: ReturnType<typeof countPieces>): boolean {
  const whiteTotal = counts.white;
  const blackTotal = counts.black;
  return (
    (whiteTotal === 3 && counts.whiteKings >= 1 && blackTotal === 1 && counts.blackKings === 1) ||
    (blackTotal === 3 && counts.blackKings >= 1 && whiteTotal === 1 && counts.whiteKings === 1)
  );
}

function isEndgame2v1OrLess(counts: ReturnType<typeof countPieces>): boolean {
  const whiteTotal = counts.white;
  const blackTotal = counts.black;
  return (
    (whiteTotal <= 2 && counts.whiteKings >= 1 && blackTotal === 1 && counts.blackKings === 1) ||
    (blackTotal <= 2 && counts.blackKings >= 1 && whiteTotal === 1 && counts.whiteKings === 1)
  );
}

export function evaluateOutcome(state: EngineState): { winner: 'white' | 'black' | 'draw' | 'none'; endReason: EndReason } {
  const counts = countPieces(state.board);
  if (counts.white === 0) {
    return { winner: 'black', endReason: 'no_pieces' };
  }
  if (counts.black === 0) {
    return { winner: 'white', endReason: 'no_pieces' };
  }

  const nextLegalMoves = getLegalMoves(state.board, state.turn);
  if (nextLegalMoves.length === 0) {
    return {
      winner: state.turn === 'white' ? 'black' : 'white',
      endReason: 'no_moves',
    };
  }

  const posKey = serializePosition(state.board, state.turn);
  if ((state.positionCounts[posKey] ?? 0) >= 3) {
    return { winner: 'draw', endReason: 'threefold_repetition' };
  }

  if (state.kingOnlyPlies >= 50) {
    return { winner: 'draw', endReason: 'twenty_five_move_rule' };
  }

  if (state.endgame5Plies >= 10) {
    return { winner: 'draw', endReason: 'endgame_5_moves' };
  }

  if (state.endgame16Plies >= 32) {
    return { winner: 'draw', endReason: 'endgame_16_moves' };
  }

  return { winner: 'none', endReason: 'none' };
}

export function applyMove(
  state: EngineState,
  candidate: { from: Coord; to: Coord; path?: Coord[] },
): { ok: true; move: LegalMove; nextState: EngineState } | { ok: false; error: string } {
  if (state.winner !== 'none') {
    return { ok: false, error: 'La partie est déjà terminée.' };
  }

  const legalMoves = getLegalMoves(state.board, state.turn);
  const matching = legalMoves.filter((m) => isMoveMatching(m, candidate));

  if (matching.length === 0) {
    const hasMandatoryCapture = legalMoves.some((m) => m.captured.length > 0);
    if (hasMandatoryCapture) {
      return {
        ok: false,
        error: 'Coup illégal : une prise majoritaire obligatoire est disponible.',
      };
    }
    return { ok: false, error: 'Déplacement illégal selon les règles des dames internationales.' };
  }

  const move = matching[0];
  const movingPiece = state.board[move.from];
  if (!movingPiece) {
    return { ok: false, error: 'Aucune pièce sur la case de départ.' };
  }

  const nextBoard = cloneBoard(state.board);
  delete nextBoard[move.from];
  for (const cap of move.captured) {
    delete nextBoard[cap];
  }

  nextBoard[move.to] = {
    color: movingPiece.color,
    type: move.promoted ? 'king' : movingPiece.type,
  };

  const nextTurn: PlayerColor = state.turn === 'white' ? 'black' : 'white';
  const counts = countPieces(nextBoard);
  const isKingMoveNoCapture = movingPiece.type === 'king' && move.captured.length === 0;

  const kingOnlyPlies = isKingMoveNoCapture ? state.kingOnlyPlies + 1 : 0;
  const endgame16Plies = isEndgame3v1(counts) && move.captured.length === 0 ? state.endgame16Plies + 1 : 0;
  const endgame5Plies = isEndgame2v1OrLess(counts) && move.captured.length === 0 ? state.endgame5Plies + 1 : 0;

  const posKey = serializePosition(nextBoard, nextTurn);
  const positionCounts = {
    ...state.positionCounts,
    [posKey]: (state.positionCounts[posKey] ?? 0) + 1,
  };

  const draftState: EngineState = {
    board: nextBoard,
    turn: nextTurn,
    ply: state.ply + 1,
    kingOnlyPlies,
    endgame16Plies,
    endgame5Plies,
    positionCounts,
    winner: 'none',
    endReason: 'none',
  };

  const outcome = evaluateOutcome(draftState);
  const nextState: EngineState = {
    ...draftState,
    winner: outcome.winner,
    endReason: outcome.endReason,
  };

  return { ok: true, move, nextState };
}

export function encodeBoardForFirestore(board: BoardState): string[] {
  return Object.entries(board)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([coord, piece]) => `${piece.color === 'white' ? 'w' : 'b'}:${piece.type === 'king' ? 'k' : 'm'}:${coord}`);
}
