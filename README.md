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
Le fichier `api/[...path].ts` expose le serveur HTTP Express aux routes `/api/*`
et au WebSocket du jeu. Les parties sont enregistrées dans la base Firestore
configurée par `firebase-applet-config.json`, et ne dépendent donc pas de la
mémoire d'une instance Vercel. Les liens `/game/:id` sont redirigés vers
l'application.

Avant le déploiement, créer un compte de service Firebase avec accès en lecture
et écriture à Firestore, puis enregistrer son JSON complet comme variable
d'environnement Vercel `FIREBASE_SERVICE_ACCOUNT_JSON` (Production, Preview et
Development selon les environnements utilisés). Ne pas ajouter ce secret au
dépôt. L'API utilise le SDK Firebase Admin et les règles Firestore côté client
ne sont pas modifiées.

Activer **Fluid Compute** dans les paramètres Functions des projets Vercel qui
ne l'ont pas déjà activé pour prendre en charge les WebSockets. Le client
actualise aussi périodiquement l'état depuis Firestore afin que les coups et
confirmations restent synchronisés si deux joueurs sont connectés à des
instances Vercel différentes. Aucun compte de service n'est nécessaire pour le
développement local avec le stockage sur disque.
