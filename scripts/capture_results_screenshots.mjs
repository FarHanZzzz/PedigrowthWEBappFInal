import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";
const label = process.argv[3] ?? "before";
const outDir = "public/demo/reports/screenshots";

function buildSeedResult(resultId, sessionId) {
  const analyzedAt = new Date().toISOString();
  const frameCount = 16;
  const durationMs = 6000;
  const frameStepMs = durationMs / (frameCount - 1);

  const frames = Array.from({ length: frameCount }, (_, i) => {
    const t = i / (frameCount - 1);
    const centerX = 0.45 + t * 0.1;
    const sway = Math.sin(i / 2.5) * 0.012;
    const leftStepLift = Math.sin((i / frameCount) * Math.PI * 6) > 0 ? 0.045 : 0.008;
    const rightStepLift = Math.sin(((i + frameCount / 2) / frameCount) * Math.PI * 6) > 0 ? 0.045 : 0.008;

    const leftHip = { x: centerX - 0.06, y: 0.56 + sway };
    const rightHip = { x: centerX + 0.06, y: 0.56 - sway };
    const leftShoulder = { x: centerX - 0.08, y: 0.38 + sway * 0.5 };
    const rightShoulder = { x: centerX + 0.08, y: 0.38 - sway * 0.5 };
    const leftKnee = { x: centerX - 0.065, y: 0.72 + leftStepLift * 0.4 };
    const rightKnee = { x: centerX + 0.065, y: 0.72 + rightStepLift * 0.4 };
    const leftAnkle = { x: centerX - 0.07, y: 0.89 - leftStepLift };
    const rightAnkle = { x: centerX + 0.07, y: 0.89 - rightStepLift };
    const leftHeel = { x: centerX - 0.075, y: 0.9 - leftStepLift * 0.8 };
    const rightHeel = { x: centerX + 0.075, y: 0.9 - rightStepLift * 0.8 };

    return {
      frameIndex: i,
      timestampMs: Math.round(i * frameStepMs),
      isUsable: true,
      bodyVisibility: 0.82 + (Math.sin(i / 3) * 0.06),
      landmarks: [
        { name: "nose", x: centerX, y: 0.24, z: 0, visibility: 0.92 },
        { name: "leftShoulder", ...leftShoulder, z: 0, visibility: 0.9 },
        { name: "rightShoulder", ...rightShoulder, z: 0, visibility: 0.9 },
        { name: "leftHip", ...leftHip, z: 0, visibility: 0.91 },
        { name: "rightHip", ...rightHip, z: 0, visibility: 0.91 },
        { name: "leftKnee", ...leftKnee, z: 0, visibility: 0.88 },
        { name: "rightKnee", ...rightKnee, z: 0, visibility: 0.88 },
        { name: "leftAnkle", ...leftAnkle, z: 0, visibility: 0.86 },
        { name: "rightAnkle", ...rightAnkle, z: 0, visibility: 0.86 },
        { name: "leftHeel", ...leftHeel, z: 0, visibility: 0.84 },
        { name: "rightHeel", ...rightHeel, z: 0, visibility: 0.84 },
        { name: "leftFoot", x: leftAnkle.x - 0.01, y: leftAnkle.y + 0.01, z: 0, visibility: 0.83 },
        { name: "rightFoot", x: rightAnkle.x + 0.01, y: rightAnkle.y + 0.01, z: 0, visibility: 0.83 },
      ],
      hipMidpoint: { x: centerX, y: 0.56 },
      shoulderMidpoint: { x: centerX, y: 0.38 },
      hipTiltDeg: sway * 220,
      shoulderTiltDeg: sway * 130,
      lateralOffset: sway * 0.8,
      leftAnkle,
      rightAnkle,
      leftHip,
      rightHip,
      leftShoulder,
      rightShoulder,
      leftKnee,
      rightKnee,
      leftHeel,
      rightHeel,
    };
  });

  const stepEvents = [
    { frameIndex: 3, timestampMs: 780, side: "left", confidence: 0.84, ankleY: 0.86 },
    { frameIndex: 6, timestampMs: 1530, side: "right", confidence: 0.82, ankleY: 0.86 },
    { frameIndex: 10, timestampMs: 2520, side: "left", confidence: 0.86, ankleY: 0.85 },
    { frameIndex: 13, timestampMs: 3240, side: "right", confidence: 0.83, ankleY: 0.86 },
    { frameIndex: 17, timestampMs: 4230, side: "left", confidence: 0.85, ankleY: 0.85 },
    { frameIndex: 20, timestampMs: 5040, side: "right", confidence: 0.81, ankleY: 0.86 },
  ];

  const run = {
    classification: "real_analysis",
    validationMode: true,
    sourceType: "manifest_hero",
    sourceClipId: "toward_good",
    sourceClipFilename: "Gait_Analysis_Video_Generation.mp4",
    approvedForDemo: true,
    modelId: "mediapipe_full",
    modelLabel: "MediaPipe Full",
    bakeoffReportPath: "/demo/reports/hero-bakeoff.json",
    exportArtifactPath: null,
    failureStage: null,
    failureReason: null,
    analyzedAt,
  };

  return {
    id: resultId,
    session: { nickname: "Alex", ageMonths: 48 },
    run,
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
      confidenceNotes: "Video quality supports a full analysis with minor confidence adjustment.",
    },
    features: {
      cadence: { value: 121, confidence: 0.86, unit: "steps/min" },
      stepSymmetry: { value: 0.89, confidence: 0.82 },
      frontalAsymmetry: { value: 0.11, confidence: 0.8 },
      strideRegularity: { value: 0.13, confidence: 0.78 },
      lateralTrunkSway: { value: 0.07, confidence: 0.76 },
      pathDeviation: { value: 0.08, confidence: 0.74 },
      baseOfSupport: { value: 0.15, confidence: 0.71, unit: "normalized" },
    },
    concerns: {
      asymmetry: "mild",
      irregularRhythm: "none",
      lateralInstability: "mild",
      pathDeviation: "none",
      overallLevel: "mild",
      followupPriority: "routine",
      isLimited: false,
      contextNotes: ["Synthetic deterministic fixture for screenshot automation."],
      suppressedDomains: [],
      assessedDomains: ["asymmetry", "irregularRhythm", "lateralInstability", "pathDeviation"],
      qualityWarning: false,
      viewLabel: "Front-view walking assessment",
      assessmentModeLabel: "Full assessment",
      assessmentMode: "full_assessment",
    },
    viewType: "frontal",
    isDemo: false,
    policyVersion: "0.5.0",
    analyzedAt,
    trace: {
      sessionId,
      videoMeta: {
        durationMs,
        width: 1280,
        height: 720,
        fps: 30,
        totalFrames: frameCount,
      },
      viewType: "frontal",
      assessmentMode: "full_assessment",
      run: {
        classification: "real_analysis",
        validationMode: true,
        sourceClipId: "toward_good",
        sourceClipFilename: "Gait_Analysis_Video_Generation.mp4",
        approvedForDemo: true,
        modelId: "mediapipe_full",
        modelLabel: "MediaPipe Full",
        failureStage: null,
        failureReason: null,
        bakeoffReportPath: "/demo/reports/hero-bakeoff.json",
        exportArtifactPath: null,
      },
      frames,
      stepEvents,
      gaitCycles: [
        {
          startFrame: 3,
          endFrame: 10,
          startTimeMs: 780,
          endTimeMs: 2520,
          durationMs: 1740,
          side: "left",
        },
        {
          startFrame: 6,
          endFrame: 13,
          startTimeMs: 1530,
          endTimeMs: 3240,
          durationMs: 1710,
          side: "right",
        },
      ],
      metricSources: {
        cadence: {
          metricName: "cadence",
          displayName: "Cadence",
          inputSignal: "Ankle-Y oscillation frequency",
          computationMethod: "Count foot strikes / duration",
          usedFrameIndices: [2, 3, 6, 10, 13, 17, 20],
          frameCount: 7,
          rawValues: [116, 119, 121, 122, 123],
          finalValue: 121,
          confidence: 0.86,
          unit: "steps/min",
        },
        stepSymmetry: {
          metricName: "stepSymmetry",
          displayName: "Step timing symmetry",
          inputSignal: "Ratio of left and right step durations",
          computationMethod: "min(leftMean,rightMean)/max(leftMean,rightMean)",
          usedFrameIndices: [3, 6, 10, 13, 17, 20],
          frameCount: 6,
          rawValues: [0.88, 0.9, 0.89],
          finalValue: 0.89,
          confidence: 0.82,
        },
        frontalAsymmetry: {
          metricName: "frontalAsymmetry",
          displayName: "Frontal asymmetry",
          inputSignal: "Hip and shoulder tilt differences",
          computationMethod: "Weighted hip/shoulder tilt score",
          usedFrameIndices: [2, 4, 8, 11, 15, 19],
          frameCount: 6,
          rawValues: [0.08, 0.11, 0.14],
          finalValue: 0.11,
          confidence: 0.8,
        },
        strideRegularity: {
          metricName: "strideRegularity",
          displayName: "Stride regularity",
          inputSignal: "Variance in step intervals",
          computationMethod: "sqrt(var(intervals))/mean(intervals)",
          usedFrameIndices: [3, 6, 10, 13, 17, 20],
          frameCount: 6,
          rawValues: [0.11, 0.13, 0.14],
          finalValue: 0.13,
          confidence: 0.78,
        },
        lateralTrunkSway: {
          metricName: "lateralTrunkSway",
          displayName: "Lateral trunk sway",
          inputSignal: "Lateral shoulder-hip offset",
          computationMethod: "stddev(offsets)",
          usedFrameIndices: [1, 5, 9, 12, 16, 21],
          frameCount: 6,
          rawValues: [0.05, 0.08, 0.07],
          finalValue: 0.07,
          confidence: 0.76,
        },
        pathDeviation: {
          metricName: "pathDeviation",
          displayName: "Path deviation",
          inputSignal: "Hip midpoint line residual",
          computationMethod: "linear regression residual SD",
          usedFrameIndices: [0, 4, 8, 12, 16, 20, 23],
          frameCount: 7,
          rawValues: [0.07, 0.09, 0.08],
          finalValue: 0.08,
          confidence: 0.74,
        },
        baseOfSupport: {
          metricName: "baseOfSupport",
          displayName: "Base of support",
          inputSignal: "Distance between ankles",
          computationMethod: "mean(abs(ankleXLeft-ankleXRight))",
          usedFrameIndices: [2, 6, 10, 14, 18, 22],
          frameCount: 6,
          rawValues: [0.14, 0.15, 0.16],
          finalValue: 0.15,
          confidence: 0.71,
          unit: "normalized",
        },
      },
      suppressedMetrics: [],
      pipeline: {
        totalFrames: frameCount,
        usableFrames: frameCount,
        usableFramePct: 1,
        detectedSteps: stepEvents.length,
        leftSteps: 3,
        rightSteps: 3,
        lrTrackingStable: true,
        direction: "toward",
        computedMetrics: [
          "cadence",
          "stepSymmetry",
          "frontalAsymmetry",
          "strideRegularity",
          "lateralTrunkSway",
          "pathDeviation",
          "baseOfSupport",
        ],
        suppressedMetrics: [],
        assessmentMode: "full_assessment",
        confidenceMultiplier: 0.92,
      },
    },
  };
}

