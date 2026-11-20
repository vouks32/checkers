import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, type StoredGame } from './gameStore.ts';

test('create, join, presence confirmation, and seat hijack protection', () => {
  const store = new GameStore();

  const created = store.createGame({ pseudo: 'Alice', color: 'white' });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const gameId = created.view.id;
  const aliceToken = created.seat.seatToken!;
  assert.equal(created.view.status, 'waiting');
  assert.equal(created.view.white?.pseudo, 'Alice');
  assert.equal(created.view.black, null);

  // 2nd player joins and automatically receives black seat
  const joined = store.joinGame({ gameId, pseudo: 'Bob' });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const bobToken = joined.seat.seatToken!;
  assert.equal(joined.seat.role, 'black');
  assert.equal(joined.view.status, 'confirming');

  // 3rd player CANNOT take an occupied seat
  const third = store.joinGame({ gameId, pseudo: 'Charlie' });
  assert.equal(third.ok, false);
  if (!third.ok) {
    assert.equal(third.code, 'FULL');
  }

  // 3rd player CAN enter as spectator
  const spec = store.joinGame({ gameId, pseudo: 'Charlie', asSpectator: true });
  assert.equal(spec.ok, true);
  if (spec.ok) {
    assert.equal(spec.seat.role, 'spectator');
  }

  // Cannot play before both confirm presence
  const premature = store.submitMove({
    gameId,
    seatToken: aliceToken,
    expectedVersion: joined.view.version,
    from: 'B4',
    to: 'C5',
  });
  assert.equal(premature.ok, false);

  // Confirm both players -> transitions to playing
  store.confirmPresence(gameId, aliceToken);
  const confirmed = store.confirmPresence(gameId, bobToken);
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;
  assert.equal(confirmed.view.status, 'playing');

  // Bob cannot move on Alice's turn
  const wrongTurn = store.submitMove({
    gameId,
    seatToken: bobToken,
    expectedVersion: confirmed.view.version,
    from: 'A7',
    to: 'B6',
  });
  assert.equal(wrongTurn.ok, false);

  // Alice plays legal move
  const move1 = store.submitMove({
    gameId,
    seatToken: aliceToken,
    expectedVersion: confirmed.view.version,
    from: 'B4',
    to: 'C5',
  });
  assert.equal(move1.ok, true);
  if (!move1.ok) return;
  assert.equal(move1.view.engine.turn, 'black');

  // Stale version conflict rejected
  const stale = store.submitMove({
    gameId,
    seatToken: bobToken,
    expectedVersion: confirmed.view.version, // stale!
    from: 'A7',
    to: 'B6',
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.conflict, true);
  }

  // Alice disconnects and reconnects with her seatToken
  store.setConnectionState(gameId, 'white', 'ws1', false);
  assert.equal(store.getGameView(gameId)?.white?.connected, false);
  const restored = store.joinGame({ gameId, seatToken: aliceToken });
  assert.equal(restored.ok, true);
  if (restored.ok) {
    assert.equal(restored.restored, true);
    assert.equal(restored.seat.role, 'white');
    assert.equal(restored.view.white?.connected, true);
  }
});

test('a game survives store rehydration through join, play, and a decisive finish', () => {
  let store = new GameStore();
  const created = store.createGame({ pseudo: 'Alice', color: 'white' });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const gameId = created.view.id;
  const aliceToken = created.seat.seatToken!;
  const reopenStore = () => {
    const reopened = new GameStore();
    const saved = store.exportStoredGame(gameId);
    assert.ok(saved);
    const restored: StoredGame = JSON.parse(JSON.stringify(saved));
    reopened.importStoredGame(restored);
    return reopened;
  };

  store = reopenStore();
  const joined = store.joinGame({ gameId, pseudo: 'Bob' });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const bobToken = joined.seat.seatToken!;

  store = reopenStore();
  const aliceConfirmed = store.confirmPresence(gameId, aliceToken);
  assert.equal(aliceConfirmed.ok, true);

  store = reopenStore();
  const ready = store.confirmPresence(gameId, bobToken);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  assert.equal(ready.view.status, 'playing');

  store = reopenStore();
  const move = store.submitMove({
    gameId,
    seatToken: aliceToken,
    expectedVersion: ready.view.version,
    from: 'B4',
    to: 'C5',
  });
  assert.equal(move.ok, true);
  if (!move.ok) return;

  store = reopenStore();
  const resigned = store.resignGame(gameId, bobToken);
  assert.equal(resigned.ok, true);
  if (resigned.ok) {
    assert.equal(resigned.view.status, 'finished');
    assert.equal(resigned.view.engine.winner, 'white');
    assert.equal(resigned.view.engine.endReason, 'resignation');
  }
});

