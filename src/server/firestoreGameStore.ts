import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import {
  getFirestore,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { GameStore, type StoredGame } from './gameStore.ts';
import type { PlayerColor } from '../types/game.ts';

let gamesCollection: CollectionReference | null = null;
let firestoreClient: Firestore | null = null;

function getFirestoreClient(): Firestore {
  if (firestoreClient) return firestoreClient;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON doit être configuré pour le stockage Firestore.');
  }

  const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
  const adminApp =
    getApps().find((app) => app.name === 'dames-master') ??
    initializeApp({ credential: cert(serviceAccount) }, 'dames-master');
  firestoreClient = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
  return firestoreClient;
}

function getGamesCollection(): CollectionReference {
  if (gamesCollection) return gamesCollection;
  gamesCollection = getFirestoreClient().collection('games');
  return gamesCollection;
}

export class FirestoreGameStore {
  async getGameView(gameId: string) {
    const snapshot = await getGamesCollection().doc(gameId).get();
    if (!snapshot.exists) return null;
    const store = new GameStore(null);
    store.importStoredGame(snapshot.data() as StoredGame);
    return store.getGameView(gameId);
  }

  async identifySeat(gameId: string, seatToken?: string) {
    const snapshot = await getGamesCollection().doc(gameId).get();
    if (!snapshot.exists) return 'spectator' as const;
    const store = new GameStore(null);
    store.importStoredGame(snapshot.data() as StoredGame);
    return store.identifySeat(gameId, seatToken);
  }

  async createGame(params: { pseudo: string; color: PlayerColor }) {
    return getFirestoreClient().runTransaction(async (transaction) => {
      const store = new GameStore(null);
      let result = store.createGame(params);
      if (!result.ok) return result;

      const gamesCollection = getGamesCollection();
      let gameRef = gamesCollection.doc(result.view.id);
      let existing = await transaction.get(gameRef);
      while (existing.exists) {
        result = store.createGame(params);
        if (!result.ok) return result;
        gameRef = gamesCollection.doc(result.view.id);
        existing = await transaction.get(gameRef);
      }

      transaction.create(gameRef, store.exportStoredGame(result.view.id)!);
      return result;
    });
  }

  async joinGame(params: Parameters<GameStore['joinGame']>[0]) {
    return this.mutate(params.gameId, (store) => store.joinGame(params));
  }

  async confirmPresence(gameId: string, seatToken: string) {
    return this.mutate(gameId, (store) => store.confirmPresence(gameId, seatToken));
  }

  async submitMove(params: Parameters<GameStore['submitMove']>[0]) {
    return this.mutate(params.gameId, (store) => store.submitMove(params));
  }

  async resignGame(gameId: string, seatToken: string) {
    return this.mutate(gameId, (store) => store.resignGame(gameId, seatToken));
  }

  async requestRematch(gameId: string, seatToken: string) {
    return getFirestoreClient().runTransaction(async (transaction) => {
      const gamesCollection = getGamesCollection();
      const gameRef = gamesCollection.doc(gameId);
      const snapshot = await transaction.get(gameRef);
      const store = new GameStore(null);
      if (snapshot.exists) store.importStoredGame(snapshot.data() as StoredGame);

      const result = store.requestRematch(gameId, seatToken);
      const updatedGame = store.exportStoredGame(gameId);

      let newGameRef: DocumentReference | null = null;
      if (result.ok && result.newGameView) {
        const candidateRef = gamesCollection.doc(result.newGameView.id);
        const newGameSnapshot = await transaction.get(candidateRef);
        if (newGameSnapshot.exists) {
          throw new Error(`Identifiant de revanche déjà utilisé : ${result.newGameView.id}`);
        }
        newGameRef = candidateRef;
      }

      if (updatedGame) transaction.set(gameRef, updatedGame);
      if (result.ok && result.newGameView && newGameRef) {
        transaction.create(newGameRef, store.exportStoredGame(result.newGameView.id)!);
      }
      return result;
    });
  }

  async updateAnnotations(
    gameId: string,
    seatToken: string,
    action: Parameters<GameStore['updateAnnotations']>[2],
  ) {
    return this.mutate(gameId, (store) => store.updateAnnotations(gameId, seatToken, action));
  }

  async updateSimulation(
    gameId: string,
    seatToken: string,
    action: Parameters<GameStore['updateSimulation']>[2],
  ) {
    return this.mutate(gameId, (store) => store.updateSimulation(gameId, seatToken, action));
  }

  async setConnectionState(
    gameId: string,
    role: PlayerColor | 'spectator',
    clientId: string,
    connected: boolean,
  ) {
    return this.mutate(gameId, (store) =>
      store.setConnectionState(gameId, role, clientId, connected),
    );
  }

  private async mutate<T>(gameId: string, action: (store: GameStore) => T): Promise<T> {
    return getFirestoreClient().runTransaction(async (transaction) => {
      const gameRef = getGamesCollection().doc(gameId);
      const snapshot = await transaction.get(gameRef);
      const store = new GameStore(null);
      if (snapshot.exists) store.importStoredGame(snapshot.data() as StoredGame);

      const result = action(store);
      const updatedGame = store.exportStoredGame(gameId);
      if (updatedGame) transaction.set(gameRef, updatedGame);
      return result;
    });
  }
}
