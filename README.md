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
et le dossier de sortie (`npm run build`, `dist`). Vercel sert l'application
Vite statiquement; les liens `/game/:id` sont redirigés vers `index.html`.
Les parties sont lues, créées et synchronisées par le SDK Firebase dans le
navigateur. Aucune fonction serveur, aucun compte de service et aucune variable
`FIREBASE_SERVICE_ACCOUNT_JSON` ne sont nécessaires.

Avant de jouer :

1. Activez le fournisseur **Anonyme** dans Firebase Authentication
   (Authentication → Sign-in method).
2. Publiez `firestore.rules` dans le projet Firebase configuré dans
   `firebase-applet-config.json`. Le fichier `firebase.json` cible la base
   Firestore nommée configurée pour cette application; depuis le dépôt, lancez
   `firebase deploy --only firestore:rules --project gen-lang-client-0821121347`
   avec la Firebase CLI et les droits de déploiement adéquats.
3. Déployez le site sur Vercel. Le fichier `vercel.json` redirige les URL
   `/game/:id` vers l'application afin que les liens d'invitation fonctionnent.

Les joueurs s'authentifient anonymement par défaut; ils peuvent aussi lier leur
compte Google. Les règles Firestore limitent l'accès aux utilisateurs
authentifiés et l'occupation d'une place à son propriétaire Firebase. En
revanche, les transitions de partie sont calculées dans le navigateur : cette
architecture évite les identifiants Admin côté serveur, mais ne protège pas
contre un client modifié qui tricherait. Les anciennes parties dont les places
contiennent des jetons serveur plutôt que des UID Firebase ne peuvent pas être
reprises comme joueur avec cette version.
