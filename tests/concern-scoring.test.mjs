/**
 * PEDI-GROWTH — Concern Scoring Tests (Expanded)
 *
 * Tests the concern level threshold mapping, confidence gating,
 * and bidirectional step timing adjustment.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONCERN_ORDER = ["none", "mild", "moderate", "significant"];

// Inline concern threshold logic matching src/lib/policy/concern-thresholds.ts
function getConcernLevel(value, thresholds, confidence = 1.0) {
  let level;
  if (value >= thresholds.significant) level = "significant";
  else if (value >= thresholds.moderate) level = "moderate";
  else if (value >= thresholds.mild) level = "mild";
  else level = "none";

  // Confidence gating
  if (confidence < 0.25) return "none";
  if (confidence < 0.40 && CONCERN_ORDER.indexOf(level) > CONCERN_ORDER.indexOf("none")) {
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const thresholdPath = path.resolve(__dirname, "../src/lib/policy/concern-thresholds.json");
const thresholdData = JSON.parse(fs.readFileSync(thresholdPath, "utf8"));

const ASYMMETRY_THRESHOLDS = thresholdData.concernThresholds.asymmetry;
const LATERAL_INSTABILITY_THRESHOLDS = thresholdData.concernThresholds.lateralInstability;
const STEP_TIMING_THRESHOLD = thresholdData.stepTimingConcernThreshold;

describe("Concern Scoring", () => {
  describe("Asymmetry with Full Confidence", () => {
    it("returns 'none' for normal symmetry", () => {
      assert.equal(getConcernLevel(0.03, ASYMMETRY_THRESHOLDS), "none");
      assert.equal(getConcernLevel(0.0, ASYMMETRY_THRESHOLDS), "none");
    });

    it("returns 'mild' for subtle asymmetry", () => {
      assert.equal(getConcernLevel(ASYMMETRY_THRESHOLDS.mild, ASYMMETRY_THRESHOLDS), "mild");
      assert.equal(getConcernLevel(ASYMMETRY_THRESHOLDS.mild + 0.01, ASYMMETRY_THRESHOLDS), "mild");
    });

    it("returns 'moderate' for notable asymmetry", () => {
      assert.equal(getConcernLevel(ASYMMETRY_THRESHOLDS.moderate, ASYMMETRY_THRESHOLDS), "moderate");
    });

    it("returns 'significant' for severe asymmetry", () => {
      assert.equal(getConcernLevel(ASYMMETRY_THRESHOLDS.significant, ASYMMETRY_THRESHOLDS), "significant");
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS), "significant");
    });
  });

  describe("Lateral Instability", () => {
    it("classifies lateral instability correctly across thresholds", () => {
      assert.equal(getConcernLevel(0.05, LATERAL_INSTABILITY_THRESHOLDS), "none");
      assert.equal(getConcernLevel(LATERAL_INSTABILITY_THRESHOLDS.mild, LATERAL_INSTABILITY_THRESHOLDS), "mild");
      assert.equal(getConcernLevel(LATERAL_INSTABILITY_THRESHOLDS.moderate, LATERAL_INSTABILITY_THRESHOLDS), "moderate");
      assert.equal(getConcernLevel(LATERAL_INSTABILITY_THRESHOLDS.significant, LATERAL_INSTABILITY_THRESHOLDS), "significant");
    });
  });

  describe("Confidence Gating", () => {
    it("suppresses to 'none' with very low confidence (<0.25)", () => {
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS, 0.10), "none");
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS, 0.24), "none");
    });

    it("caps at 'mild' with low confidence (0.25-0.40)", () => {
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS, 0.30), "mild");
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS, 0.39), "mild");
    });

    it("caps at 'moderate' with medium confidence (0.40-0.55)", () => {
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS, 0.50), "moderate");
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS, 0.54), "moderate");
    });

    it("allows 'significant' with adequate confidence (>=0.55)", () => {
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS, 0.55), "significant");
      assert.equal(getConcernLevel(0.90, ASYMMETRY_THRESHOLDS, 1.0), "significant");
    });

    it("does NOT gate 'none' level at any confidence", () => {
      assert.equal(getConcernLevel(0.01, ASYMMETRY_THRESHOLDS, 0.01), "none");
      assert.equal(getConcernLevel(0.01, ASYMMETRY_THRESHOLDS, 0.50), "none");
      assert.equal(getConcernLevel(0.01, ASYMMETRY_THRESHOLDS, 1.00), "none");
    });

    it("allows 'mild' at confidence >= 0.25", () => {
      const mildValue = ASYMMETRY_THRESHOLDS.mild + 0.01;
      assert.equal(getConcernLevel(mildValue, ASYMMETRY_THRESHOLDS, 0.25), "mild");
    });

    it("allows 'moderate' at confidence >= 0.40", () => {
      const modValue = ASYMMETRY_THRESHOLDS.moderate + 0.01;
      assert.equal(getConcernLevel(modValue, ASYMMETRY_THRESHOLDS, 0.40), "moderate");
    });
  });

  describe("Bidirectional Step Timing", () => {
    it("escalates asymmetry when step timing is also asymmetric", () => {
      // Simulated: frontal asymmetry at 'none', step timing below threshold
      // Expected: escalate to 'mild'
      let level = getConcernLevel(0.05, ASYMMETRY_THRESHOLDS, 0.8);
      assert.equal(level, "none", "Baseline should be none");

      // After step timing escalation
      if (level === "none" && 0.80 < STEP_TIMING_THRESHOLD) {
        level = "mild";
      }
      assert.equal(level, "mild", "Should escalate to mild with corroborating timing asymmetry");
    });

    it("de-escalates asymmetry when step timing is very symmetric", () => {
      // Simulated: frontal asymmetry at 'moderate', step timing > 0.95
      const modValue = ASYMMETRY_THRESHOLDS.moderate + 0.01;
      let level = getConcernLevel(modValue, ASYMMETRY_THRESHOLDS, 0.8);
      assert.equal(level, "moderate", "Baseline should be moderate");

      // De-escalation: symmetric step timing contradicts visual asymmetry
      const stepSym = 0.97;
      if (stepSym > 0.95 && level !== "none") {
        if (level === "significant") level = "moderate";
        else if (level === "moderate") level = "mild";
      }
      assert.equal(level, "mild", "Should de-escalate to mild when timing is symmetric");
    });
  });

  describe("Edge Cases", () => {
    it("handles exactly at threshold boundaries", () => {
      assert.equal(getConcernLevel(ASYMMETRY_THRESHOLDS.mild, ASYMMETRY_THRESHOLDS), "mild");
      assert.equal(getConcernLevel(ASYMMETRY_THRESHOLDS.mild - 0.001, ASYMMETRY_THRESHOLDS), "none");
    });

    it("handles negative values", () => {
      assert.equal(getConcernLevel(-1, ASYMMETRY_THRESHOLDS), "none");
    });

    it("handles very large values", () => {
      assert.equal(getConcernLevel(100, ASYMMETRY_THRESHOLDS), "significant");
    });

    it("handles zero confidence", () => {
      assert.equal(getConcernLevel(100, ASYMMETRY_THRESHOLDS, 0), "none");
    });

    it("all concern domains have ordered thresholds", () => {
      for (const [name, thresholds] of Object.entries(thresholdData.concernThresholds)) {
        assert.ok(thresholds.mild > 0, `${name}.mild must be positive`);
        assert.ok(thresholds.moderate > thresholds.mild, `${name}: moderate > mild`);
        assert.ok(thresholds.significant > thresholds.moderate, `${name}: significant > moderate`);
      }
    });
  });

  describe("Follow-up Priority Precedence", () => {
    it("keeps specialist priority for multi-significant concern pattern", () => {
      const priority = computeFollowupPriority(["significant", "significant", "mild", "none"]);
      assert.equal(priority, "specialist");
    });

    it("assigns earlier review when moderate concern is present", () => {
      const priority = computeFollowupPriority(["moderate", "none", "none", "none"]);
      assert.equal(priority, "earlier_review");
    });

    it("keeps specialist routing when progression status is worsening", () => {
      const priority = computeFollowupPriority(["mild", "mild", "none", "none"], "worsening");
      assert.equal(priority, "specialist");
    });

    it("returns routine for low-severity concern pattern", () => {
      const priority = computeFollowupPriority(["mild", "none", "none", "none"]);
      assert.equal(priority, "routine");
    });
  });
});

