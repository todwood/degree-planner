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

  await new Promise((r) => setTimeout(r, 2500));

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('Navigating to http://localhost:4173/ ...');
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });

    // Login demo bypass
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Instant Demo / Local Dev Bypass'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Upload Brandon Paz transcript to Option B
    console.log('Uploading Brandon Paz transcript...');
    const pdfPath = path.resolve('.tmp/samples/Brandon Paz/sub_Transcript - UnOfficial_landscape.pdf');
    const pdfInput = await page.$('input#optionB-transcript-input');
    await pdfInput.uploadFile(pdfPath);
    await new Promise((r) => setTimeout(r, 1200));

    // Submit Option B
    const submitBtn = await page.$('#optionB-submit-btn');
    await submitBtn.click();
    await new Promise((r) => setTimeout(r, 1200));

    // Generate plan on Screen 2
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Generate Optimal Graduation Plan'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Accept fallback if modal appears
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const modalBtn = buttons.find((b) => b.textContent.includes('Accept Fallback & Generate Plan'));
      if (modalBtn) modalBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    // We are on Screen 3!
    console.log('\n--- Verifying Screen 3 Elements ---');

    // 1. Advisor Email label
    const advisorPanelText = await page.evaluate(() => {
      const el = document.querySelector('.flex.flex-wrap.items-center.justify-between.pt-2\\.5');
      return el ? el.innerText : '';
    });
    console.log('Advisor panel text:', advisorPanelText);
    if (!advisorPanelText.includes('Advisor Email:')) {
      throw new Error(`FAILED: Expected "Advisor Email:" in Advisor panel. Found: ${advisorPanelText}`);
    }
    console.log('✓ Checkpoint 1: "Advisor Email" verified.');

    // 2. Tactile Flexibility Scale legend
    const legendText = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('Tactile Course Flexibility Scale'));
      return el ? el.innerText.replace(/\n+/g, ' | ') : '';
    });
    console.log('Legend text:', legendText);
    const expectedLegendItems = [
      '1. Easily Movable (Blue)',
      '2. Movable with Effort (Amber)',
      '3. Unmovable (Slate)',
      '4. Enrolled / Locked (Grey)'
    ];
    for (const item of expectedLegendItems) {
      if (!legendText.includes(item)) {
        throw new Error(`FAILED: Legend missing item "${item}". Found: ${legendText}`);
      }
    }
    console.log('✓ Checkpoint 2: All 4 Tactile Flexibility legend labels verified exactly.');

    // 3. Audit Health Ribbon
    const ribbonText = await page.evaluate(() => {
      const el = document.querySelector('[aria-controls="historical-coursework-accordion"]');
      return el ? el.innerText : '';
    });
    console.log('Audit Health Ribbon text:', ribbonText.replace(/\n+/g, ' '));
    if (!ribbonText.includes('Completed Courses')) {
      throw new Error(`FAILED: Ribbon missing "Completed Courses". Found: ${ribbonText}`);
    }
    // Check credit breakdown whole numbers (e.g. "6cr Transfer • 68cr Institutional")
    const hasDecimalInPill = /\d+\.\d+cr Transfer/.test(ribbonText) || /\d+\.\d+cr Institutional/.test(ribbonText);
    if (hasDecimalInPill) {
      throw new Error(`FAILED: Ribbon still contains decimals in credit breakdown: ${ribbonText}`);
    }
    const hasWholeNumberPill = /\d+cr Transfer • \d+cr Institutional/.test(ribbonText);
    if (!hasWholeNumberPill) {
      throw new Error(`FAILED: Ribbon missing whole number format "\\d+cr Transfer • \\d+cr Institutional": ${ribbonText}`);
    }
    console.log('✓ Checkpoint 3: Audit Health Ribbon "{count} Completed Courses" and whole number credit breakdown verified.');

    // 4. Excise Zone 3 label
    const gridHeader = await page.evaluate(() => {
      const calendarIcons = Array.from(document.querySelectorAll('svg.lucide-calendar'));
      for (const icon of calendarIcons) {
        const parentSpan = icon.closest('span');
        if (parentSpan && parentSpan.textContent.includes('Graduation Grid')) {
          return parentSpan.textContent.trim();
        }
      }
      return null;
    });
    console.log('Grid header text:', gridHeader);
    if (!gridHeader || !gridHeader.toUpperCase().includes('INTERACTIVE ACADEMIC YEAR GRADUATION GRID')) {
      throw new Error(`FAILED: Expected "INTERACTIVE ACADEMIC YEAR GRADUATION GRID". Found: ${gridHeader}`);
    }
    if (gridHeader.toUpperCase().includes('ZONE 3')) {
      throw new Error(`FAILED: Grid header still contains "ZONE 3": ${gridHeader}`);
    }
    console.log('✓ Checkpoint 4: Legacy "ZONE 3" prefix excised completely.');

    const screenshotPath = 'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\screen3_copy_updates_verified.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('✓ Screenshot saved to:', screenshotPath);

    console.log('\n========================================================');
    console.log('✅ ALL SCREEN 3 COPY & FORMATTING VERIFICATIONS PASSED!');
    console.log('========================================================');
  } finally {
    await browser.close();
    preview.kill();
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
