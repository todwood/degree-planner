import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function run() {
  console.log('--- Starting Preview Server ---');
  const preview = spawn('npx.cmd', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    shell: true,
    stdio: 'pipe'
  });

  preview.stdout.on('data', (d) => process.stdout.write(`[preview] ${d}`));
  preview.stderr.on('data', (d) => process.stderr.write(`[preview err] ${d}`));

  // Wait 3 seconds for server to start
  await new Promise((r) => setTimeout(r, 3000));

  console.log(`Starting headless Chrome: ${executablePath}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[PAGE ERROR LOG]', msg.text());
    });
    page.on('pageerror', (err) => {
      console.log('[PAGE ERROR]', err.toString());
    });

    console.log('Navigating to http://localhost:4173/ ...');
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });

    // Login demo bypass
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Instant Demo / Local Dev Bypass'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Upload Brandon Paz files to Option B
    console.log('Uploading Brandon Paz files to Option B dropzones...');
    const brandonDir = path.resolve('.tmp', 'samples', 'Brandon Paz');
    const pdfPath = path.join(brandonDir, 'sub_Transcript - UnOfficial_landscape.pdf');
    const xlsxPath = path.join(brandonDir, 'StudentCourseSchedules (All Results).xlsx');

    const pdfInput = await page.$('input#optionB-transcript-input');
    if (!pdfInput) throw new Error('Missing input#optionB-transcript-input');
    await pdfInput.uploadFile(pdfPath);
    await new Promise((r) => setTimeout(r, 1200));

    const xlsxInput = await page.$('input#optionB-anthology-input');
    if (!xlsxInput) throw new Error('Missing input#optionB-anthology-input');
    await xlsxInput.uploadFile(xlsxPath);
    await new Promise((r) => setTimeout(r, 1500));

    // Click Proceed on Option B
    console.log('Clicking submit on Option B...');
    const submitBtn = await page.$('#optionB-submit-btn');
    if (!submitBtn) throw new Error('Missing #optionB-submit-btn');
    await submitBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    // We should now be on Screen 2 (Interactive Audit)
    const s2Heading = await page.$eval('h1', (el) => el.innerText);
    console.log('Screen 2 heading:', s2Heading);

    // Click "Generate Optimal Graduation Plan"
    console.log('Clicking "Generate Optimal Graduation Plan"...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Generate Optimal Graduation Plan'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Handle fallback modal if shown
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const modalBtn = buttons.find((b) => b.textContent.includes('Accept Fallback & Generate Plan'));
      if (modalBtn) modalBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    // Verify on Screen 3
    const s3Heading = await page.$eval('h1', (el) => el.innerText);
    console.log('Landed on Screen 3 heading:', s3Heading);

    // 1. Verify Default Collapsed State of Audit Health Ribbon
    const ribbonText = await page.evaluate(() => {
      const el = document.querySelector('[aria-controls="historical-coursework-accordion"]');
      return el ? el.innerText : null;
    });
    console.log('Audit Health Ribbon Text:');
    console.log(ribbonText);

    const isAccordionHiddenInitial = await page.evaluate(() => {
      const el = document.getElementById('historical-coursework-accordion');
      return el ? el.classList.contains('hidden') : null;
    });
    console.log('Is Accordion initially hidden:', isAccordionHiddenInitial);

    if (!isAccordionHiddenInitial) {
      throw new Error('FAILED: Accordion body should have "hidden" class by default!');
    }

    // Save screenshot of collapsed state
    const collapsedShotPath = 'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\screen3_ribbon_collapsed.png';
    await page.screenshot({ path: collapsedShotPath, fullPage: false });
    console.log('✓ Saved collapsed screenshot to:', collapsedShotPath);

    // 2. Click Ribbon Header to Expand
    console.log('Clicking Audit Health Ribbon header to expand...');
    await page.click('[aria-controls="historical-coursework-accordion"]');
    await new Promise((r) => setTimeout(r, 500));

    const isAccordionVisibleAfterClick = await page.evaluate(() => {
      const el = document.getElementById('historical-coursework-accordion');
      return el ? el.classList.contains('block') : null;
    });
    console.log('Is Accordion visible after click:', isAccordionVisibleAfterClick);

    if (!isAccordionVisibleAfterClick) {
      throw new Error('FAILED: Accordion body should have "block" class when expanded!');
    }

    const toggleTextAfterClick = await page.evaluate(() => {
      const el = document.querySelector('[aria-controls="historical-coursework-accordion"]');
      return el ? el.innerText : null;
    });
    console.log('Toggle text after expand click contains "Hide Past Coursework":', toggleTextAfterClick.includes('Hide Past Coursework'));

    // Count rendered historical courses in expanded accordion
    const historicalCoursesCount = await page.evaluate(() => {
      const el = document.getElementById('historical-coursework-accordion');
      return el ? el.querySelectorAll('.font-mono.font-bold').length : 0;
    });
    console.log(`Rendered ${historicalCoursesCount} historical course items inside expanded accordion`);

    // Save screenshot of expanded state
    const expandedShotPath = 'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\screen3_ribbon_expanded.png';
    await page.screenshot({ path: expandedShotPath, fullPage: false });
    console.log('✓ Saved expanded screenshot to:', expandedShotPath);

    // 3. Click again to Collapse
    console.log('Clicking ribbon again to collapse...');
    await page.click('[aria-controls="historical-coursework-accordion"]');
    await new Promise((r) => setTimeout(r, 500));

    const isAccordionHiddenAgain = await page.evaluate(() => {
      const el = document.getElementById('historical-coursework-accordion');
      return el ? el.classList.contains('hidden') : null;
    });
    console.log('Is Accordion hidden again after second click:', isAccordionHiddenAgain);

    if (!isAccordionHiddenAgain) {
      throw new Error('FAILED: Accordion body should have "hidden" class when re-collapsed!');
    }

    console.log('\n========================================================');
    console.log('✅ ALL AUDIT HEALTH RIBBON VERIFICATION CHECKS PASSED!');
    console.log('========================================================');
  } finally {
    await browser.close();
    preview.kill();
  }
}

run().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
