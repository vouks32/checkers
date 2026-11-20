import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rules = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('Firestore keeps a global default-deny rule', () => {
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('game access requires Firebase Authentication and disallows collection listing', () => {
  assert.match(rules, /function isAuthenticated\(\)\s*\{\s*return request\.auth != null;/);
  assert.match(rules, /allow get: if isAuthenticated\(\) && isValidId\(gameId\)/);
  assert.match(rules, /allow list: if false;/);
});

test('new games bind a player seat to the authenticated UID', () => {
  assert.match(rules, /data\.whiteToken == request\.auth\.uid/);
  assert.match(rules, /data\.blackToken == request\.auth\.uid/);
  assert.match(rules, /function isInitialGame\(data\)/);
  assert.match(rules, /data\.status == 'waiting'/);
});

test('joining only fills a vacant seat and existing seats cannot be replaced', () => {
  assert.match(rules, /function isJoiningVacantWhiteSeat\(\)/);
  assert.match(rules, /function isJoiningVacantBlackSeat\(\)/);
  assert.match(rules, /resource\.data\.whiteToken == null/);
  assert.match(rules, /resource\.data\.blackToken == null/);
  assert.match(rules, /after\.whiteToken == before\.whiteToken/);
  assert.match(rules, /after\.blackToken == before\.blackToken/);
});

test('finished games keep gameplay immutable but allow analysis and rematch updates', () => {
  assert.match(rules, /resource\.data\.status != 'finished'/);
  assert.match(rules, /'rematchRequestedBy', 'rematchGameId', 'annotations', 'simulation',\s*'version', 'updatedAt'/);
  assert.match(rules, /allow delete: if false;/);
});

test('Firestore blueprint documents only the collections used by the client', () => {
  assert.deepEqual(Object.keys(blueprint.firestore), [
    '/users/{userId}',
    '/games/{gameId}',
  ]);
});
