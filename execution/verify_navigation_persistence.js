import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function run() {
  console.log('--- Starting Navigation Persistence & Action Copy Verification ---');
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

    // Upload Brandon Paz files on Screen 1
    console.log('Uploading Brandon Paz files on Screen 1...');
    const brandonDir = path.resolve('.tmp/samples/Brandon Paz');
    const pdfPath = path.join(brandonDir, 'sub_Transcript - UnOfficial_landscape.pdf');
    const xlsxPath = path.join(brandonDir, 'StudentCourseSchedules (All Results).xlsx');

    const pdfInput = await page.$('input#optionB-transcript-input');
    await pdfInput.uploadFile(pdfPath);
    await new Promise((r) => setTimeout(r, 1200));

    const xlsxInput = await page.$('input#optionB-anthology-input');
    await xlsxInput.uploadFile(xlsxPath);
    await new Promise((r) => setTimeout(r, 1500));

    // Advance to Screen 2
    console.log('Advancing to Screen 2...');
    await page.click('#optionB-submit-btn');
    await new Promise((r) => setTimeout(r, 1800));

    // Verify Screen 2 Button Copy & Removed Helper Text
    console.log('Verifying Screen 2 Button Copy and Footer text...');
    const screen2State = await page.evaluate(() => {
      const isScreen2 = document.body.innerText.includes('STEP 2: DETERMINISTIC DEGREE AUDIT');
      const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.innerText.trim());
      const hasOldTopBtn = buttons.some((t) => t.includes('Generate Optimal Graduation Plan'));
      const hasNewTopBtn = buttons.some((t) => t.includes('Proceed to Optimal Degree Plan'));
      const hasOldFooterText = document.body.innerText.includes('Ready to build the 8-week and 16-week');
      return {
        isScreen2,
        hasOldTopBtn,
        hasNewTopBtn,
        hasOldFooterText
      };
    });

    console.log('Screen 2 State:', screen2State);
    if (!screen2State.isScreen2) throw new Error('Failed to land on Screen 2!');
    if (screen2State.hasOldTopBtn) throw new Error('Screen 2 still contains old "Generate Optimal Graduation Plan" text!');
    if (!screen2State.hasNewTopBtn) throw new Error('Screen 2 does not have "Proceed to Optimal Degree Plan" button!');
    if (screen2State.hasOldFooterText) throw new Error('Screen 2 still contains old descriptive helper text!');
    console.log('✓ Screen 2 updated button copy and removed footer text verified.');

    // Save Screen 2 screenshot
    const screen2ScreenshotPath =
      'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\screen2_buttons_verified.png';
    await page.screenshot({ path: screen2ScreenshotPath, fullPage: false });
    console.log(`Saved Screen 2 screenshot to: ${screen2ScreenshotPath}`);

    // Click "← Back to Intake"
    console.log('Clicking "← Back to Intake" button...');
    await page.evaluate(() => {
      const backBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.innerText.includes('Back to Intake')
      );
      if (backBtn) backBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Verify Screen 1 State Persistence & Top Toolbar
    console.log('Verifying Screen 1 State Persistence after returning from Screen 2...');
    const screen1PersistedState = await page.evaluate(() => {
      const isScreen1 = document.body.innerText.toLowerCase().includes('step 1: student intake');
      const studentNameInput = document.querySelector('#optionB-student-name')?.value || '';
      const studentIdInput = document.querySelector('#optionB-student-id')?.value || '';
      const topToolbar = document.getElementById('screen1-active-record-toolbar');
      const topClearBtn = document.getElementById('screen1-clear-active-btn');
      const topProceedBtn = document.getElementById('screen1-top-proceed-btn');
      const bottomProceedBtn = document.getElementById('optionB-submit-btn');

      return {
        isScreen1,
        studentNameInput,
        studentIdInput,
        hasTopToolbar: Boolean(topToolbar),
        topClearBtnText: topClearBtn?.innerText?.trim() || '',
        topProceedBtnText: topProceedBtn?.innerText?.trim() || '',
        bottomProceedBtnText: bottomProceedBtn?.innerText?.trim() || ''
      };
    });

    console.log('Screen 1 Persisted State:', screen1PersistedState);
    if (!screen1PersistedState.isScreen1) throw new Error('Did not return to Screen 1!');
    if (!screen1PersistedState.studentNameInput.includes('Brandon')) {
      throw new Error(`Expected studentName to include "Brandon", found "${screen1PersistedState.studentNameInput}"`);
    }
    if (!screen1PersistedState.studentIdInput) {
      throw new Error('Expected studentId to be populated, found empty!');
    }
    if (!screen1PersistedState.hasTopToolbar) {
      throw new Error('Top Active Record Toolbar not rendered on Screen 1!');
    }
    if (!screen1PersistedState.topProceedBtnText.includes('Proceed to Degree Audit')) {
      throw new Error(`Expected top button "Proceed to Degree Audit", found "${screen1PersistedState.topProceedBtnText}"`);
    }
    if (!screen1PersistedState.bottomProceedBtnText.includes('Proceed to Degree Audit')) {
      throw new Error(`Expected bottom button "Proceed to Degree Audit", found "${screen1PersistedState.bottomProceedBtnText}"`);
    }
    if (screen1PersistedState.topProceedBtnText.includes('→') || screen1PersistedState.bottomProceedBtnText.includes('→')) {
      throw new Error('Buttons contain hardcoded text arrows!');
    }
    console.log('✓ Screen 1 State Persistence, Top Toolbar, and Button Copy verified.');

    // Save Screen 1 screenshot with top toolbar
    const screen1ScreenshotPath =
      'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\screen1_persisted_toolbar_verified.png';
    await page.screenshot({ path: screen1ScreenshotPath, fullPage: false });
    console.log(`Saved Screen 1 screenshot to: ${screen1ScreenshotPath}`);

    // Test Top Toolbar "Proceed to Degree Audit"
    console.log('Testing Screen 1 Top Toolbar "Proceed to Degree Audit" button...');
    await page.click('#screen1-top-proceed-btn');
    await new Promise((r) => setTimeout(r, 1200));

    const landedBackScreen2 = await page.evaluate(() => {
      return document.body.innerText.includes('STEP 2: DETERMINISTIC DEGREE AUDIT');
    });
    if (!landedBackScreen2) throw new Error('Top toolbar proceed button failed to advance back to Screen 2!');
    console.log('✓ Screen 1 Top Toolbar proceeded successfully back to Screen 2.');

    // Navigate back to Screen 1 via HeaderNav
    console.log('Navigating back to Screen 1 via HeaderNav "1. Student Intake"...');
    await page.evaluate(() => {
      const intakeNavBtn = Array.from(document.querySelectorAll('header button')).find((b) =>
        b.innerText.includes('1.')
      );
      if (intakeNavBtn) intakeNavBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Test Screen 1 Top Toolbar "Clear Active Student" button & 5-Second Modal
    console.log('Testing Screen 1 Top Toolbar "Clear Active Student" 5s confirmation modal...');
    await page.click('#screen1-clear-active-btn');
    await new Promise((r) => setTimeout(r, 400));

    const modalInitialState = await page.evaluate(() => {
      const modal = document.querySelector('[aria-labelledby="clear-student-intake-title"]');
      const confirmBtn = document.getElementById('clear-student-intake-confirm-btn');
      return {
        isOpen: Boolean(modal),
        title: modal?.querySelector('#clear-student-intake-title')?.innerText || '',
        btnText: confirmBtn?.innerText || '',
        isDisabled: confirmBtn?.disabled
      };
    });

    console.log('Screen 1 Clear Modal Initial State:', modalInitialState);
    if (!modalInitialState.isOpen || !modalInitialState.isDisabled || !modalInitialState.btnText.includes('(5s)')) {
      throw new Error('Clear confirmation modal did not open with 5s countdown!');
    }
    console.log('✓ Screen 1 Clear Modal opened with 5-second countdown guard.');

    // Wait 5.2s for countdown to finish
    console.log('Waiting 5.2 seconds for countdown...');
    await new Promise((r) => setTimeout(r, 5200));

    const modalReadyState = await page.evaluate(() => {
      const confirmBtn = document.getElementById('clear-student-intake-confirm-btn');
      return {
        btnText: confirmBtn?.innerText || '',
        isDisabled: confirmBtn?.disabled
      };
    });

    console.log('Screen 1 Clear Modal Ready State:', modalReadyState);
    if (modalReadyState.isDisabled || modalReadyState.btnText !== 'Confirm Clear Record') {
      throw new Error(`Expected button to be enabled with "Confirm Clear Record", got ${JSON.stringify(modalReadyState)}`);
    }

    // Confirm Clear
    console.log('Clicking Confirm Clear Record on Screen 1...');
    await page.click('#clear-student-intake-confirm-btn');
    await new Promise((r) => setTimeout(r, 800));

    // Verify active record is cleared
    const postClearState = await page.evaluate(() => {
      const studentNameInput = document.querySelector('#optionB-student-name')?.value || '';
      const topToolbar = document.getElementById('screen1-active-record-toolbar');
      const headerHasActive = document.querySelector('header').innerText.includes('Active Record:');
      return {
        studentNameInput,
        hasTopToolbar: Boolean(topToolbar),
        headerHasActive
      };
    });

    console.log('Post-Clear State on Screen 1:', postClearState);
    if (postClearState.studentNameInput !== '') throw new Error('Student name input not cleared!');
    if (postClearState.hasTopToolbar) throw new Error('Top toolbar still visible after clearing!');
    if (postClearState.headerHasActive) throw new Error('Active record badge still in header after clearing!');
    console.log('✓ Clear Active Student on Screen 1 completely cleared active state and reset form.');

    console.log('🎉 ALL PERSISTENCE, SCREEN 1 TOOLBAR, AND BUTTON COPY CHECKS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
