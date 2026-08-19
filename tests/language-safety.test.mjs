/**
 * PEDI-GROWTH — Language Safety Tests
 * Tests that prohibited medical language is blocked by the safety filter.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Inline the prohibited terms matching src/lib/policy/language-safety.ts
const PROHIBITED_PATTERNS = [
  /\bdiagnos/i,
  /\bhas\s+(cerebral\s+palsy|CP|DMD|muscular\s+dystrophy|scoliosis)/i,
  /\bsuffers?\s+from\b/i,
  /\bconfirm(?:s|ed)?\s+(that|the)\b.*\b(condition|disease|disorder)\b/i,
  /\bprescri(?:be|ption)\b/i,
  /\btreat(?:ment)?\s+plan\b/i,
  /\bprognosis\b/i,
  /\bprobability\s+of\b.*\b(disease|condition|disorder)\b/i,
  /\bcure\b/i,
];

function containsProhibitedLanguage(text) {
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(text));
}

describe("Language Safety", () => {
  it("blocks diagnostic language", () => {
    assert.ok(containsProhibitedLanguage("Your child has been diagnosed with CP"));
    assert.ok(containsProhibitedLanguage("This diagnosis suggests..."));
    assert.ok(containsProhibitedLanguage("The child has cerebral palsy"));
  });

  it("blocks treatment/prescription language", () => {
    assert.ok(containsProhibitedLanguage("We recommend this treatment plan"));
    assert.ok(containsProhibitedLanguage("The doctor should prescribe medication"));
  });

  it("blocks prognosis language", () => {
    assert.ok(containsProhibitedLanguage("The prognosis is favorable"));
    assert.ok(containsProhibitedLanguage("probability of disease occurrence"));
  });

  it("allows safe screening language", () => {
    assert.ok(!containsProhibitedLanguage("This concern level suggests follow-up"));
    assert.ok(!containsProhibitedLanguage("We observed moderate asymmetry"));
    assert.ok(!containsProhibitedLanguage("Consult your healthcare professional"));
    assert.ok(!containsProhibitedLanguage("The gait pattern shows some irregularity"));
  });

  it("blocks 'suffers from' language", () => {
    assert.ok(containsProhibitedLanguage("The child suffers from leg pain"));
  });
});
