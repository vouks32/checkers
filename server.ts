import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { GameStore } from './src/server/gameStore.ts';
import { FirestoreGameStore } from './src/server/firestoreGameStore.ts';
import type { GameSessionView, PlayerColor } from './src/types/game.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const store = process.env.VERCEL ? new FirestoreGameStore() : new GameStore();
const app = express();
app.use(express.json({ limit: '256kb' }));

type ApiHandler = (req: Request, res: Response) => Promise<void>;

function apiHandler(handler: ApiHandler) {
  return (req: Request, res: Response) => {
    void handler(req, res).catch((error: unknown) => {
      console.error('Erreur API Dames Master:', error);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Erreur interne du serveur.' });
      }
    });
  };
}

interface RoomClient {
  ws: WebSocket;
  clientId: string;
  gameId: string;
  role: PlayerColor | 'spectator';
}

const rooms = new Map<string, Set<RoomClient>>();

function broadcastGameState(gameId: string, view: GameSessionView): void {
  const clients = rooms.get(gameId);
  if (!clients) return;
  const payload = JSON.stringify({ type: 'game:state', view });
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function registerApiRoutes(): void {
  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'dames-master' });
  });

  // Créer une partie
  app.post('/api/games', apiHandler(async (req, res) => {
    const { pseudo, color } = req.body ?? {};
    const result = await store.createGame({ pseudo, color });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.status(201).json(result);
  }));

  // Consulter l'état public d'une partie
  app.get('/api/games/:id', apiHandler(async (req, res) => {
    const view = await store.getGameView(req.params.id);
    if (!view) {
      res.status(404).json({ ok: false, error: 'Partie introuvable.' });
      return;
    }
    res.json({ ok: true, view });
  }));

  // Rejoindre ou restaurer un siège
  app.post('/api/games/:id/join', apiHandler(async (req, res) => {
    const { pseudo, seatToken, asSpectator } = req.body ?? {};
    const result = await store.joinGame({
      gameId: req.params.id,
      pseudo,
      seatToken,
      asSpectator,
    });
    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'FULL' ? 409 : 400;
      res.status(status).json(result);
      return;
    }
    broadcastGameState(req.params.id, result.view);
    res.json(result);
  }));

  // Confirmer la présence
  app.post('/api/games/:id/confirm', apiHandler(async (req, res) => {
    const { seatToken } = req.body ?? {};
    const result = await store.confirmPresence(req.params.id, seatToken);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    broadcastGameState(req.params.id, result.view);
    res.json(result);
  }));

  // Jouer un coup (validation serveur stricte)
  app.post('/api/games/:id/move', apiHandler(async (req, res) => {
    const { seatToken, expectedVersion, from, to, path: movePath } = req.body ?? {};
    const result = await store.submitMove({
      gameId: req.params.id,
      seatToken,
      expectedVersion: Number(expectedVersion),
      from,
      to,
      path: movePath,
    });
    if (!result.ok) {
      res.status(result.conflict ? 409 : 400).json(result);
      return;
    }
    broadcastGameState(req.params.id, result.view);
    res.json(result);
  }));

  // Abandonner la partie
  app.post('/api/games/:id/resign', apiHandler(async (req, res) => {
    const { seatToken } = req.body ?? {};
    const result = await store.resignGame(req.params.id, seatToken);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    broadcastGameState(req.params.id, result.view);
    res.json(result);
  }));

  // Demander / accepter une revanche
  app.post('/api/games/:id/rematch', apiHandler(async (req, res) => {
    const { seatToken } = req.body ?? {};
    const result = await store.requestRematch(req.params.id, seatToken);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    broadcastGameState(req.params.id, result.view);
    res.json({
      ok: true,
      view: result.view,
      newGameId: result.newGameView?.id ?? null,
    });
  }));

  // Annotations pédagogiques (temps réel, sans altérer la partie)
  app.post('/api/games/:id/annotations', apiHandler(async (req, res) => {
    const { seatToken, action } = req.body ?? {};
    const result = await store.updateAnnotations(req.params.id, seatToken, action);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    broadcastGameState(req.params.id, result.view);
    res.json(result);
  }));

  // Simulation pédagogique (copie temporaire)
  app.post('/api/games/:id/simulation', apiHandler(async (req, res) => {
    const { seatToken, action } = req.body ?? {};
    const result = await store.updateSimulation(req.params.id, seatToken, action);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    broadcastGameState(req.params.id, result.view);
    res.json(result);
  }));
}

registerApiRoutes();
export const server = http.createServer(app);

function registerWebSocketRoutes(): void {
  // WebSocket pour la synchronisation temps réel et la présence
  const wss = new WebSocketServer({ server, path: '/api/ws' });

  wss.on('connection', (ws, req) => {
    void handleWebSocketConnection(ws, req).catch((error: unknown) => {
      console.error('Erreur WebSocket Dames Master:', error);
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'Erreur serveur');
    });
  });
}

async function handleWebSocketConnection(
  ws: WebSocket,
  req: http.IncomingMessage,
): Promise<void> {
    const url = new URL(req.url ?? '/ws', `http://${req.headers.host || 'localhost'}`);
    const gameId = url.searchParams.get('gameId') ?? '';
    const seatToken = url.searchParams.get('seatToken') ?? undefined;
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!gameId || !(await store.getGameView(gameId))) {
      ws.send(JSON.stringify({ type: 'error', error: 'Partie introuvable.' }));
      ws.close();
      return;
    }

    const role = await store.identifySeat(gameId, seatToken);
    const client: RoomClient = { ws, clientId, gameId, role };
    let roomSet = rooms.get(gameId);
    if (!roomSet) {
      roomSet = new Set();
      rooms.set(gameId, roomSet);
    }
    roomSet.add(client);

    const updatedView = await store.setConnectionState(gameId, role, clientId, true);
    if (updatedView) {
      broadcastGameState(gameId, updatedView);
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (msg?.type === 'rematch:claim' && typeof msg.rematchGameId === 'string') {
          void (async () => {
            const oldGame = await store.getGameView(gameId);
            if (oldGame?.rematchGameId === msg.rematchGameId && seatToken) {
              const oldRole = await store.identifySeat(gameId, seatToken);
              if (oldRole === 'white' || oldRole === 'black') {
                const joined = await store.joinGame({
                gameId: msg.rematchGameId,
                seatToken,
              });
                if (joined.ok) {
                  ws.send(JSON.stringify({ type: 'rematch:seat', seat: joined.seat }));
                }
              }
            }
          })().catch((error: unknown) => {
            console.error('Erreur récupération du siège de revanche:', error);
          });
        }
      } catch {
        // Ignorer les trames malformées
      }
    });

    ws.on('close', () => {
      const set = rooms.get(gameId);
      if (set) {
        set.delete(client);
        // Vérifier s'il reste un autre onglet connecté pour ce même rôle
        const stillConnected = Array.from(set).some((c) => c.role === role);
        if (!stillConnected) {
          void Promise.resolve(store.setConnectionState(gameId, role, clientId, false))
            .then((afterLeave) => {
              if (afterLeave) broadcastGameState(gameId, afterLeave);
            })
            .catch((error: unknown) => {
              console.error('Erreur mise à jour de la présence:', error);
            });
        }
        if (set.size === 0) {
          rooms.delete(gameId);
        }
      }
    });
}

registerWebSocketRoutes();

async function startServer(): Promise<void> {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build introuvable.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Dames Master server listening on http://0.0.0.0:${PORT}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}
