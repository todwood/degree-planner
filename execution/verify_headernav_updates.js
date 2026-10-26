import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function run() {
  console.log('--- Verifying HeaderNav Against Local Dev Server (http://localhost:5173/) ---');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('Navigating to http://localhost:5173/ ...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

    // Login demo bypass
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Instant Demo / Local Dev Bypass'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Extract Header text and structure
    const headerData = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) return null;

      const fullText = header.innerText.replace(/\n+/g, ' ');
      const title = header.querySelector('span.font-extrabold')?.innerText || '';
      const ferpaText = header.innerText.includes('100% FERPA Compliant');
      const subText = header.innerText.includes('Handles student information with a client-side deterministic engine (zero cloud storage)');
      const hasCollegeSubtitle = header.innerText.includes('College of Science, Technology, and Health');
      const hasDuplicateAcademicTitle = header.innerText.includes('Academic Degree Planner');
      const hasLindenwood = header.innerText.includes('Lindenwood');

      const logoImg = header.querySelector('img[alt="DP"]');
      const hasMonogram = Boolean(logoImg);

      const navButtons = Array.from(header.querySelectorAll('button'))
        .map((b) => b.innerText.trim())
        .filter((t) => t.includes('Student Intake') || t.includes('Degree Audit') || t.includes('Schedule Board'));

      const profileName = header.querySelector('.text-xs.font-bold.text-white')?.innerText || '';

      return {
        fullText,
        title,
        ferpaText,
        subText,
        hasCollegeSubtitle,
        hasDuplicateAcademicTitle,
        hasLindenwood,
        hasMonogram,
        navButtons,
        profileName
      };
    });

    console.log('\n--- Header Nav Inspection ---');
    console.log('Header text snippet:', headerData.fullText);
    console.log('Title:', headerData.title);
    console.log('Has DP Monogram icon:', headerData.hasMonogram);
    console.log('Has "100% FERPA Compliant":', headerData.ferpaText);
    console.log('Has deterministic engine privacy sub-text:', headerData.subText);
    console.log('Has College Subtitle (should be FALSE):', headerData.hasCollegeSubtitle);
    console.log('Has Duplicate Title (should be FALSE):', headerData.hasDuplicateAcademicTitle);
    console.log('Has "Lindenwood" (should be FALSE):', headerData.hasLindenwood);
    console.log('Workflow Stepper buttons:', headerData.navButtons);
    console.log('Advisor Profile Name:', headerData.profileName);

    // Assertions
    if (headerData.title !== 'Degree Planner') {
      throw new Error(`FAILED: Expected title "Degree Planner". Found: "${headerData.title}"`);
    }
    console.log('✓ Checkpoint 1: Clean unified "Degree Planner" title verified.');

    if (!headerData.hasMonogram) {
      throw new Error('FAILED: DP monogram icon missing in header.');
    }
    console.log('✓ Checkpoint 2: [DP] monogram mark verified.');

    if (headerData.hasDuplicateAcademicTitle) {
      throw new Error('FAILED: Duplicate "Academic Degree Planner" title still present.');
    }
    if (headerData.hasCollegeSubtitle) {
      throw new Error('FAILED: "College of Science, Technology, and Health" still present.');
    }
    if (headerData.hasLindenwood) {
      throw new Error('FAILED: "Lindenwood" wordmark detected in header text.');
    }
    console.log('✓ Checkpoint 3: Redundant naming, college subtitle, and institutional wordmarks removed.');

    if (!headerData.ferpaText || !headerData.subText) {
      throw new Error('FAILED: Integrated FERPA privacy statement or sub-text missing.');
    }
    console.log('✓ Checkpoint 4: Integrated FERPA Compliance badge and zero-cloud-storage sub-text verified.');

    if (headerData.navButtons.length !== 3) {
      throw new Error(`FAILED: Stepper navigation buttons missing. Found: ${JSON.stringify(headerData.navButtons)}`);
    }
    console.log('✓ Checkpoint 5: 1-2-3 Stepper navigation buttons intact.');

    // Save screenshot
    const shotPath = 'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\headernav_brand_streamlined.png';
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('✓ Screenshot saved to:', shotPath);

    console.log('\n========================================================');
    console.log('✅ ALL HEADERNAV STREAMLINING CHECKS PASSED!');
    console.log('========================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
