import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function run() {
  console.log('--- Starting AY Mirror Verification (http://localhost:5173/) ---');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });

    console.log('Navigating to http://localhost:5173/ ...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

    // Login demo bypass
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Instant Demo / Local Dev Bypass'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Upload Brandon Paz files: BOTH Transcript PDF and Anthology XLSX
    console.log('Uploading Brandon Paz Transcript PDF and Anthology XLSX...');
    const brandonDir = path.resolve('.tmp/samples/Brandon Paz');
    const pdfPath = path.join(brandonDir, 'sub_Transcript - UnOfficial_landscape.pdf');
    const xlsxPath = path.join(brandonDir, 'StudentCourseSchedules (All Results).xlsx');

    const pdfInput = await page.$('input#optionB-transcript-input');
    await pdfInput.uploadFile(pdfPath);
    await new Promise((r) => setTimeout(r, 1200));

    const xlsxInput = await page.$('input#optionB-anthology-input');
    await xlsxInput.uploadFile(xlsxPath);
    await new Promise((r) => setTimeout(r, 1500));

    // Submit Option B
    console.log('Submitting Option B to Screen 2...');
    const submitBtn = await page.$('#optionB-submit-btn');
    await submitBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    // Screen 2 -> Screen 3
    console.log('Generating Plan from Screen 2...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Generate Optimal Graduation Plan'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Accept fallback modal if present
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const modalBtn = buttons.find((b) => b.textContent.includes('Accept Fallback & Generate Plan'));
      if (modalBtn) modalBtn.click();
    });

    console.log('Waiting for Screen 3 historical coursework accordion toggle...');
    await page.waitForSelector('[aria-controls="historical-coursework-accordion"]', { timeout: 15000 });

    console.log('Landed on Screen 3! Expanding accordion...');
    await page.evaluate(() => {
      const toggle = document.querySelector('[aria-controls="historical-coursework-accordion"]');
      if (toggle) toggle.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Extract Transfer Card & AY Blocks data
    const extractedData = await page.evaluate(() => {
      const accordion = document.getElementById('historical-coursework-accordion');
      if (!accordion) return { error: 'Accordion element not found' };

      // 1. Transfer Card Check
      const transferCard = accordion.querySelector('.bg-white.rounded-xl.border');
      let transferInfo = null;
      if (transferCard) {
        const transferHeader = transferCard.querySelector('span.font-bold')?.innerText || '';
        const transferPill = transferCard.querySelector('span.font-mono')?.innerText || '';
        const transferCourseRows = Array.from(
          transferCard.querySelectorAll('.flex.items-center.justify-between.gap-2')
        ).map((row) => ({
          text: row.innerText.replace(/\n/g, ' ')
        }));
        transferInfo = {
          header: transferHeader,
          pill: transferPill,
          courseCount: transferCourseRows.length,
          courses: transferCourseRows
        };
      }

      // 2. Academic Year Blocks Check
      const ayBlocks = Array.from(
        accordion.querySelectorAll('.bg-neutral-50\\/70.rounded-2xl.border')
      );
      const ayData = ayBlocks.map((block) => {
        const titleH3 = block.querySelector('h3')?.innerText || '';
        const badge = block.querySelector('span.font-mono.font-bold')?.innerText || '';

        // Two-column grid
        const grid = block.querySelector('.grid.grid-cols-1.md\\:grid-cols-2');
        const semCards = grid
          ? Array.from(grid.querySelectorAll('.bg-white.rounded-xl.border'))
          : [];

        const sems = semCards.map((semCard) => {
          const semTitle = semCard.querySelector('span.font-bold')?.innerText || '';
          const semMeta = semCard.querySelector('div.font-mono')?.innerText || '';
          const sessions = Array.from(
            semCard.querySelectorAll('.text-\\[10px\\].font-bold.text-neutral-400')
          ).map((s) => s.innerText.trim());
          const courseRows = Array.from(
            semCard.querySelectorAll('.flex.items-center.justify-between.gap-2')
          ).map((r) => r.innerText.replace(/\n/g, ' '));

          return {
            semTitle,
            semMeta,
            sessionCount: sessions.length,
            sessions,
            courseCount: courseRows.length,
            courses: courseRows
          };
        });

        // Centered Summer Check
        const summerContainer = block.querySelector('.w-full.md\\:w-3\\/5.mx-auto');
        let summerInfo = null;
        if (summerContainer) {
          const summerCard = summerContainer.querySelector('.bg-white.rounded-xl.border');
          if (summerCard) {
            summerInfo = {
              title: summerCard.querySelector('span.font-bold')?.innerText || '',
              courses: Array.from(
                summerCard.querySelectorAll('.flex.items-center.justify-between.gap-2')
              ).map((r) => r.innerText.replace(/\n/g, ' '))
            };
          }
        }

        return {
          title: titleH3,
          badge,
          semesters: sems,
          summer: summerInfo
        };
      });

      return {
        transferInfo,
        ayCount: ayBlocks.length,
        ayData
      };
    });

    console.log('Extracted Accordion Data:');
    console.log(JSON.stringify(extractedData, null, 2));

    // Capture screenshot of expanded Screen 3 with AY Mirror
    const screenshotPath =
      'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\screen3_ay_mirror_verified.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to: ${screenshotPath}`);

    // Assertions
    if (!extractedData.transferInfo) {
      throw new Error('Transfer Card was not found in DOM!');
    }
    console.log('✓ Transfer Card verified:', extractedData.transferInfo.header);

    if (extractedData.ayCount !== 3) {
      throw new Error(`Expected 3 Academic Year blocks, found ${extractedData.ayCount}`);
    }
    console.log(`✓ Academic Year Blocks verified: ${extractedData.ayCount} blocks`);

    console.log('🎉 ALL AY MIRROR ACCORDION VERIFICATION CHECKS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
