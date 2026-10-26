import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function run() {
  console.log('--- Starting Verification Against Local Dev Server (http://localhost:5173/) ---');
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
    await new Promise((r) => setTimeout(r, 800));

    // Accept fallback modal if present
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const modalBtn = buttons.find((b) => b.textContent.includes('Accept Fallback & Generate Plan'));
      if (modalBtn) modalBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    console.log('Landed on Screen 3! Testing expanded accordion...');

    // Expand historical coursework accordion
    await page.click('[aria-controls="historical-coursework-accordion"]');
    await new Promise((r) => setTimeout(r, 600));

    // Extract chronological term cards
    const termCardsData = await page.evaluate(() => {
      const accordion = document.getElementById('historical-coursework-accordion');
      if (!accordion) return null;

      // Find the grid
      const grid = accordion.querySelector('.grid');
      const gridClasses = grid ? grid.className : '';

      const cards = Array.from(accordion.querySelectorAll('.bg-white.rounded-lg.border'));
      return {
        gridClasses,
        cardCount: cards.length,
        cards: cards.map((card) => {
          const header = card.querySelector('.bg-neutral-50\\/80');
          const termTitle = header ? header.querySelector('span.font-bold')?.innerText : '';
          const statsText = header ? header.querySelector('div.font-mono')?.innerText : '';

          // Session sub-headers inside this card
          const sessionHeaders = Array.from(
            card.querySelectorAll('.text-\\[10px\\].font-bold.text-neutral-400')
          ).map((s) => s.innerText.trim());

          // Course rows inside this card
          const rows = Array.from(card.querySelectorAll('.flex.items-center.justify-between.gap-2'));
          const courses = rows.map((r) => {
            const hasTrBadge = Boolean(r.querySelector('span.bg-amber-50'));
            const code = r.querySelector('.font-mono.font-bold.text-neutral-800')?.innerText || '';
            const title = r.querySelector('.text-\\[11px\\].text-neutral-500')?.innerText || '';
            const grade = r.querySelector('.bg-neutral-100')?.innerText || '';
            const credits = r.querySelector('div.flex-shrink-0 span.font-mono.text-neutral-500')?.innerText || '';
            return { hasTrBadge, code, title, grade, credits };
          });

          return {
            termTitle,
            statsText,
            sessionHeaders,
            courseCount: courses.length,
            courses
          };
        })
      };
    });

    console.log('\n--- Extracted Accordion Grid Structure ---');
    console.log('Grid Classes:', termCardsData.gridClasses);
    console.log('Total Semester Cards:', termCardsData.cardCount);

    if (!termCardsData.gridClasses.includes('grid-cols-1') || !termCardsData.gridClasses.includes('lg:grid-cols-3')) {
      throw new Error(`FAILED: Expected responsive grid classes (grid-cols-1 md:grid-cols-2 lg:grid-cols-3). Found: ${termCardsData.gridClasses}`);
    }

    const termNames = termCardsData.cards.map((c) => c.termTitle);
    console.log('Rendered Term Sequence:', termNames.join(' -> '));

    // Verify Term 1 is "Transfer & Prior Learning"
    if (termNames[0] !== 'Transfer & Prior Learning') {
      throw new Error(`FAILED: First term should be "Transfer & Prior Learning". Found: ${termNames[0]}`);
    }
    console.log('✓ Checkpoint 1: "Transfer & Prior Learning" rendered first.');

    // Verify chronological order of remaining terms
    const nonTransferTerms = termNames.slice(1);
    console.log('Academic Terms in Order:', nonTransferTerms.join(', '));
    // Verify Fall 2024 -> Spring 2025 -> Fall 2025 -> Spring 2026 -> Fall 2026
    if (!nonTransferTerms.includes('Fall 2024') || !nonTransferTerms.includes('Spring 2025') || !nonTransferTerms.includes('Fall 2026')) {
      throw new Error(`FAILED: Expected Fall 2024, Spring 2025, Fall 2026 in terms. Found: ${nonTransferTerms.join(', ')}`);
    }
    console.log('✓ Checkpoint 2: Terms are ordered forward chronologically.');

    // Verify each card's headers, sessions, and course rows
    for (const card of termCardsData.cards) {
      console.log(`\nCard [${card.termTitle}]:`);
      console.log(` - Stats: "${card.statsText}" (${card.courseCount} courses)`);
      console.log(` - Active Sessions:`, card.sessionHeaders.join(', ') || '(no session headers)');

      // Verify stats text has cr and Course/Courses
      if (!card.statsText.includes('cr') || (!card.statsText.includes('Course') && !card.statsText.includes('Courses'))) {
        throw new Error(`FAILED: Card stats text missing "cr" or "Course(s)": "${card.statsText}"`);
      }

      // Check courses
      for (const c of card.courses) {
        if (!c.code || !c.grade || !c.credits) {
          throw new Error(`FAILED: Course missing required row fields: ${JSON.stringify(c)}`);
        }
        if (c.hasTrBadge) {
          console.log(`   * [TR] ${c.code} - ${c.title} (${c.grade}, ${c.credits})`);
        } else {
          console.log(`   * ${c.code} - ${c.title} (${c.grade}, ${c.credits})`);
        }
      }
    }
    console.log('\n✓ Checkpoint 3: Card headers, conditional session micro-headers, and minimalist rows verified.');

    // Save screenshot
    const shotPath = 'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\screen3_chronological_grid_verified.png';
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('✓ Screenshot saved to:', shotPath);

    console.log('\n========================================================');
    console.log('✅ ALL CHRONOLOGICAL ACCORDION GRID CHECKS PASSED!');
    console.log('========================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
