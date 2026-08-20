import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";
const outDir = path.resolve("screenshots");

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`saved ${file}`);
}

async function run() {
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Pediatric walking check");
  await shot(page, "01-landing.png");

  await page.goto(`${baseUrl}/login?role=parent`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Family sign in");
  await shot(page, "02-family-login.png");

  await page.goto(`${baseUrl}/login?role=clinician`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Clinician sign in");
  await shot(page, "03-clinician-login.png");

  await page.goto(`${baseUrl}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=How Pedi-Growth works");
  await shot(page, "04-how-it-works.png");

  await page.goto(`${baseUrl}/login?role=admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("form");
  await shot(page, "05-admin-login.png");

  await page.goto(`${baseUrl}/portal/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await shot(page, "06-admin-or-signin.png");

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
