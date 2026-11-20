import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

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

export async function signInWithGoogle() {
  if (auth.currentUser?.isAnonymous) {
    return linkWithPopup(auth.currentUser, googleProvider);
  }
  return signInWithPopup(auth, googleProvider);
}

export async function signOutFirebase() {
  return signOut(auth);
}

function waitForInitialAuthState(): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      },
    );
  });
}

export async function ensureAuthenticatedUser(): Promise<User> {
  const existingUser = await waitForInitialAuthState();
  if (existingUser) return existingUser;

  try {
    return (await signInAnonymously(auth)).user;
  } catch (error) {
    if (error instanceof Error && error.message.includes('auth/operation-not-allowed')) {
      throw new Error('Activez la connexion anonyme dans Firebase Authentication.');
    }
    throw error;
  }
}

export async function upsertUserProfile(pseudo: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email || !user.emailVerified) return;
  const userPath = `users/${user.uid}`;
  try {
    const cleanPseudo = pseudo.trim().slice(0, 40) || user.displayName?.slice(0, 40) || 'Joueur';
    const userRef = doc(db, 'users', user.uid);
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      await updateDoc(userRef, {
        pseudo: cleanPseudo,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        uid: user.uid,
        pseudo: cleanPseudo,
        email: user.email.slice(0, 160),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}
