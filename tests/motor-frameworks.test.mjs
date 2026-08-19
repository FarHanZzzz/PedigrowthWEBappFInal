/**
 * PEDI-GROWTH — Motor Framework Regression Tests
 * Ensures age-band selection and delay computation remain valid
 * for older children (e.g., 57 months).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import frameworks from "../src/lib/clinical/frameworks.ts";

const { getCurrentBand, computeMotorDelayAssessment } = frameworks;

describe("Motor Framework Age Bands", () => {
  it("maps 57 months to the 49-60 month current band", () => {
    const band = getCurrentBand(57);
    assert.ok(band, "Expected a current milestone band for age 57 months");
    assert.equal(band?.minAge, 49);
    assert.equal(band?.maxAge, 60);
  });

  it("uses highest configured band for ages above configured max", () => {
    const band = getCurrentBand(120);
    assert.ok(band, "Expected fallback to highest milestone band");
    assert.equal(band?.minAge, 49);
    assert.equal(band?.maxAge, 60);
  });

  it("computes delayed and current-stage milestones at 57 months", () => {
    const assessment = computeMotorDelayAssessment(57, new Set(), new Set());

    assert.ok(
      assessment.expectedFromPriorCount > 0,
      "Expected prior milestones for 57-month assessment"
    );
    assert.ok(
      assessment.missingMilestones.length > 0,
      "Expected current-band milestones to be present"
    );
    assert.ok(
      assessment.delayedMilestones.length > 0,
      "Expected delayed milestones when none are checked as achieved"
    );
    assert.equal(assessment.delayFlag, "concern");
  });
});
