import test from 'node:test';
import assert from 'node:assert/strict';

import * as trackingRecoveryModule from '../src/lib/session/trackingRecovery.ts';

const trackingRecoveryExports =
  'default' in trackingRecoveryModule ? trackingRecoveryModule.default : trackingRecoveryModule;

const {
  shouldAdoptRecoveryPass,
  shouldRunRecoveryPass,
} = trackingRecoveryExports;

test('runs recovery pass when detection is weak and quality is usable', () => {
  assert.equal(shouldRunRecoveryPass(0.42, 0.5), true);
});

test('does not run recovery pass when detection is already adequate', () => {
  assert.equal(shouldRunRecoveryPass(0.7, 0.9), false);
});

test('does not run recovery pass on very low frame usability', () => {
  assert.equal(shouldRunRecoveryPass(0.2, 0.2), false);
});

test('adopts retry pass only when detection improves beyond minimum gain', () => {
  assert.equal(shouldAdoptRecoveryPass(0.40, 0.49), true);
  assert.equal(shouldAdoptRecoveryPass(0.40, 0.46), false);
});

test('supports custom minimum gain for stricter adoption', () => {
  assert.equal(shouldAdoptRecoveryPass(0.40, 0.50, 0.12), false);
  assert.equal(shouldAdoptRecoveryPass(0.40, 0.52, 0.12), true);
});
