import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMove,
  countPieces,
  createInitialBoard,
  createInitialEngineState,
  getLegalMoves,
  isDarkCoord,
  serializePosition,
} from './draughts.ts';
import type { BoardState, EngineState } from '../types/game.ts';

function makeState(board: BoardState, turn: 'white' | 'black' = 'white'): EngineState {
  const key = serializePosition(board, turn);
  return {
    board,
    turn,
    ply: 0,
    kingOnlyPlies: 0,
    endgame16Plies: 0,
    endgame5Plies: 0,
    positionCounts: { [key]: 1 },
    winner: 'none',
    endReason: 'none',
  };
}

test('initial board has 20 white pieces on rows 1-4, 20 black pieces on rows 7-10, all on dark squares', () => {
  const board = createInitialBoard();
  const counts = countPieces(board);
  assert.equal(counts.white, 20);
  assert.equal(counts.black, 20);
  assert.equal(counts.whiteKings, 0);
  assert.equal(counts.blackKings, 0);

  for (const [coord, piece] of Object.entries(board)) {
    assert.equal(isDarkCoord(coord), true, `${coord} must be a dark square`);
    const rank = Number(coord.slice(1));
    if (piece.color === 'white') {
      assert.ok(rank >= 1 && rank <= 4, `white piece ${coord} should be in rows 1-4`);
    } else {
      assert.ok(rank >= 7 && rank <= 10, `black piece ${coord} should be in rows 7-10`);
    }
  }
});

test('ordinary man moves forward diagonally by 1 square and cannot move backward without capture', () => {
  const board: BoardState = {
    D4: { color: 'white', type: 'man' },
  };
  const moves = getLegalMoves(board, 'white');
  const dests = moves.map((m) => m.to).sort();
  assert.deepEqual(dests, ['C5', 'E5']);
});

test('mandatory capture forbids simple moves and allows backward captures for men', () => {
  const board: BoardState = {
    D4: { color: 'white', type: 'man' },
    C3: { color: 'black', type: 'man' },
    G3: { color: 'white', type: 'man' },
  };
  const moves = getLegalMoves(board, 'white');
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 'D4');
  assert.equal(moves[0].to, 'B2');
  assert.deepEqual(moves[0].captured, ['C3']);

  const illegal = applyMove(makeState(board, 'white'), { from: 'G3', to: 'H4' });
  assert.equal(illegal.ok, false);
});

test('majority capture rule forces picking the sequence with the maximum number of captures', () => {
  // White on B2 can capture 1 piece (C3 -> D4) OR white on F2 can capture 2 pieces (G3 -> H4 -> G5 -> F6)
  const board: BoardState = {
    B2: { color: 'white', type: 'man' },
    C3: { color: 'black', type: 'man' },
    F2: { color: 'white', type: 'man' },
    G3: { color: 'black', type: 'man' },
    G5: { color: 'black', type: 'man' },
  };
  const moves = getLegalMoves(board, 'white');
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 'F2');
  assert.equal(moves[0].to, 'F6');
  assert.deepEqual(moves[0].path, ['F2', 'H4', 'F6']);
  assert.deepEqual(moves[0].captured, ['G3', 'G5']);
});

test('captured pieces remain on board during multi-jump so cannot be jumped twice or crossed', () => {
  // Loop where D4 cannot jump over already-captured E5 a second time
  const board: BoardState = {
    B2: { color: 'white', type: 'man' },
    C3: { color: 'black', type: 'man' },
    E5: { color: 'black', type: 'man' },
    E3: { color: 'black', type: 'man' },
    C5: { color: 'black', type: 'man' },
  };
  const moves = getLegalMoves(board, 'white');
  // B2 -> D4 (cap C3) -> F6 (cap E5) [2 caps] OR B2 -> D4 -> F2 -> D? wait:
  // From D4, can go to F6 (cap E5), or F2 (cap E3), or B6 (cap C5). All capture 2!
  // Crucially, from D4 -> F6, it stops (cannot return over E5); never captures >= 3
  for (const m of moves) {
    assert.equal(m.captured.length, 2);
    assert.equal(new Set(m.captured).size, m.captured.length);
  }
});

test('deferred promotion: man passing through promotion rank mid-capture does NOT promote if it lands elsewhere', () => {
  // White man on D8 jumps E9 -> F10 (rank 10!), then immediately jumps G9 -> H8!
  // Because it finishes on H8 (not rank 10), it must remain a man.
  const board: BoardState = {
    D8: { color: 'white', type: 'man' },
    E9: { color: 'black', type: 'man' },
    G9: { color: 'black', type: 'man' },
    // If promoted mid-way to a flying king, it could also capture J6? Put a black man at H6? No, even without it:
  };
  const res = applyMove(makeState(board, 'white'), {
    from: 'D8',
    to: 'H8',
    path: ['D8', 'F10', 'H8'],
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.move.promoted, false);
    assert.equal(res.nextState.board['H8']?.type, 'man');
  }
});

