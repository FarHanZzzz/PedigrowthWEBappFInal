import test from 'node:test';
import assert from 'node:assert/strict';

import * as shareLinksModule from '../src/lib/security/shareLinks.ts';

const shareLinksExports =
  'default' in shareLinksModule ? shareLinksModule.default : shareLinksModule;

const {
  generateShareToken,
  hashShareToken,
  normalizeSharePolicy,
  computeExpiryDate,
} = shareLinksExports;

test('generateShareToken returns non-empty url-safe token', () => {
  const token = generateShareToken();
  assert.ok(token.length >= 20);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test('hashShareToken is deterministic for same token', () => {
  const token = 'example-token-value';
  const first = hashShareToken(token);
  const second = hashShareToken(token);
  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test('normalizeSharePolicy clamps values safely', () => {
  const policy = normalizeSharePolicy({
    expiresHours: 999,
    maxAccesses: 500,
  });

  assert.equal(policy.expiresHours, 168);
  assert.equal(policy.maxAccesses, 100);
});

test('computeExpiryDate returns a future timestamp', () => {
  const now = Date.now();
  const expiresAt = Date.parse(computeExpiryDate(2));
  assert.ok(Number.isFinite(expiresAt));
  assert.ok(expiresAt > now);
});
