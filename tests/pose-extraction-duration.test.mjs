import test from 'node:test';
import assert from 'node:assert/strict';

import * as poseModule from '../src/lib/pose/index.ts';

const poseExports = 'default' in poseModule ? poseModule.default : poseModule;
const { resolveExtractionDuration } = poseExports;

test('resolveExtractionDuration caps extraction duration at 20 seconds', () => {
  assert.equal(resolveExtractionDuration(12.5), 12.5);
  assert.equal(resolveExtractionDuration(20), 20);
  assert.equal(resolveExtractionDuration(37.2), 20);
  assert.equal(resolveExtractionDuration(95), 20);
});

test('resolveExtractionDuration handles invalid inputs safely', () => {
  assert.equal(resolveExtractionDuration(0), 0);
  assert.equal(resolveExtractionDuration(-1), 0);
  assert.equal(resolveExtractionDuration(Number.NaN), 0);
});
