# Spécification de Sécurité Firestore — Dames Master

## 1. Invariants de Données
1. Un document `/users/{userId}` contient des informations personnelles (`email`) et ne peut être lu ou écrit que par le propriétaire authentifié (`request.auth.uid == userId` avec `email_verified == true`).
2. Une partie `/games/{gameId}` a un `ownerId` immuable égal à `request.auth.uid` à la création, des horodatages serveur stricts (`createdAt == request.time`, `updatedAt == request.time`), un tableau de pièces strictement borné (`pieces.size() <= 40`), et un verrouillage d'état terminal (`status == 'finished'` bloque toute écriture ultérieure).
3. Seuls les participants d'une partie (`ownerId`, `whitePlayerUid`, `blackPlayerUid`) peuvent lire le document ou ses sous-collections. Un troisième utilisateur ne peut ni prendre un siège déjà occupé ni modifier une partie existante.
4. Les sous-collections `/games/{gameId}/moves/{moveId}` et `/games/{gameId}/annotations/{annotationId}` utilisent la porte maîtresse (`get(/databases/.../games/$(gameId))`) et `existsAfter` pour garantir la cohérence relationnelle.

## 2. Les 12 Charges Malveillantes ("Dirty Dozen")
1. **Unverified Email Write**: Création de `/users/u1` avec `request.auth.token.email_verified = false` -> `PERMISSION_DENIED`.
2. **Identity Spoofing on User**: Lecture ou écriture sur `/users/u2` par `u1` -> `PERMISSION_DENIED`.
3. **Ghost Field / Shadow Update**: Ajout d'un champ non autorisé `isAdmin: true` sur `/users/u1` -> `PERMISSION_DENIED`.
4. **Game Owner Spoofing**: Création de `/games/g1` avec `ownerId: "victim_uid"` par `attacker_uid` -> `PERMISSION_DENIED`.
5. **Client Timestamp Forgery**: Création de `/games/g1` avec `createdAt` différent de `request.time` -> `PERMISSION_DENIED`.
6. **ID Poisoning**: Création sur `/games/<1500 chars>` ou ID contenant `$` / `/` -> `PERMISSION_DENIED`.
7. **Unbounded Array / Denial of Wallet**: Création de `/games/g1` avec `pieces` de taille 45 (> 40) -> `PERMISSION_DENIED`.
8. **Seat Hijack**: Tentative par `u3` de remplacer `blackPlayerUid` déjà assigné à `u2` -> `PERMISSION_DENIED`.
9. **Terminal State Mutation**: Tentative de modifier `winner` ou `turn` sur une partie dont `status == 'finished'` -> `PERMISSION_DENIED`.
10. **Immutable Owner Mutation**: Tentative par `u1` de modifier `ownerId` ou `createdAt` lors d'un `update` -> `PERMISSION_DENIED`.
11. **Non-Participant Subcollection Read/Write**: Tentative par `u3` d'écrire dans `/games/g1/moves/m1` ou `/games/g1/annotations/a1` -> `PERMISSION_DENIED`.
12. **Blanket List Scraping**: Requête `list` sur `/users` ou `/games` sans filtre sur le participant `request.auth.uid` -> `PERMISSION_DENIED`.
