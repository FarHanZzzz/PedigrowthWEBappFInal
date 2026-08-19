import test from 'node:test';
import assert from 'node:assert/strict';

import * as pipelineProxyModule from '../src/lib/api/pipelineProxy.ts';

const pipelineProxyExports =
  'default' in pipelineProxyModule ? pipelineProxyModule.default : pipelineProxyModule;

const {
  forwardLandmarkPrediction,
  probePipelineHealth,
  sanitizePredictPayload,
} = pipelineProxyExports;

const originalFetch = globalThis.fetch;

test('pipeline health returns ok when upstream is healthy', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const result = await probePipelineHealth('http://localhost:8000', globalThis.fetch);
  assert.equal(result.status, 'ok');
});

test('pipeline health degrades gracefully when upstream fails', async () => {
  globalThis.fetch = async () => {
    throw new Error('connect ECONNREFUSED');
  };

  const result = await probePipelineHealth('http://localhost:8000', globalThis.fetch);
  assert.equal(result.status, 'down');
  assert.match(result.error, /ECONNREFUSED/i);
});

test('predict sanitization rejects missing frames', () => {
  const result = sanitizePredictPayload({ patient_info: { Age: 6 } });
  assert.equal(result.valid, false);
  assert.match(result.error, /No landmark frames/i);
});

test('predict sanitization rejects oversized frame payloads', () => {
  const frames = Array.from({ length: 2401 }, () => ({ l_hip: [0, 0] }));
  const result = sanitizePredictPayload({ frames });
  assert.equal(result.valid, false);
  assert.match(result.error, /Too many frames/i);
});

test('predict sanitization normalizes invalid points to zeros', () => {
  const result = sanitizePredictPayload({
    frames: [
      {
        l_hip: ['x', null],
        l_knee: [1, 2],
        l_ankle: [null, undefined],
        r_hip: [0.1, 0.2],
        r_knee: [0.3, 0.4],
        r_ankle: [0.5, 0.6],
        l_shoulder: [0.7, 0.8],
        r_shoulder: [0.9, 1.0],
      },
    ],
    patient_info: { Age: 6 },
  });

  assert.equal(result.valid, true);
  assert.ok(result.payload);
  assert.deepEqual(result.payload.frames[0].l_hip, [0, 0]);
  assert.deepEqual(result.payload.frames[0].l_knee, [1, 2]);
  assert.deepEqual(result.payload.frames[0].l_ankle, [0, 0]);
});

test('forward prediction passes sanitized payload and returns upstream response', async () => {
  let capturedBody = null;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}'));
    return new Response(
      JSON.stringify({
        success: true,
        predictions: {
          gait_asymmetry: { risk: false, probability: 0.2 },
          trendelenburg_risk: { risk: false, probability: 0.2 },
          trunk_instability: { risk: false, probability: 0.2 },
          spinal_misalignment: { risk: false, probability: 0.2 },
          composite_risk: { risk: false, probability: 0.2 },
        },
        disclaimer: 'ok',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };

  const payload = {
    frames: [
      {
        l_hip: [0, 0],
        l_knee: [1, 2],
        l_ankle: [0, 0],
        r_hip: [0.1, 0.2],
        r_knee: [0.3, 0.4],
        r_ankle: [0.5, 0.6],
        l_shoulder: [0.7, 0.8],
        r_shoulder: [0.9, 1.0],
      },
    ],
    patient_info: { Age: 6 },
  };

  const body = await forwardLandmarkPrediction(
    'http://localhost:8000',
    payload,
    globalThis.fetch,
  );

  assert.equal(body.success, true);
  assert.ok(capturedBody);
  assert.deepEqual(capturedBody.frames[0].l_hip, [0, 0]);
  assert.deepEqual(capturedBody.frames[0].l_knee, [1, 2]);
  assert.deepEqual(capturedBody.frames[0].l_ankle, [0, 0]);
});

test('forward prediction degrades gracefully when upstream call throws', async () => {
  globalThis.fetch = async () => {
    throw new Error('upstream timeout');
  };

  const result = await forwardLandmarkPrediction(
    'http://localhost:8000',
    { frames: [{ l_hip: [0, 0], l_knee: [0, 0], l_ankle: [0, 0], r_hip: [0, 0], r_knee: [0, 0], r_ankle: [0, 0], l_shoulder: [0, 0], r_shoulder: [0, 0] }], patient_info: null },
    globalThis.fetch,
  );

  assert.equal(result.success, false);
  assert.match(String(result.error), /timeout/i);
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