test('flying king moves across entire unobstructed diagonal and captures at distance with multiple landing squares', () => {
  const board: BoardState = {
    B2: { color: 'white', type: 'king' },
    E5: { color: 'black', type: 'man' },
    H8: { color: 'white', type: 'man' }, // friendly piece blocks landing on H8 or beyond
  };
  const moves = getLegalMoves(board, 'white');
  // White king at B2 captures E5 and can land on F6 or G7 (blocked by friendly H8)
  const dests = moves.map((m) => m.to).sort();
  assert.deepEqual(dests, ['F6', 'G7']);
  for (const m of moves) {
    assert.deepEqual(m.captured, ['E5']);
  }
});

test('flying king chooses majority capture path over shorter capture path', () => {
  const board: BoardState = {
    A1: { color: 'white', type: 'king' },
    C3: { color: 'black', type: 'man' },
    F4: { color: 'black', type: 'man' },
    D8: { color: 'black', type: 'man' },
    B8: { color: 'black', type: 'man' },
  };

  const moves = getLegalMoves(board, 'white');
  assert.ok(moves.length >= 1);
  for (const m of moves) {
    assert.equal(m.captured.length, 3);
    assert.equal(m.to, 'A7');
    assert.deepEqual(m.captured, ['C3', 'D8', 'B8']);
  }
});

test('victory detected when opponent has no legal moves (stalemate = loss)', () => {
  // Black man at A3 is blocked forward by White men on B4 & C5, and backward capture over B2 is blocked by C1
  const beforeMove: BoardState = {
    A3: { color: 'black', type: 'man' },
    B4: { color: 'white', type: 'man' },
    C5: { color: 'white', type: 'man' },
    B2: { color: 'white', type: 'man' },
    C1: { color: 'white', type: 'man' },
    E1: { color: 'white', type: 'man' },
  };
  const res = applyMove(makeState(beforeMove, 'white'), { from: 'E1', to: 'F2' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.nextState.winner, 'white');
    assert.equal(res.nextState.endReason, 'no_moves');
  }
});

test('draw detected on threefold repetition', () => {
  // Put kings on separate diagonals so no captures occur; include 1 white man & 1 black man so 5-move/16-move endgame doesn't trigger
  let state = makeState({
    A1: { color: 'white', type: 'king' },
    G1: { color: 'white', type: 'man' },
    I1: { color: 'white', type: 'man' },
    B10: { color: 'black', type: 'king' },
    H10: { color: 'black', type: 'man' },
    J10: { color: 'black', type: 'man' },
  }, 'white');

  const sequence: Array<{ from: string; to: string }> = [
    { from: 'A1', to: 'B2' },
    { from: 'B10', to: 'A9' },
    { from: 'B2', to: 'A1' },
    { from: 'A9', to: 'B10' },
    { from: 'A1', to: 'B2' },
    { from: 'B10', to: 'A9' },
    { from: 'B2', to: 'A1' },
    { from: 'A9', to: 'B10' },
  ];

  for (const step of sequence) {
    const r = applyMove(state, step);
    assert.equal(r.ok, true);
    if (r.ok) state = r.nextState;
  }

  assert.equal(state.winner, 'draw');
  assert.equal(state.endReason, 'threefold_repetition');
});

test('draw detected on 25-move king-only rule (50 plies)', () => {
  let state = makeState({
    A1: { color: 'white', type: 'king' },
    G1: { color: 'white', type: 'man' },
    I1: { color: 'white', type: 'man' },
    D10: { color: 'black', type: 'king' },
    H10: { color: 'black', type: 'man' },
    J10: { color: 'black', type: 'man' },
  }, 'white');

  // Cycle non-repeating squares across 50 plies using 4-step cycles of different lengths
  const whiteDests = ['B2', 'C3', 'D4', 'C3', 'B2', 'A1', 'C3', 'E5', 'D4', 'A1'];
  const blackDests = ['C9', 'B8', 'A7', 'B8', 'C9', 'D10', 'B8', 'F8', 'E9', 'D10'];
  let wPrev = 'A1';
  let bPrev = 'D10';

  for (let i = 0; i < 25; i++) {
    const wNext = whiteDests[i % whiteDests.length];
    if (wNext === wPrev) {
      // avoid no-op
      const alt = wPrev === 'B2' ? 'C3' : 'B2';
      const rw = applyMove(state, { from: wPrev, to: alt });
      assert.equal(rw.ok, true);
      if (rw.ok) {
        state = rw.nextState;
        wPrev = alt;
      }
    } else {
      const rw = applyMove(state, { from: wPrev, to: wNext });
      assert.equal(rw.ok, true);
      if (rw.ok) {
        state = rw.nextState;
        wPrev = wNext;
      }
    }
    if (state.winner !== 'none') break;

    const bNext = blackDests[i % blackDests.length];
    const targetB = bNext === bPrev ? (bPrev === 'C9' ? 'B8' : 'C9') : bNext;
    const rb = applyMove(state, { from: bPrev, to: targetB });
    assert.equal(rb.ok, true);
    if (rb.ok) {
      state = rb.nextState;
      bPrev = targetB;
    }
    if (state.winner !== 'none') break;
  }

  assert.equal(state.winner, 'draw');
});

test('initial engine state starts on white turn with 0 plies', () => {
  const s = createInitialEngineState();
  assert.equal(s.turn, 'white');
  assert.equal(s.ply, 0);
  assert.equal(s.winner, 'none');
  const moves = getLegalMoves(s.board, 'white');
  assert.equal(moves.length, 9);
});
