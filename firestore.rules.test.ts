import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rules = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('firestore.rules enforces global default-deny catch-all', () => {
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules enforces verified email on isSignedIn', () => {
  assert.match(rules, /request\.auth != null && request\.auth\.token\.email_verified == true/);
});

test('firestore.rules enforces isValidId on all single-document paths and no get() inside allow list', () => {
  assert.match(rules, /match \/users\/\{userId\}/);
  assert.match(rules, /match \/games\/\{gameId\}/);
  assert.match(rules, /match \/moves\/\{moveId\}/);
  assert.match(rules, /match \/annotations\/\{annotationId\}/);

  const listBlocks = [...rules.matchAll(/allow list:[^;]+;/g)].map((m) => m[0]);
  assert.ok(listBlocks.length >= 3);
  for (const block of listBlocks) {
    assert.equal(block.includes('get('), false, `allow list should not call get(): ${block}`);
    assert.equal(block.includes('exists('), false, `allow list should not call exists(): ${block}`);
  }
});

test('firestore.rules enforces terminal state lock and strict field allowlists', () => {
  assert.match(rules, /existing\(\)\.status != 'finished'/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly/);
  assert.match(rules, /request\.time/);
  assert.match(rules, /pieces\.size\(\) <= 40/);
});

test('firebase-blueprint.json matches all protected collections', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.deepEqual(paths, [
    '/users/{userId}',
    '/games/{gameId}',
    '/games/{gameId}/moves/{moveId}',
    '/games/{gameId}/annotations/{annotationId}',
  ]);
});
