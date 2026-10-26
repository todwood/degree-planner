import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function run() {
  console.log('--- Starting HeaderNav Responsive Hierarchy & Reset Verification ---');
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

    // Test 1: FERPA Pill & Hover Popover at 1440px
    console.log('Testing FERPA Pill Hover Popover at 1440px...');
    const ferpaPill = await page.$('[aria-label="Built to Support FERPA-Compliant Advising"]');
    if (!ferpaPill) throw new Error('FERPA pill not found in header!');

    // Hover over FERPA pill
    await ferpaPill.hover();
    await new Promise((r) => setTimeout(r, 400));

    const popoverData = await page.evaluate(() => {
      const popover = document.querySelector('[role="tooltip"]');
      if (!popover) return null;
      return {
        headline: popover.querySelector('h4')?.innerText || '',
        body: popover.querySelector('p')?.innerText || ''
      };
    });

    console.log('Popover Data:', popoverData);
    if (!popoverData || !popoverData.headline.includes('Local processing protects student information')) {
      throw new Error('FERPA popover failed to open or content is incorrect!');
    }
    console.log('✓ FERPA hover popover verified successfully!');

    // Test 2: Upload Brandon Paz to test Active Record badge & formatting
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

    // Submit Option B to Screen 2
    console.log('Submitting Option B to establish active record...');
    await page.click('#optionB-submit-btn');
    await new Promise((r) => setTimeout(r, 1800));

    // Check Active Record Badge
    const activeBadgeText = await page.evaluate(() => {
      const header = document.querySelector('header');
      const badges = Array.from(header.querySelectorAll('div, span'));
      const activeBadge = badges.find((b) => b.innerText && b.innerText.includes('Active Record:'));
      return activeBadge ? activeBadge.innerText.replace(/\n/g, ' ') : '';
    });

    console.log('Active Badge Text:', activeBadgeText);
    if (!activeBadgeText.includes('Active Record: Brandon P.')) {
      throw new Error(`Expected "Active Record: Brandon P.", found: "${activeBadgeText}"`);
    }
    console.log('✓ Active Record parsed name verified: "Brandon P."');

    // Test 3: Responsive Degradation Hierarchy
    // 3a. Wide Desktop: 1440px
    await page.setViewport({ width: 1440, height: 900 });
    await new Promise((r) => setTimeout(r, 300));
    const wideHeaderState = await page.evaluate(() => {
      const ferpaText = document.querySelector('header span.hidden.xl\\:inline');
      const stepperLabels = Array.from(document.querySelectorAll('header button span.hidden.lg\\:inline'));
      return {
        ferpaTextVisible: ferpaText ? window.getComputedStyle(ferpaText).display !== 'none' : false,
        stepperLabelsCount: stepperLabels.filter((el) => window.getComputedStyle(el).display !== 'none').length
      };
    });
    console.log('1440px Header State:', wideHeaderState);
    if (!wideHeaderState.ferpaTextVisible || wideHeaderState.stepperLabelsCount < 3) {
      throw new Error('At 1440px, FERPA text and stepper labels should be fully visible!');
    }
    console.log('✓ 1440px Wide Desktop view verified.');

    // 3b. 1024px Viewport (< xl): FERPA text collapses to icon/dot, stepper labels visible
    await page.setViewport({ width: 1024, height: 900 });
    await new Promise((r) => setTimeout(r, 300));
    const medHeaderState = await page.evaluate(() => {
      const ferpaText = document.querySelector('header span.hidden.xl\\:inline');
      const ferpaPill = document.querySelector('[aria-label="Built to Support FERPA-Compliant Advising"]');
      const stepperLabels = Array.from(document.querySelectorAll('header button span.hidden.lg\\:inline'));
      return {
        ferpaPillVisible: ferpaPill ? window.getComputedStyle(ferpaPill).display !== 'none' : false,
        ferpaTextVisible: ferpaText ? window.getComputedStyle(ferpaText).display !== 'none' : false,
        stepperLabelsCount: stepperLabels.filter((el) => window.getComputedStyle(el).display !== 'none').length
      };
    });
    console.log('1024px Header State:', medHeaderState);
    if (!medHeaderState.ferpaPillVisible || medHeaderState.ferpaTextVisible) {
      throw new Error('At 1024px, FERPA pill must be visible but long text must be collapsed/hidden!');
    }
    console.log('✓ 1024px (< xl) FERPA collapse verified.');

    // 3c. 768px Viewport (< lg): Stepper text collapses to 1, 2, 3
    await page.setViewport({ width: 768, height: 900 });
    await new Promise((r) => setTimeout(r, 300));
    const smallHeaderState = await page.evaluate(() => {
      const stepperLabels = Array.from(document.querySelectorAll('header button span.hidden.lg\\:inline'));
      const activeBadge = document.querySelector('header div.whitespace-nowrap');
      return {
        stepperLabelsVisible: stepperLabels.some((el) => window.getComputedStyle(el).display !== 'none'),
        activeBadgeVisible: activeBadge ? window.getComputedStyle(activeBadge).display !== 'none' : false
      };
    });
    console.log('768px Header State:', smallHeaderState);
    if (smallHeaderState.stepperLabelsVisible) {
      throw new Error('At 768px, stepper labels should be collapsed to compact numbered buttons!');
    }
    console.log('✓ 768px Stepper collapse verified.');

    // Restore viewport
    await page.setViewport({ width: 1440, height: 900 });
    await new Promise((r) => setTimeout(r, 300));

    // Test 4: Brand Home Navigation
    console.log('Testing Brand Home Navigation (Clicking DP mark)...');
    console.log('Before click body text:', (await page.evaluate(() => document.body.innerText)).slice(0, 300));
    await page.click('[title="Degree Planner — Return to Student Intake"]');
    await new Promise((r) => setTimeout(r, 800));

    const isScreen1 = await page.evaluate(() => {
      return document.body.innerText.toLowerCase().includes('step 1: student intake');
    });
    console.log('Is Screen 1 after clicking DP brand?', isScreen1);
    if (!isScreen1) throw new Error('Clicking DP mark did not return to Screen 1 Intake!');
    console.log('✓ Brand Home Navigation verified.');

    // Test 5: Active Record Reset Button [X] & 5-Second Confirmation Modal
    console.log('Testing Active Record Reset [X] button & countdown modal...');
    const clearBtn = await page.$('button[title="Clear Active Student Record"]');
    if (!clearBtn) throw new Error('Reset [X] button not found in active record badge!');
    await clearBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    // Verify modal is open and button is disabled with countdown
    const modalInitialState = await page.evaluate(() => {
      const modal = document.querySelector('[aria-labelledby="clear-active-record-title"]');
      if (!modal) return null;
      const confirmBtn = Array.from(modal.querySelectorAll('button')).find((b) =>
        b.innerText.includes('Confirm Clear')
      );
      return {
        title: modal.querySelector('#clear-active-record-title')?.innerText || '',
        btnText: confirmBtn?.innerText || '',
        isDisabled: confirmBtn?.disabled
      };
    });

    console.log('Modal Initial State:', modalInitialState);
    if (!modalInitialState || !modalInitialState.isDisabled || !modalInitialState.btnText.includes('(5s)')) {
      throw new Error('Confirmation modal confirm button should be disabled with 5s countdown!');
    }
    console.log('✓ Modal opened with 5s countdown safety guard.');

    // Screenshot of modal during countdown
    const modalScreenshotPath =
      'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\headernav_reset_modal_verified.png';
    await page.screenshot({ path: modalScreenshotPath, fullPage: false });
    console.log(`Saved modal screenshot to: ${modalScreenshotPath}`);

    // Wait 5.2 seconds for countdown to reach 0
    console.log('Waiting 5.2 seconds for countdown timer to elapse...');
    await new Promise((r) => setTimeout(r, 5200));

    const modalReadyState = await page.evaluate(() => {
      const modal = document.querySelector('[aria-labelledby="clear-active-record-title"]');
      const confirmBtn = Array.from(modal.querySelectorAll('button')).find((b) =>
        b.innerText.includes('Confirm Clear')
      );
      return {
        btnText: confirmBtn?.innerText || '',
        isDisabled: confirmBtn?.disabled
      };
    });

    console.log('Modal Ready State after countdown:', modalReadyState);
    if (modalReadyState.isDisabled || modalReadyState.btnText !== 'Confirm Clear Record') {
      throw new Error(`Expected button to be enabled with "Confirm Clear Record", got: ${JSON.stringify(modalReadyState)}`);
    }
    console.log('✓ Countdown completed; button enabled as "Confirm Clear Record".');

    // Confirm the clear action
    console.log('Clicking Confirm Clear Record...');
    await page.evaluate(() => {
      const modal = document.querySelector('[aria-labelledby="clear-active-record-title"]');
      const confirmBtn = Array.from(modal.querySelectorAll('button')).find((b) =>
        b.innerText === 'Confirm Clear Record'
      );
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Verify Active Record Badge is gone and intake form is clean
    const postClearState = await page.evaluate(() => {
      const header = document.querySelector('header');
      const hasActiveBadge = header.innerText.includes('Active Record:');
      const isScreen1 = document.body.innerText.toLowerCase().includes('step 1: student intake');
      const studentNameInput = document.querySelector('#optionB-student-name')?.value || '';
      return {
        hasActiveBadge,
        isScreen1,
        studentNameInput
      };
    });

    console.log('Post-Clear State:', postClearState);
    if (postClearState.hasActiveBadge) {
      throw new Error('Active record badge still visible after clearing!');
    }
    if (!postClearState.isScreen1) {
      throw new Error('Did not route back to Screen 1 after clearing!');
    }
    console.log('✓ Active record successfully cleared and user returned to clean Intake Workspace.');

    // Capture screenshot of clean state
    const cleanScreenshotPath =
      'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\headernav_clean_state_verified.png';
    await page.screenshot({ path: cleanScreenshotPath, fullPage: false });
    console.log(`Saved clean state screenshot to: ${cleanScreenshotPath}`);

    console.log('🎉 ALL HEADERNAV HIERARCHY, PRIVACY PILL, NAME PARSER, AND RESET GUARD CHECKS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
