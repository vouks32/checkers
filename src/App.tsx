import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { GameRoom } from './components/GameRoom.tsx';
import { HomeScreen } from './components/HomeScreen.tsx';
import { RulesModal } from './components/RulesModal.tsx';
import { createGame } from './gameApi.ts';
import {
  auth,
  signInWithGoogle,
  signOutFirebase,
  upsertUserProfile,
} from './firebase.ts';
import type { PlayerColor } from './types/game.ts';

function parseGameIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/game\/([a-zA-Z0-9_-]+)\/?$/);
  return match ? match[1] : null;
}

export default function App() {
  const [activeGameId, setActiveGameId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? parseGameIdFromPath(window.location.pathname) : null,
  );
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user?.emailVerified) {
        void upsertUserProfile(user.displayName || 'Joueur').catch(() => {});
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveGameId(parseGameIdFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    document.body.dataset.state = activeGameId ? 'playing' : 'title';
  }, [activeGameId]);

  const navigateToGame = useCallback((gameId: string) => {
    window.history.pushState({}, '', `/game/${gameId}`);
    setActiveGameId(gameId);
  }, []);

  const navigateToHome = useCallback(() => {
    window.history.pushState({}, '', '/');
    setActiveGameId(null);
  }, []);

  const handleCreateGame = useCallback(
    async ({ pseudo, color }: { pseudo: string; color: PlayerColor }) => {
      setCreating(true);
      setErrorMessage(null);
      try {
        const result = await createGame({ pseudo, color });
        if (!result.ok) {
          setErrorMessage(result.error || 'Impossible de créer la partie.');
          return;
        }
        try {
          localStorage.setItem(
            `dames_master_seat_${result.view.id}`,
            JSON.stringify(result.seat),
          );
        } catch {
          // Ignorer si stockage indisponible
        }
        navigateToGame(result.view.id);
      } catch {
        setErrorMessage('Impossible de créer la partie. Vérifiez Firebase Authentication et les règles Firestore.');
      } finally {
        setCreating(false);
      }
    },
    [navigateToGame],
  );

  // Support ?autostart=1 pour ouvrir immédiatement une nouvelle partie de démonstration
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && !activeGameId) {
      void handleCreateGame({ pseudo: 'Joueur 1', color: 'white' });
    }
  }, [activeGameId, handleCreateGame]);

  const handleJoinByLinkOrId = useCallback(
    (raw: string) => {
      const cleaned = raw.trim();
      const match = cleaned.match(/\/game\/([a-zA-Z0-9_-]+)/);
      const id = match ? match[1] : cleaned.replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) {
        setErrorMessage('Identifiant de partie invalide.');
        return;
      }
      setErrorMessage(null);
      navigateToGame(id);
    },
    [navigateToGame],
  );

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch {
      setErrorMessage('La connexion Google a été annulée ou bloquée.');
    }
  };

  const handleGoogleLogout = async () => {
    await signOutFirebase();
  };

  return (
    <ErrorBoundary>
      {activeGameId ? (
        <GameRoom
          gameId={activeGameId}
          onNavigateHome={navigateToHome}
          onNavigateGame={navigateToGame}
          onOpenRules={() => setRulesOpen(true)}
        />
      ) : (
        <HomeScreen
          firebaseUser={firebaseUser?.isAnonymous ? null : firebaseUser}
          onGoogleLogin={handleGoogleLogin}
          onGoogleLogout={handleGoogleLogout}
          onCreateGame={handleCreateGame}
          onJoinByLinkOrId={handleJoinByLinkOrId}
          onOpenRules={() => setRulesOpen(true)}
          creating={creating}
          errorMessage={errorMessage}
        />
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </ErrorBoundary>
  );
}
