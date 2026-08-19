import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as xgboostModule from "../src/lib/api/xgboostPredictions.ts";
import * as priorsModule from "../src/lib/api/pediatricPriors.ts";
import * as rolesModule from "../src/lib/scoring/metricRoles.ts";

const xgboost = "default" in xgboostModule ? xgboostModule.default : xgboostModule;
const priors = "default" in priorsModule ? priorsModule.default : priorsModule;
const roles = "default" in rolesModule ? rolesModule.default : rolesModule;

const { normalizeXgboostPredictions, readPredictionProbability } = xgboost;
const { pediatricModelPriors } = priors;
const {
  CONCERN_DOMAIN_KEYS,
  DOMAIN_SCORED_FEATURES,
  FEATURE_ROLE,
  featuresForDomain,
  isConcernDomainKey,
} = roles;

describe("XGBoost prediction field mapping", () => {
  it("reads backend confidence as the fusion probability", () => {
    assert.equal(
      readPredictionProbability({ risk: true, confidence: 0.81 }),
      0.81,
    );
  });

  it("prefers probability when both fields exist", () => {
    assert.equal(
      readPredictionProbability({ probability: 0.4, confidence: 0.9 }),
      0.4,
    );
  });

  it("normalizes a full backend payload for hybrid fusion", () => {
    const normalized = normalizeXgboostPredictions({
      gait_asymmetry: { risk: true, confidence: 0.7 },
      trendelenburg_risk: { risk: false, confidence: 0.1 },
      trunk_instability: { risk: false, confidence: 0.2 },
      spinal_misalignment: { risk: false, confidence: 0.05 },
      composite_risk: { risk: true, confidence: 0.62 },
      overall_risk_level: "MODERATE",
    });

    assert.ok(normalized);
    assert.equal(normalized.composite_risk.probability, 0.62);
    assert.equal(normalized.gait_asymmetry.risk, true);
  });

  it("rejects payloads that cannot feed fusion", () => {
    assert.equal(normalizeXgboostPredictions({ gait_asymmetry: { risk: true } }), null);
  });
});

describe("Pediatric model priors", () => {
  it("does not send adult height/weight for a preschooler", () => {
    const agePriors = pediatricModelPriors(48);
    assert.equal(agePriors.Age, 4);
    assert.ok(agePriors.Height < 120, `height ${agePriors.Height} should be pediatric`);
    assert.ok(agePriors.Weight < 25, `weight ${agePriors.Weight} should be pediatric`);
  });
});

describe("Metric-to-domain wiring", () => {
  it("scores exactly four concern domains", () => {
    assert.deepEqual([...CONCERN_DOMAIN_KEYS], [
      "asymmetry",
      "irregularRhythm",
      "lateralInstability",
      "pathDeviation",
    ]);
  });

  it("does not treat cadence or base of support as scored concern inputs", () => {
    assert.equal(FEATURE_ROLE.cadence, "supporting");
    assert.equal(FEATURE_ROLE.baseOfSupport, "supporting");
    assert.equal(FEATURE_ROLE.strideRegularity, "scored");
    assert.equal(FEATURE_ROLE.lateralTrunkSway, "scored");
  });

  it("maps rhythm to stride regularity, not cadence", () => {
    assert.deepEqual([...DOMAIN_SCORED_FEATURES.irregularRhythm], ["strideRegularity"]);
    assert.ok(featuresForDomain("irregularRhythm").includes("cadence"));
  });

  it("does not treat overallLevel as a domain key", () => {
    assert.equal(isConcernDomainKey("overallLevel"), false);
    assert.equal(isConcernDomainKey("asymmetry"), true);
  });
});
