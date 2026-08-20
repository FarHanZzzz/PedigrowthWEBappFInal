import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";
const outDir = "screenshots";
const SCREENSHOT_SECRET = "pedigrowth-local-dev-only";

function metric(value, confidence, unit) {
  return unit ? { value, confidence, unit } : { value, confidence };
}

function buildResult({
  id,
  sessionId,
  nickname,
  ageMonths,
  overallLevel,
  followupPriority,
  domains,
  observationsText,
  clinicianNote,
}) {
  const analyzedAt = new Date().toISOString();
  return {
    id,
    session: { nickname, ageMonths },
    run: {
      classification: "real_analysis",
      validationMode: true,
      sourceType: "uploaded_video",
      sourceClipId: null,
      sourceClipFilename: "walk.mp4",
      approvedForDemo: false,
      modelId: "mediapipe_full",
      modelLabel: "MediaPipe Full",
      bakeoffReportPath: null,
      exportArtifactPath: null,
      failureStage: null,
      failureReason: null,
      analyzedAt,
    },
    assessmentMode: "full_assessment",
    quality: {
      result: "pass",
      assessmentMode: "full_assessment",
      bodyVisibility: 0.87,
      cameraAngle: "frontal",
      frameUsability: 0.84,
      durationSeconds: 6,
      confidenceMultiplier: 0.92,
      usableMetrics: [
        "cadence",
        "stepSymmetry",
        "frontalAsymmetry",
        "strideRegularity",
        "lateralTrunkSway",
        "pathDeviation",
        "baseOfSupport",
      ],
      suppressedMetrics: [],
      failureReasons: [],
      borderlineReasons: [],
      retakeInstructions: null,
      retakeSuggestions: [],
      confidenceNotes: "Video quality supports a full analysis with a minor confidence adjustment.",
    },
    features: {
      cadence: metric(121, 0.86, "steps/min"),
      stepSymmetry: metric(0.89, 0.82),
      frontalAsymmetry: metric(0.11, 0.8),
      strideRegularity: metric(0.13, 0.78),
      lateralTrunkSway: metric(0.07, 0.76),
      pathDeviation: metric(0.08, 0.74),
      baseOfSupport: metric(0.15, 0.71, "hip-widths"),
    },
    concerns: {
      asymmetry: domains.asymmetry,
      irregularRhythm: domains.irregularRhythm,
      lateralInstability: domains.lateralInstability,
      pathDeviation: domains.pathDeviation,
      overallLevel,
      followupPriority,
      isLimited: false,
      contextNotes: [],
      suppressedDomains: [],
      assessedDomains: ["asymmetry", "irregularRhythm", "lateralInstability", "pathDeviation"],
      qualityWarning: false,
      viewLabel: "Front-view walking assessment",
      assessmentModeLabel: "Full assessment",
      assessmentMode: "full_assessment",
    },
    viewType: "frontal",
    isDemo: false,
    policyVersion: "0.5.0-body-relative",
    analyzedAt,
    reports: {
      caregiver: {
        observationsText,
        monitoringGuidance: "Watch whether the walking pattern changes with fatigue or a longer walk.",
        confidenceText: "Video quality supports a full analysis with a minor confidence adjustment.",
        contextSignalText: `Front-view walking assessment · ${nickname}`,
      },
      clinician: {
        summary: observationsText,
        domains,
      },
      handoffText: `${nickname}: ${observationsText}`,
    },
    clinicianFeedback: clinicianNote
      ? {
          note: clinicianNote,
          updatedAt: analyzedAt,
          visibility: "family",
        }
      : undefined,
    trace: {
      sessionId,
      viewType: "frontal",
      assessmentMode: "full_assessment",
      pipeline: {
        direction: "toward",
        assessmentMode: "full_assessment",
        confidenceMultiplier: 0.92,
      },
    },
  };
}

const RESULTS = [
  buildResult({
    id: "r_alex_walk",
    sessionId: "session_alex",
    nickname: "Alex",
    ageMonths: 48,
    overallLevel: "mild",
    followupPriority: "routine",
    domains: {
      asymmetry: "mild",
      irregularRhythm: "none",
      lateralInstability: "mild",
      pathDeviation: "none",
    },
    observationsText:
      "Mild left-right differences showed up in this clip. Rhythm and path stayed fairly steady.",
    clinicianNote:
      "Please bring this clip to the next visit so we can compare side-to-side movement in clinic.",
  }),
  buildResult({
    id: "r_sam_walk",
    sessionId: "session_sam",
    nickname: "Sam",
    ageMonths: 62,
    overallLevel: "moderate",
    followupPriority: "soon",
    domains: {
      asymmetry: "moderate",
      irregularRhythm: "mild",
      lateralInstability: "moderate",
      pathDeviation: "mild",
    },
    observationsText:
      "Moderate side-to-side unsteadiness stood out. Rhythm was still readable, but this clip is worth a clinician look.",
    clinicianNote: null,
  }),
  buildResult({
    id: "r_jordan_walk",
    sessionId: "session_jordan",
    nickname: "Jordan",
    ageMonths: 42,
    overallLevel: "none",
    followupPriority: "routine",
    domains: {
      asymmetry: "none",
      irregularRhythm: "none",
      lateralInstability: "none",
      pathDeviation: "none",
    },
    observationsText: "No notable walking differences stood out in this clip.",
    clinicianNote: null,
  }),
];

