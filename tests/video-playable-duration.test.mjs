import test from 'node:test';
import assert from 'node:assert/strict';

import * as durationModule from '../src/lib/pose/videoFrameSource.ts';

const durationExports = 'default' in durationModule ? durationModule.default : durationModule;
const { resolvePlayableDuration } = durationExports;

function ranges(end) {
  return {
    length: end > 0 ? 1 : 0,
    end: () => end,
  };
}

test('resolvePlayableDuration uses finite duration first', () => {
  assert.equal(resolvePlayableDuration({ duration: 6.4 }), 6.4);
});

test('resolvePlayableDuration recovers from Infinity via seekable range', () => {
  assert.equal(
    resolvePlayableDuration({
      duration: Number.POSITIVE_INFINITY,
      seekable: ranges(7.2),
    }),
    7.2,
  );
});

test('resolvePlayableDuration recovers from NaN via buffered range', () => {
  assert.equal(
    resolvePlayableDuration({
      duration: Number.NaN,
      buffered: ranges(5),
    }),
    5,
  );
});

test('resolvePlayableDuration returns 0 when nothing is known', () => {
  assert.equal(resolvePlayableDuration({ duration: Number.POSITIVE_INFINITY }), 0);
  assert.equal(resolvePlayableDuration({ duration: 0 }), 0);
});
