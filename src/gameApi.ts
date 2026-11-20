import {
  doc,
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  ensureAuthenticatedUser,
  handleFirestoreError,
  OperationType,
} from './firebase.ts';
import {
  GameStore,
  type AnnotationAction,
  type SimulationAction,
  type StoredGame,
} from './server/gameStore.ts';
import type {
  ClientSeatInfo,
  GameSessionView,
  PlayerColor,
} from './types/game.ts';

type StoreResult = { ok: boolean; error?: string; view?: GameSessionView };
type MissingGameResult = { ok: false; error: string; view?: GameSessionView };

function createStore(game: StoredGame): GameStore {
  const store = new GameStore();
  store.importStoredGame(game);
  return store;
}

function seatForUser(
  game: StoredGame,
  view: GameSessionView,
  uid: string,
): ClientSeatInfo | null {
  if (game.whiteToken === uid && view.white) {
    return { role: 'white', pseudo: view.white.pseudo, seatToken: uid };
  }
  if (game.blackToken === uid && view.black) {
    return { role: 'black', pseudo: view.black.pseudo, seatToken: uid };
  }
  return null;
}

export async function createGame(params: { pseudo: string; color: PlayerColor }) {
  const user = await ensureAuthenticatedUser();
  const path = 'games';

  try {
    return await runTransaction(db, async (transaction) => {
      const store = new GameStore();
      let result = store.createGame(params);

      while (result.ok) {
        const game = store.exportStoredGame(result.view.id);
        if (!game) throw new Error('La partie créée est introuvable en mémoire.');

        game.whiteToken = params.color === 'white' ? user.uid : null;
        game.blackToken = params.color === 'black' ? user.uid : null;
        result.seat.seatToken = user.uid;

        const gameRef = doc(db, 'games', game.id);
        const existing = await transaction.get(gameRef);
        if (!existing.exists()) {
          transaction.set(gameRef, game);
          return result;
        }

        result = store.createGame(params);
      }

      return result;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function watchGame(
  gameId: string,
  onData: (view: GameSessionView, seat: ClientSeatInfo | null) => void,
  onNotFound: () => void,
  onError: (error: unknown) => void,
): Promise<Unsubscribe> {
  const user = await ensureAuthenticatedUser();
  const gamePath = `games/${gameId}`;

  try {
    return onSnapshot(
      doc(db, 'games', gameId),
      (snapshot) => {
        if (!snapshot.exists()) {
          onNotFound();
          return;
        }

        try {
          const stored = snapshot.data() as StoredGame;
          const store = createStore(stored);
          const view = store.getGameView(gameId);
          if (!view) {
            onNotFound();
            return;
          }
          onData(view, seatForUser(stored, view, user.uid));
        } catch (error) {
          onError(error);
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, gamePath);
        } catch (handledError) {
          onError(handledError);
        }
      },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, gamePath);
  }
}

export async function joinGame(params: {
  gameId: string;
  pseudo?: string;
  asSpectator?: boolean;
}) {
  const user = await ensureAuthenticatedUser();
  return mutateGame(params.gameId, (store) => {
    const result = store.joinGame({ ...params, seatToken: user.uid });
    if (result.ok && result.seat.role !== 'spectator') {
      const stored = store.exportStoredGame(params.gameId);
      if (stored) {
        if (!result.restored) {
          if (result.seat.role === 'white') stored.whiteToken = user.uid;
          else stored.blackToken = user.uid;
        }
        result.seat.seatToken = user.uid;
      }
    }
    return result;
  }, (result) => result.ok && result.seat.role !== 'spectator');
}

export function confirmPresence(gameId: string, seatToken: string) {
  return mutateGame(gameId, (store) => store.confirmPresence(gameId, seatToken));
}

export function submitMove(params: {
  gameId: string;
  seatToken: string;
  expectedVersion: number;
  from: string;
  to: string;
  path: string[];
}) {
  return mutateGame(params.gameId, (store) => store.submitMove(params));
}

export function resignGame(gameId: string, seatToken: string) {
  return mutateGame(gameId, (store) => store.resignGame(gameId, seatToken));
}

export async function requestRematch(gameId: string, seatToken: string) {
  const gamePath = `games/${gameId}`;
  const user = await ensureAuthenticatedUser();

  try {
    return await runTransaction(db, async (transaction) => {
      const gameRef = doc(db, 'games', gameId);
      const snapshot = await transaction.get(gameRef);
      if (!snapshot.exists()) {
        return { ok: false as const, error: 'Partie introuvable.' };
      }

      const store = createStore(snapshot.data() as StoredGame);
      const result = store.requestRematch(gameId, seatToken || user.uid);
      if (!result.ok) return result;

      let newGameRef: ReturnType<typeof doc> | null = null;
      let newGame: StoredGame | null = null;
      if (result.newGameView) {
        newGameRef = doc(db, 'games', result.newGameView.id);
        const newGameSnapshot = await transaction.get(newGameRef);
        if (newGameSnapshot.exists()) {
          throw new Error(`L'identifiant de revanche existe déjà : ${result.newGameView.id}`);
        }
        newGame = store.exportStoredGame(result.newGameView.id);
      }

      const updatedGame = store.exportStoredGame(gameId);
      if (updatedGame) transaction.set(gameRef, updatedGame);
      if (newGameRef && newGame) transaction.set(newGameRef, newGame);
      return result;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, gamePath);
  }
}

export function updateAnnotations(
  gameId: string,
  seatToken: string,
  action: AnnotationAction,
) {
  return mutateGame(gameId, (store) => store.updateAnnotations(gameId, seatToken, action));
}

export function updateSimulation(
  gameId: string,
  seatToken: string,
  action: SimulationAction,
) {
  return mutateGame(gameId, (store) => store.updateSimulation(gameId, seatToken, action));
}

async function mutateGame<T extends StoreResult>(
  gameId: string,
  action: (store: GameStore) => T,
  shouldPersist: (result: T) => boolean = (result) => result.ok,
): Promise<T | MissingGameResult> {
  const gamePath = `games/${gameId}`;

  try {
    return await runTransaction(db, async (transaction) => {
      const gameRef = doc(db, 'games', gameId);
      const snapshot = await transaction.get(gameRef);
      if (!snapshot.exists()) {
        return { ok: false, error: 'Partie introuvable.' };
      }

      const store = createStore(snapshot.data() as StoredGame);
      const result = action(store);
      const updated = store.exportStoredGame(gameId);
      if (shouldPersist(result) && updated) transaction.set(gameRef, updated);
      return result;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, gamePath);
  }
}
