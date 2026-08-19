import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as runProvenanceModule from '../src/lib/session/runProvenance.ts';

const runProvenanceExports =
  'default' in runProvenanceModule ? runProvenanceModule.default : runProvenanceModule;

const {
  buildHeroExportPath,
  buildRunProvenance,
  getRunLabel,
} = runProvenanceExports;

const repoRoot = process.cwd();

test('buildRunProvenance defaults to an honest real-analysis record', () => {
  const provenance = buildRunProvenance({
    classification: 'real_analysis',
    sourceType: 'manifest_hero',
    sourceClipId: 'toward_good',
    sourceClipFilename: 'toward_good.mp4',
    approvedForDemo: true,
    modelId: 'mediapipe_full',
    modelLabel: 'MediaPipe Full',
  });

  assert.equal(provenance.classification, 'real_analysis');
  assert.equal(provenance.sourceType, 'manifest_hero');
  assert.equal(provenance.sourceClipId, 'toward_good');
  assert.equal(provenance.exportArtifactPath, '/demo/exports/toward_good-annotated.mp4');
  assert.equal(getRunLabel(provenance.classification), 'REAL ANALYSIS');
});

test('hero manifest is canonical and blocks approval until a real clip exists', () => {
  const manifestPath = path.join(repoRoot, 'public', 'demo', 'videos', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.heroClipId, 'toward_good');
  assert.equal(Array.isArray(manifest.videos), true);

  const heroClip = manifest.videos.find((entry) => entry.clipId === 'toward_good');
  assert.ok(heroClip, 'toward_good manifest entry should exist');
  assert.equal(heroClip.filename, 'toward_good.mp4');
  assert.equal(heroClip.approvedForDemo, false);
  assert.equal(heroClip.sourcePath, null);
});

test('buildHeroExportPath is only generated for named source clips', () => {
  assert.equal(buildHeroExportPath('toward_good'), '/demo/exports/toward_good-annotated.mp4');
  assert.equal(buildHeroExportPath(null), null);
});