test('a winning move finishes the game and records the winner and reason', () => {
  const store = new GameStore();
  const created = store.createGame({ pseudo: 'Alice', color: 'white' });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const gameId = created.view.id;
  const joined = store.joinGame({ gameId, pseudo: 'Bob' });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  store.confirmPresence(gameId, created.seat.seatToken!);
  const ready = store.confirmPresence(gameId, joined.seat.seatToken!);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;

  const stored = store.exportStoredGame(gameId);
  assert.ok(stored);
  stored.engine.board = {
    A3: { color: 'black', type: 'man' },
    B4: { color: 'white', type: 'man' },
    C5: { color: 'white', type: 'man' },
    B2: { color: 'white', type: 'man' },
    C1: { color: 'white', type: 'man' },
    E1: { color: 'white', type: 'man' },
  };
  stored.engine.turn = 'white';
  stored.engine.positionCounts = {};

  const result = store.submitMove({
    gameId,
    seatToken: created.seat.seatToken!,
    expectedVersion: ready.view.version,
    from: 'E1',
    to: 'F2',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.view.status, 'finished');
    assert.equal(result.view.engine.winner, 'white');
    assert.equal(result.view.engine.endReason, 'no_moves');
  }
});

test('both players can request a rematch with their seats and colors swapped', () => {
  const store = new GameStore();
  const created = store.createGame({ pseudo: 'Alice', color: 'white' });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const gameId = created.view.id;
  const aliceUid = created.seat.seatToken!;
  const joined = store.joinGame({ gameId, pseudo: 'Bob' });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const bobUid = joined.seat.seatToken!;

  store.confirmPresence(gameId, aliceUid);
  store.confirmPresence(gameId, bobUid);
  store.resignGame(gameId, bobUid);

  const firstRequest = store.requestRematch(gameId, aliceUid);
  assert.equal(firstRequest.ok, true);
  if (!firstRequest.ok) return;
  assert.equal(firstRequest.newGameView, undefined);

  const accepted = store.requestRematch(gameId, bobUid);
  assert.equal(accepted.ok, true);
  if (!accepted.ok || !accepted.newGameView) return;

  assert.equal(accepted.view.rematchGameId, accepted.newGameView.id);
  assert.equal(accepted.newGameView.status, 'playing');
  assert.equal(accepted.newGameView.white?.pseudo, 'Bob');
  assert.equal(accepted.newGameView.black?.pseudo, 'Alice');
  assert.equal(accepted.newSeatTokens?.whiteToken, bobUid);
  assert.equal(accepted.newSeatTokens?.blackToken, aliceUid);
});

test('pedagogical annotations and simulation never alter the real game board or turn', () => {
  const store = new GameStore();
  const created = store.createGame({ pseudo: 'Alice', color: 'white' });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const gameId = created.view.id;
  const aliceToken = created.seat.seatToken!;
  const joined = store.joinGame({ gameId, pseudo: 'Bob' });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  const bobToken = joined.seat.seatToken!;

  store.confirmPresence(gameId, aliceToken);
  const ready = store.confirmPresence(gameId, bobToken);
  assert.equal(ready.ok, true);
  if (!ready.ok) return;

  const initialBoardJson = JSON.stringify(ready.view.engine.board);

  // Bob annotates even though it is White's turn!
  const hl = store.updateAnnotations(gameId, bobToken, {
    type: 'toggle_highlight',
    coord: 'B4',
    color: 'yellow',
  });
  assert.equal(hl.ok, true);
  if (hl.ok) {
    assert.equal(hl.view.annotations.highlights['B4'], 'yellow');
    assert.equal(JSON.stringify(hl.view.engine.board), initialBoardJson);
    assert.equal(hl.view.engine.turn, 'white');
  }

  // Simulation moves B4 -> C5 without changing real board
  store.updateSimulation(gameId, aliceToken, { type: 'start', shared: true });
  const simMove = store.updateSimulation(gameId, aliceToken, {
    type: 'move',
    from: 'B4',
    to: 'C5',
  });
  assert.equal(simMove.ok, true);
  if (simMove.ok) {
    assert.equal(simMove.view.simulation?.engine.board['C5']?.color, 'white');
    assert.equal(simMove.view.simulation?.engine.board['B4'], undefined);
    // Real board untouched!
    assert.equal(JSON.stringify(simMove.view.engine.board), initialBoardJson);
    assert.equal(simMove.view.engine.turn, 'white');
  }

  // Stop simulation returns cleanly
  const stopped = store.updateSimulation(gameId, aliceToken, { type: 'stop' });
  assert.equal(stopped.ok, true);
  if (stopped.ok) {
    assert.equal(stopped.view.simulation, null);
    assert.equal(JSON.stringify(stopped.view.engine.board), initialBoardJson);
  }
});
