import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { encodeBoardForFirestore } from './engine/draughts.ts';
import type { GameSessionView } from './types/game.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutFirebase() {
  return signOut(auth);
}

export async function upsertUserProfile(pseudo: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email || !user.emailVerified) return;
  const userPath = `users/${user.uid}`;
  try {
    const cleanPseudo = pseudo.trim().slice(0, 40) || user.displayName?.slice(0, 40) || 'Joueur';
    await setDoc(
      doc(db, 'users', user.uid),
      {
        uid: user.uid,
        pseudo: cleanPseudo,
        email: user.email.slice(0, 160),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function mirrorGameToFirestore(view: GameSessionView): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const gamePath = `games/${view.id}`;
  try {
    const pieces = encodeBoardForFirestore(view.engine.board).slice(0, 40);
    await setDoc(
      doc(db, 'games', view.id),
      {
        id: view.id,
        ownerId: user.uid,
        whitePlayerUid: view.white ? user.uid : '',
        blackPlayerUid: view.black ? user.uid : '',
        whitePseudo: (view.white?.pseudo ?? '').slice(0, 40),
        blackPseudo: (view.black?.pseudo ?? '').slice(0, 40),
        status: view.status,
        turn: view.engine.turn,
        winner: view.engine.winner,
        version: view.version,
        pieces,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: false },
    );
  } catch {
    // Le miroir Firestore reste optionnel si la partie existe déjà sous un autre propriétaire
  }
}

export function subscribeUserGames(
  uid: string,
  onData: (games: Array<{ id: string; whitePseudo: string; blackPseudo: string; status: string; winner: string }>) => void,
): Unsubscribe {
  const path = 'games';
  const q = query(
    collection(db, 'games'),
    where('ownerId', '==', uid),
    orderBy('updatedAt', 'desc'),
    limit(10),
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          whitePseudo: String(data.whitePseudo ?? ''),
          blackPseudo: String(data.blackPseudo ?? ''),
          status: String(data.status ?? 'waiting'),
          winner: String(data.winner ?? 'none'),
        };
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}