async function clickIfVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if (await locator.count()) {
      const first = locator.first();
      if (await first.isVisible({ timeout: 1000 }).catch(() => false)) {
        await first.click({ timeout: 3000 }).catch(() => {});
        return true;
      }
    }
  }
  return false;
}

async function seedSession(page, resultId, sessionId) {
  const payload = buildSeedResult(resultId, sessionId);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const seededLength = await page.evaluate(
    async ({ resultId: id, sessionId: sid, result }) => {
      sessionStorage.clear();
      sessionStorage.setItem(
        "gaitbridge_session",
        JSON.stringify({
          nickname: result.session.nickname,
          ageMonths: result.session.ageMonths,
          walking: "yes",
          route: "route_b",
          routeReason: "deterministic_screenshot_seed",
          policyVersion: result.policyVersion,
          consentTimestamp: new Date().toISOString(),
          sessionId: sid,
          sourceType: "manifest_hero",
          sourceClipId: "toward_good",
          sourceClipFilename: "Gait_Analysis_Video_Generation.mp4",
          approvedForDemo: true,
          validationMode: true,
        })
      );
      sessionStorage.setItem(`gaitbridge_result_${id}`, JSON.stringify(result));
      // Some hydration paths briefly resolve params as undefined; seed a fallback key as well.
      sessionStorage.setItem("gaitbridge_result_undefined", JSON.stringify(result));
      const stored = sessionStorage.getItem(`gaitbridge_result_${id}`);
      if (!stored) {
        throw new Error("Failed to seed result in sessionStorage");
      }

      const response = await fetch("/demo/videos/Gait_Analysis_Video_Generation.mp4");
      if (!response.ok) {
        throw new Error(`Could not fetch demo video for screenshot seed (${response.status})`);
      }
      const blob = await response.blob();

      await new Promise((resolve, reject) => {
        const request = indexedDB.open("gaitbridge_video_store", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("videos")) {
            db.createObjectStore("videos");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("videos", "readwrite");
          tx.objectStore("videos").put(
            {
              blob,
              name: "Gait_Analysis_Video_Generation.mp4",
              type: blob.type || "video/mp4",
              size: blob.size,
              storedAt: Date.now(),
            },
            `video_${sid}`
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      });

      return stored.length;
    },
    { resultId, sessionId, result: payload }
  );
  console.log(`Seeded result payload for ${resultId} (${seededLength} bytes).`);
}

async function captureScreens(page, resultId) {
  const resultUrl = `${baseUrl}/results/${resultId}`;
  await page.goto(resultUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  console.log(`Navigated to: ${page.url()}`);

  const storageInfo = await page.evaluate((id) => {
    const key = `gaitbridge_result_${id}`;
    const keys = Object.keys(sessionStorage);
    return {
      origin: window.location.origin,
      path: window.location.pathname,
      expectedKey: key,
      hasExpectedKey: Boolean(sessionStorage.getItem(key)),
      keyCount: keys.length,
      firstKeys: keys.slice(0, 8),
    };
  }, resultId);
  console.log(`Storage info: ${JSON.stringify(storageInfo)}`);

  const hasStoredResult = storageInfo.hasExpectedKey;
  if (!hasStoredResult) {
    throw new Error(`Result key gaitbridge_result_${resultId} missing after navigation to results.`);
  }

  const pathId = await page.evaluate(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  });
  if (pathId && pathId !== resultId) {
    console.warn(`Result path id mismatch. Expected ${resultId}, got ${pathId}.`);
  }

  await page.waitForFunction(() => {
    const text = document.body?.innerText ?? "";
    return (
      text.includes("Results for") ||
      text.includes("Support Summary for") ||
      text.includes("Walking Summary for") ||
      text.includes("Clinician Packet") ||
      text.includes("Clinical Handoff Packet")
    );
  }, { timeout: 20000 }).catch(async () => {
    await page.screenshot({ path: `${outDir}/${label}-debug-notfound.png`, fullPage: true });
    throw new Error("Results content did not render before screenshot capture.");
  });

  await page.screenshot({ path: `${outDir}/${label}-parent-top.png`, fullPage: false });

  await clickIfVisible(page, [
    'button:has-text("Hero Video")',
    '[role="tab"]:has-text("Hero Video")',
    '[role="tab"]:has-text("Video")',
  ]);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${label}-parent-video.png`, fullPage: false });

  await clickIfVisible(page, [
    'button:has-text("Show key moments and frame gallery")',
    'button:has-text("Hide key moments and frame gallery")',
  ]);
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, 650);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${label}-parent-keymoments.png`, fullPage: false });

  const parentEntryClicked = await clickIfVisible(page, [
    'button:has-text("Open Clinician Packet")',
    'a:has-text("Open Clinician Packet")',
  ]);

  if (parentEntryClicked) {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(700);
  }

  const clinicianPath = `/results/${resultId}/clinician`;
  const isAlreadyOnClinicianRoute = page.url().includes(clinicianPath);

  const clinicianResponse = isAlreadyOnClinicianRoute
    ? null
    : await page.goto(`${baseUrl}${clinicianPath}`, {
        waitUntil: "networkidle",
      });

  const clinicianHeadingCount =
    (await page.locator("text=Clinician Packet").count()) +
    (await page.locator("text=Clinical Handoff Packet").count());

  const clinicianReady =
    (clinicianResponse ? clinicianResponse.status() < 400 : page.url().includes(clinicianPath)) &&
    clinicianHeadingCount > 0;

  if (clinicianReady) {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/${label}-clinician-top.png`, fullPage: false });
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/${label}-clinician-evidence.png`, fullPage: false });
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/${label}-clinician-keymoments.png`, fullPage: false });

    const actionsHeading = page.locator("text=6. Handoff actions");
    if (await actionsHeading.count()) {
      await actionsHeading.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
    } else {
      await page.mouse.wheel(0, 1300);
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `${outDir}/${label}-clinician-actions.png`, fullPage: false });

    await page.evaluate(() => {
      window.__qaPrintTriggered = false;
      window.print = () => {
        window.__qaPrintTriggered = true;
      };
    });

    await clickIfVisible(page, [
      'button:has-text("Print packet")',
    ]);

    const printTriggered = await page.evaluate(() => Boolean(window.__qaPrintTriggered));

    await clickIfVisible(page, [
      'button:has-text("Copy session link (local)")',
      'button:has-text("Copy local session link")',
    ]);
    await page.waitForTimeout(500);

    const copiedStatusVisible = (await page.locator("text=Session link copied to clipboard.").count()) > 0;
    const fallbackStatusVisible =
      (await page.locator("text=Clipboard access was unavailable, so the link was shown for manual copy.").count()) > 0;

    const copyStatus = copiedStatusVisible
      ? "copied"
      : fallbackStatusVisible
        ? "fallback_prompt"
        : "missing_status";

    console.log(`Action checks: printTriggered=${printTriggered}; copyStatus=${copyStatus}`);

    await page.emulateMedia({ media: "print" });
    await page.goto(`${baseUrl}/results/${resultId}/clinician`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${outDir}/${label}-clinician-print.png`, fullPage: true });
    await page.emulateMedia({ media: "screen" });
    return;
  }

  await page.goto(resultUrl, { waitUntil: "networkidle" });
  await clickIfVisible(page, [
    'button:has-text("Evidence")',
    '[role="tab"]:has-text("Evidence")',
    'summary:has-text("Key Moments")',
  ]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/${label}-clinician-top.png`, fullPage: false });
  await page.mouse.wheel(0, 1300);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${label}-clinician-evidence.png`, fullPage: false });
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${label}-clinician-keymoments.png`, fullPage: false });

  const fallbackActionsHeading = page.locator("text=6. Handoff actions");
  if (await fallbackActionsHeading.count()) {
    await fallbackActionsHeading.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
  } else {
    await page.mouse.wheel(0, 1300);
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${outDir}/${label}-clinician-actions.png`, fullPage: false });

  await page.emulateMedia({ media: "print" });
  const printResponse = await page.goto(`${baseUrl}/results/${resultId}/clinician`, {
    waitUntil: "networkidle",
  });
  if (!printResponse || printResponse.status() >= 400) {
    await page.goto(resultUrl, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/${label}-clinician-print.png`, fullPage: true });
  await page.emulateMedia({ media: "screen" });
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    console.error(`Page error: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`Console error: ${msg.text()}`);
    }
  });

  const resultId = `seed_${label}`;
  const sessionId = `session_${label}`;

  await seedSession(page, resultId, sessionId);
  await captureScreens(page, resultId);

  await browser.close();
  console.log(`Captured deterministic screenshots for '${label}' at ${baseUrl}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