function storageSeed(results) {
  const primary = results[0];
  const session = {
    nickname: primary.session.nickname,
    ageMonths: primary.session.ageMonths,
    walking: "yes",
    route: "route_b",
    routeReason: "screenshot_product_tour",
    policyVersion: primary.policyVersion,
    consentTimestamp: new Date().toISOString(),
    sessionId: primary.trace.sessionId,
    role: "admin",
  };
  const sessionRaw = JSON.stringify(session);
  sessionStorage.setItem("gaitbridge_session", sessionRaw);
  sessionStorage.setItem("pedigrowth_session", sessionRaw);
  sessionStorage.setItem("pedigrowth_role", "admin");
  for (const result of results) {
    const raw = JSON.stringify(result);
    sessionStorage.setItem(`gaitbridge_result_${result.id}`, raw);
    sessionStorage.setItem(`pedigrowth_result_${result.id}`, raw);
  }
}

async function waitForText(page, snippets, timeout = 20000) {
  await page.waitForFunction(
    (needles) => {
      const text = document.body?.innerText ?? "";
      return needles.some((needle) => text.includes(needle));
    },
    snippets,
    { timeout },
  );
}

async function shot(page, filename) {
  const dest = path.join(outDir, filename);
  await page.waitForTimeout(700);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`saved ${dest} (${page.url()})`);
}

async function logStorage(page, label) {
  const info = await page.evaluate(() => ({
    origin: window.location.origin,
    path: window.location.pathname,
    keys: Object.keys(sessionStorage),
    role: sessionStorage.getItem("pedigrowth_role"),
    nickname: (() => {
      try {
        return JSON.parse(sessionStorage.getItem("gaitbridge_session") || "null")?.nickname ?? null;
      } catch {
        return null;
      }
    })(),
  }));
  console.log(`storage[${label}] ${JSON.stringify(info)}`);
}

async function fillIntake(page) {
  await page.locator("#nickname").fill("Alex");
  await page.locator("#years").fill("4");
  await page.locator("#months").fill("0");
  await page.locator("button:has-text('Walks on their own')").click();
  const consent = page.locator("#consent");
  if (!(await consent.isChecked())) {
    await page.locator("label[for='consent']").click();
  }
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-screenshot-secret": SCREENSHOT_SECRET },
  });
  await context.route(/supabase\.(co|in)/, (route) => route.abort());
  await context.addInitScript(storageSeed, RESULTS);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (error) => console.error(`pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForText(page, ["Pediatric walking check", "I'm a parent"]);
  await shot(page, "01-landing.png");

  await page.goto(`${baseUrl}/start`, { waitUntil: "domcontentloaded" });
  await waitForText(page, ["About your child"]);
  await fillIntake(page);
  await logStorage(page, "start");
  await shot(page, "02-intake.png");

  await page.goto(`${baseUrl}/capture`, { waitUntil: "domcontentloaded" });
  await waitForText(page, ["Front view, full body", "Record video"]);
  await logStorage(page, "capture");
  await shot(page, "03-capture.png");

  await page.goto(`${baseUrl}/history`, { waitUntil: "domcontentloaded" });
  await waitForText(page, ["Past walking checks"]);
  await page.waitForTimeout(1200);
  await logStorage(page, "history");
  await shot(page, "04-history.png");

  await page.goto(`${baseUrl}/results/${RESULTS[0].id}`, { waitUntil: "domcontentloaded" });
  try {
    await waitForText(page, ["Walking summary for", "What we noticed"]);
  } catch (error) {
    await page.screenshot({ path: path.join(outDir, "debug-analysis.png"), fullPage: true });
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 800));
    console.error("analysis page text:", body);
    throw error;
  }
  await logStorage(page, "analysis");
  await shot(page, "05-analysis.png");

  const moreDetails = page.locator("summary:has-text('More details')");
  if (await moreDetails.count()) {
    await moreDetails.first().click();
    await page.waitForTimeout(400);
    const domain = page.locator("text=Asymmetry").first();
    if (await domain.count()) await domain.scrollIntoViewIfNeeded();
  }
  await shot(page, "06-analysis-details.png");

  await page.goto(`${baseUrl}/results/${RESULTS[0].id}/clinician`, { waitUntil: "domcontentloaded" });
  await waitForText(page, ["Clinician packet"]);
  await shot(page, "07-clinician-packet.png");

  await page.goto(`${baseUrl}/portal/parent`, { waitUntil: "domcontentloaded" });
  await waitForText(page, ["Your dashboard"]);
  await page.waitForTimeout(1000);
  await shot(page, "08-family-dashboard.png");

  await page.goto(`${baseUrl}/portal/admin`, { waitUntil: "domcontentloaded" });
  await waitForText(page, ["Admin dashboard"]);
  await page.waitForTimeout(1000);
  await shot(page, "09-admin-dashboard.png");

  await browser.close();
  console.log("Captured 9 product-story screenshots.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
