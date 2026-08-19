/**
 * PEDI-GROWTH — Age Validation Tests
 * Tests age input validation and boundary behavior.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const MIN_AGE = 0;
const MAX_AGE = 216; // 18 years
const MIN_ROUTE_B = 24;
const MIN_PIPELINE_AGE = 36;

function isValidAge(age) {
  return typeof age === "number" && age >= MIN_AGE && age <= MAX_AGE && Number.isFinite(age);
}

function isPipelineEligible(age) {
  return isValidAge(age) && age >= MIN_PIPELINE_AGE;
}

describe("Age Validation", () => {
  it("accepts valid ages within range", () => {
    assert.ok(isValidAge(0));
    assert.ok(isValidAge(24));
    assert.ok(isValidAge(36));
    assert.ok(isValidAge(120));
    assert.ok(isValidAge(216));
  });

  it("rejects ages outside range", () => {
    assert.ok(!isValidAge(-1));
    assert.ok(!isValidAge(217));
    assert.ok(!isValidAge(1000));
  });

  it("rejects non-numeric ages", () => {
    assert.ok(!isValidAge(NaN));
    assert.ok(!isValidAge(Infinity));
    assert.ok(!isValidAge("36"));
    assert.ok(!isValidAge(null));
    assert.ok(!isValidAge(undefined));
  });

  it("correctly identifies pipeline-eligible ages", () => {
    assert.ok(!isPipelineEligible(0));
    assert.ok(!isPipelineEligible(24));
    assert.ok(!isPipelineEligible(35));
    assert.ok(isPipelineEligible(36));
    assert.ok(isPipelineEligible(48));
    assert.ok(isPipelineEligible(216));
  });

  it("handles the frontend-backend boundary gap (24-35 months)", () => {
    // Ages 24-35: valid for frontend but NOT for pipeline
    for (let age = MIN_ROUTE_B; age < MIN_PIPELINE_AGE; age++) {
      assert.ok(isValidAge(age), `Age ${age} should be valid`);
      assert.ok(!isPipelineEligible(age), `Age ${age} should NOT be pipeline-eligible`);
    }
  });
});
