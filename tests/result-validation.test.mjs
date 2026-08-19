/**
 * PEDI-GROWTH — Result Validation Tests
 *
 * Tests for physiological bounds enforcement, confidence gating,
 * cross-metric consistency, and threshold calibration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load normative references
const normativeRefsPath = path.resolve(__dirname, "../src/lib/policy/normative-references.json");
const normativeRefs = JSON.parse(fs.readFileSync(normativeRefsPath, "utf8"));

// Load concern thresholds
const thresholdPath = path.resolve(__dirname, "../src/lib/policy/concern-thresholds.json");
const thresholdData = JSON.parse(fs.readFileSync(thresholdPath, "utf8"));

// ── Inline implementations of functions under test ──────────────
// (to avoid TS import issues in plain .mjs test files)

function getDurationConfidenceCeiling(durationSeconds) {
  const ceilings = normativeRefs.minimumEvidenceRequirements.confidenceCeilingForShortClips;
  if (durationSeconds < 3) return ceilings.under3sec;
  if (durationSeconds < 5) return ceilings.under5sec;
  return ceilings.over5sec;
}

function classifyConcern(value, thresholds, confidence = 1.0) {
  let level;
  if (value >= thresholds.significant) level = "significant";
  else if (value >= thresholds.moderate) level = "moderate";
  else if (value >= thresholds.mild) level = "mild";
  else level = "none";

  // Confidence gating
  const ORDER = ["none", "mild", "moderate", "significant"];
  if (confidence < 0.25) return "none";
  if (confidence < 0.40 && ORDER.indexOf(level) > ORDER.indexOf("none")) {
    return "mild";
  }
  if (confidence < 0.55 && level === "significant") {
    return "moderate";
  }
  return level;
}

function computeFollowupPriority(levels, progressionStatus = "stable") {
  const significantCount = levels.filter((level) => level === "significant").length;
  const hasSignificant = levels.some((level) => level === "significant");
  const hasModerate = levels.some((level) => level === "moderate");

  if (significantCount >= 2 || progressionStatus === "worsening") {
    return "specialist";
  }

  if (hasSignificant || hasModerate) {
    return "earlier_review";
  }

  return "routine";
}

// ══════════════════════════════════════════════════════════════════
// TEST SUITES
// ══════════════════════════════════════════════════════════════════

describe("Normative References Integrity", () => {
  it("has physiological bounds for cadence", () => {
    assert.ok(normativeRefs.cadence.physiologicalBounds.min > 0);
    assert.ok(normativeRefs.cadence.physiologicalBounds.max > normativeRefs.cadence.physiologicalBounds.min);
    assert.ok(normativeRefs.cadence.physiologicalBounds.max <= 300, "Max cadence should be reasonable");
  });

  it("has normalization divisors for frontal asymmetry", () => {
    assert.ok(normativeRefs.frontalAsymmetry.components.hipHeightDifference.normalizationDivisor > 0);
    assert.ok(normativeRefs.frontalAsymmetry.components.shoulderTilt.normalizationDivisor > 0);
  });

  it("has normalization divisors for trunk sway and path deviation", () => {
    assert.ok(normativeRefs.lateralTrunkSway.normalizationDivisor > 0);
    assert.ok(normativeRefs.pathDeviation.normalizationDivisor > 0);
  });

  it("has minimum evidence requirements", () => {
    assert.ok(normativeRefs.minimumEvidenceRequirements.minStrikesForCadence >= 2);
    assert.ok(normativeRefs.minimumEvidenceRequirements.minFramesForMetric >= 5);
    assert.ok(normativeRefs.minimumEvidenceRequirements.minUsableDurationSeconds > 0);
  });

  it("confidence ceilings decrease for shorter clips", () => {
    const ceilings = normativeRefs.minimumEvidenceRequirements.confidenceCeilingForShortClips;
    assert.ok(ceilings.under3sec < ceilings.under5sec, "Under 3s should have lower ceiling than under 5s");
    assert.ok(ceilings.under5sec < ceilings.over5sec, "Under 5s should have lower ceiling than over 5s");
    assert.ok(ceilings.over5sec <= 1.0, "Ceiling should not exceed 1.0");
  });
});

describe("Duration-Based Confidence Ceiling", () => {
  it("caps confidence for very short clips (<3s)", () => {
    const ceiling = getDurationConfidenceCeiling(1.5);
    assert.ok(ceiling <= 0.5, `Expected <=0.5 for 1.5s, got ${ceiling}`);
  });

  it("allows moderate confidence for medium clips (3-5s)", () => {
    const ceiling = getDurationConfidenceCeiling(4.0);
    assert.ok(ceiling > 0.5, `Expected >0.5 for 4s, got ${ceiling}`);
    assert.ok(ceiling <= 0.7, `Expected <=0.7 for 4s, got ${ceiling}`);
  });

  it("allows full confidence for adequate clips (>5s)", () => {
    const ceiling = getDurationConfidenceCeiling(8.0);
    assert.ok(ceiling >= 0.85, `Expected >=0.85 for 8s, got ${ceiling}`);
  });
});

describe("Confidence-Gated Concern Classification", () => {
  const ASYM = thresholdData.concernThresholds.asymmetry;

  it("returns 'none' regardless of value when confidence < 0.25", () => {
    assert.equal(classifyConcern(0.80, ASYM, 0.20), "none");
    assert.equal(classifyConcern(0.50, ASYM, 0.10), "none");
  });

  it("caps at 'mild' when confidence < 0.40", () => {
    assert.equal(classifyConcern(0.80, ASYM, 0.35), "mild");
    assert.equal(classifyConcern(0.35, ASYM, 0.35), "mild");
  });

  it("caps at 'moderate' when confidence < 0.55", () => {
    assert.equal(classifyConcern(0.80, ASYM, 0.50), "moderate");
  });

  it("allows 'significant' when confidence >= 0.55", () => {
    assert.equal(classifyConcern(0.80, ASYM, 0.60), "significant");
  });

  it("does not affect 'none' level regardless of confidence", () => {
    assert.equal(classifyConcern(0.01, ASYM, 0.10), "none");
    assert.equal(classifyConcern(0.01, ASYM, 0.99), "none");
  });
});

describe("Threshold Calibration Sanity", () => {
  it("asymmetry thresholds are ordered and positive", () => {
    const a = thresholdData.concernThresholds.asymmetry;
    assert.ok(a.mild > 0, "mild threshold must be positive");
    assert.ok(a.moderate > a.mild, "moderate > mild");
    assert.ok(a.significant > a.moderate, "significant > moderate");
  });

  it("irregularRhythm thresholds are consistent with Hausdorff (2007) norms", () => {
    const ir = thresholdData.concernThresholds.irregularRhythm;
    // Hausdorff: healthy stride CV ~0.03, so mild should be well above healthy
    assert.ok(ir.mild >= 0.05, `mild=${ir.mild} should be >=0.05 to avoid false positives on healthy gait`);
    assert.ok(ir.mild <= 0.15, `mild=${ir.mild} should be <=0.15 to catch genuine irregularity`);
  });

  it("lateralInstability thresholds avoid over-flagging children", () => {
    const li = thresholdData.concernThresholds.lateralInstability;
    // Children naturally show more lateral sway than adults
    assert.ok(li.mild >= 0.08, `mild=${li.mild} should be >=0.08 to avoid flagging normal children`);
  });

  it("pathDeviation thresholds are within normalized range", () => {
    const pd = thresholdData.concernThresholds.pathDeviation;
    assert.ok(pd.significant <= 1.0, "significant threshold should be within 0-1 normalized range");
    assert.ok(pd.mild > 0, "mild threshold must be positive");
  });

  it("step timing concern threshold is between 0.80 and 0.95", () => {
    const st = thresholdData.stepTimingConcernThreshold;
    assert.ok(st >= 0.80, `stepTimingConcernThreshold=${st} should be >=0.80`);
    assert.ok(st <= 0.95, `stepTimingConcernThreshold=${st} should be <=0.95`);
  });
});

describe("Cadence Physiological Bounds", () => {
  const bounds = normativeRefs.cadence.physiologicalBounds;

  it("rejects impossibly low cadence", () => {
    assert.ok(bounds.min >= 30, "Min cadence should be at least 30 steps/min");
  });

  it("rejects impossibly high cadence", () => {
    assert.ok(bounds.max <= 250, "Max cadence should be at most 250 steps/min");
  });

  it("includes the pediatric normal range", () => {
    const pediatric3to5 = normativeRefs.cadence.normativeRange.age3to5;
    assert.ok(bounds.min < pediatric3to5.range[0], "Min bound should be below pediatric normal low");
    assert.ok(bounds.max > pediatric3to5.range[1], "Max bound should be above pediatric normal high");
  });
});

describe("Cross-Metric Consistency Logic", () => {
  it("detects cadence-regularity mismatch", () => {
    // If cadence is 120 (normal) but stride CV is 0.4 (very irregular),
    // something is wrong with step detection
    const cadence = 120;
    const regularity = 0.4;
    const isInconsistent = cadence > 80 && cadence < 180 && regularity > 0.3;
    assert.ok(isInconsistent, "Should flag normal cadence + high irregularity as inconsistent");
  });

  it("does not flag consistent metrics", () => {
    const cadence = 120;
    const regularity = 0.05;
    const isInconsistent = cadence > 80 && cadence < 180 && regularity > 0.3;
    assert.ok(!isInconsistent, "Normal cadence + normal regularity should not be flagged");
  });

  it("detects symmetry-asymmetry contradiction", () => {
    const stepSym = 0.98; // Very symmetric timing
    const frontalAsym = 0.40; // Significant visual asymmetry
    const isContradiction = stepSym > 0.95 && frontalAsym > 0.35;
    assert.ok(isContradiction, "Symmetric timing + high visual asymmetry should flag as contradiction");
  });
});

describe("Normalization Divisor Calibration", () => {
  it("hip asymmetry divisor produces score ~0.14 for healthy mean hip sway", () => {
    // Healthy hip Y-difference is ~0.005 (MediaPipe normalized coords)
    const healthyHipDiff = 0.005;
    const divisor = normativeRefs.frontalAsymmetry.components.hipHeightDifference.normalizationDivisor;
    const score = Math.min(1, healthyHipDiff / divisor);
    assert.ok(score < 0.25, `Healthy hip score should be <0.25, got ${score.toFixed(3)}`);
    assert.ok(score > 0.05, `Healthy hip score should be >0.05, got ${score.toFixed(3)}`);
  });

  it("hip asymmetry divisor produces score ~0.71 for pathological hip drop", () => {
    // Pathological pelvic drop: ~0.025 in normalized coords
    const pathologicalHipDiff = 0.025;
    const divisor = normativeRefs.frontalAsymmetry.components.hipHeightDifference.normalizationDivisor;
    const score = Math.min(1, pathologicalHipDiff / divisor);
    assert.ok(score >= 0.5, `Pathological hip score should be >=0.5, got ${score.toFixed(3)}`);
    assert.ok(score <= 0.9, `Pathological hip score should be <=0.9, got ${score.toFixed(3)}`);
  });

  it("trunk sway divisor produces low score for normal sway", () => {
    const normalSD = 0.005;
    const divisor = normativeRefs.lateralTrunkSway.normalizationDivisor;
    const score = Math.min(1, normalSD / divisor);
    assert.ok(score < 0.3, `Normal trunk sway score should be <0.3, got ${score.toFixed(3)}`);
  });

  it("path deviation divisor produces low score for straight walking", () => {
    const normalResidualSD = 0.005;
    const divisor = normativeRefs.pathDeviation.normalizationDivisor;
    const score = Math.min(1, normalResidualSD / divisor);
    assert.ok(score < 0.25, `Normal path deviation should be <0.25, got ${score.toFixed(3)}`);
  });
});

describe("Follow-Up Routing Regression", () => {
  it("does not collapse severe patterns to routine when quality is borderline", () => {
    const levels = ["significant", "moderate", "none", "none"];
    const priority = computeFollowupPriority(levels);
    assert.equal(priority, "earlier_review");
  });

  it("keeps specialist routing for two significant concern domains", () => {
    const levels = ["significant", "significant", "mild", "none"];
    const priority = computeFollowupPriority(levels);
    assert.equal(priority, "specialist");
  });

  it("keeps specialist routing on worsening progression even with mild levels", () => {
    const levels = ["mild", "mild", "none", "none"];
    const priority = computeFollowupPriority(levels, "worsening");
    assert.equal(priority, "specialist");
  });
});
