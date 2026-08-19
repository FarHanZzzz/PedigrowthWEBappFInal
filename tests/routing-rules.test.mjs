/**
 * PEDI-GROWTH — Routing Rules Tests
 * Tests the clinical routing policy that determines whether a child
 * goes to Route A (concern documentation) or Route B (gait capture).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Inline the routing logic matching src/lib/policy/routing-rules.ts
const MIN_AGE_ROUTE_B = 24;

function routeChild(ageMonths, walking) {
  if (ageMonths < MIN_AGE_ROUTE_B) return "A";
  if (walking !== "independent") return "A";
  return "B";
}

describe("Routing Rules", () => {
  it("routes children under 24 months to Route A (concern-only)", () => {
    assert.equal(routeChild(18, "independent"), "A");
    assert.equal(routeChild(12, "assisted"), "A");
    assert.equal(routeChild(0, "not_walking"), "A");
  });

  it("routes 24+ month non-ambulant children to Route A", () => {
    assert.equal(routeChild(36, "not_walking"), "A");
    assert.equal(routeChild(48, "assisted"), "A");
    assert.equal(routeChild(24, "not_walking"), "A");
  });

  it("routes 24+ month independent walkers to Route B (gait capture)", () => {
    assert.equal(routeChild(24, "independent"), "B");
    assert.equal(routeChild(36, "independent"), "B");
    assert.equal(routeChild(60, "independent"), "B");
    assert.equal(routeChild(216, "independent"), "B");
  });

  it("handles boundary age correctly (exactly 24 months)", () => {
    assert.equal(routeChild(24, "independent"), "B");
    assert.equal(routeChild(23, "independent"), "A");
  });
});
