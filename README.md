<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Dames Master

Application de dames internationales multijoueur, avec mode d'analyse pédagogique.

## Lancer en local

**Prerequisites:**  Node.js

1. Installer les dépendances avec `bun install` ou `npm install`.
2. Lancer l'application avec `bun run dev` ou `npm run dev`.

## Déployer sur Vercel

Importer le dépôt dans Vercel avec le framework **Vite**. Les commandes de build
et le dossier de sortie sont détectés automatiquement (`npm run build`, `dist`).
Le fichier `api/[...path].ts` expose les routes `/api/*` et le WebSocket du jeu
comme une seule Vercel Function. `vercel.json` redirige les liens `/game/:id`
vers l'application et `/ws` vers le point d'entrée WebSocket.

Activer **Fluid Compute** dans les paramètres Functions du projet Vercel pour
autoriser les WebSockets. Le serveur de jeu garde son état en mémoire; les
parties peuvent donc être perdues lors d'un redémarrage ou d'un changement
d'instance. Une persistance partagée est nécessaire pour garantir la continuité
des parties en production.
