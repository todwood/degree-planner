import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

const LIVE_URL = 'https://todwood.github.io/degree-planner/';

async function verifyLive() {
  console.log(`Starting live site verification for: ${LIVE_URL}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      console.log(`Live HTTP ${resp.status()}: ${resp.url()}`);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('fetchStandardFontData') && !text.includes('Cannot polyfill')) {
        consoleErrors.push(text);
      }
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.toString());
  });

  try {
    console.log('Navigating to live deployment...');
    await page.goto(LIVE_URL, { waitUntil: 'networkidle2', timeout: 35000 });

    const title = await page.title();
    console.log(`[PASS] Live Page Title: "${title}"`);

    // Verify Header
    const header = await page.$eval('header', (el) => el.innerText);
    console.log('[PASS] Live Header Text:', header.replace(/\n/g, ' '));

    // Login if on Screen 0
    const isLogin = await page.evaluate(() => 
      document.body.innerText.includes('Faculty Access Required') || 
      document.body.innerText.includes('Sign In') ||
      document.body.innerText.includes('Degree Planner Access') ||
      document.body.innerText.includes('Advisor Workspace Access')
    );
    if (isLogin) {
      // Enter passphrase and submit
      const passInput = await page.$('#login-passphrase');
      if (passInput) {
        const isDisabled = await page.evaluate((el) => el.disabled, passInput);
        if (!isDisabled) {
          await passInput.type('lionsplanahead');
        }
      }
      const launchBtn = await page.$('#login-launch-btn, button[type="submit"]');
      if (launchBtn) {
        await launchBtn.click();
      }
      await new Promise((r) => setTimeout(r, 800));
      console.log('[PASS] Logged in to Degree Planner on live site.');
    }

    // Verify Screen 1 Intake Heading
    const screen1H1 = await page.$eval('h1, h2', (el) => el.innerText);
    console.log('[PASS] Live Screen 1 Heading:', screen1H1);

    // Checkpoint 1: 3-Card Layout Structure
    const hasCard1 = await page.evaluate(() => document.body.innerText.includes('1. STUDENT RECORDS'));
    const hasCard2 = await page.evaluate(() => document.body.innerText.includes('STUDENT ACADEMIC PLAN & FUTURE CREDENTIALS') || document.body.innerText.includes('2. DEGREE CURRICULUM & CREDENTIAL ROSTER'));
    const hasCard3 = await page.evaluate(() => document.body.innerText.includes('3. SCHEDULING CONSTRAINTS'));
    if (!hasCard1 || !hasCard2 || !hasCard3) {
      throw new Error(`FAILED: 3-Card layout headers missing. Card1: ${hasCard1}, Card2: ${hasCard2}, Card3: ${hasCard3}`);
    }
    console.log('[PASS] Live Checkpoint 1: 3-Card structure confirmed on live deployment.');

    // Checkpoint 2: Header Badges
    const badgeLocal = await page.evaluate(() => document.body.innerText.includes('Local Processing, Zero Uploads'));
    const badgePacing = await page.evaluate(() => document.body.innerText.includes('Path Pacing Rules'));
    if (!badgeLocal || !badgePacing) {
      throw new Error('FAILED: Expected header badges "Local Processing, Zero Uploads" or "Path Pacing Rules".');
    }
    console.log('[PASS] Live Checkpoint 2: Card header badges confirmed.');

    // Checkpoint 3: Initial Empty Identity Row & Placeholders
    const identityState = await page.evaluate(() => {
      const nameInput = document.querySelector('#optionB-student-name');
      const idInput = document.querySelector('#optionB-student-id');
      const advNameInput = document.querySelector('#optionB-advisor-name');
      const advEmailInput = document.querySelector('#optionB-advisor-email');
      const addon = Array.from(document.querySelectorAll('span')).some((s) => s.textContent.includes('@lindenwood.edu'));
      return {
        nameVal: nameInput?.value,
        namePlaceholder: nameInput?.placeholder,
        idVal: idInput?.value,
        idPlaceholder: idInput?.placeholder,
        advNamePlaceholder: advNameInput?.placeholder,
        advEmailPlaceholder: advEmailInput?.placeholder,
        hasEmailAddon: addon
      };
    });
    console.log('[PASS] Live Checkpoint 3: Identity inputs inspected:', identityState);
    if (identityState.nameVal !== '' || identityState.idVal !== '') {
      throw new Error('FAILED: Initial student identity inputs must start empty with zero sample data.');
    }
    if (identityState.namePlaceholder !== 'Auto-Filled by Transcripts' || !identityState.hasEmailAddon) {
      throw new Error('FAILED: Identity input placeholders or @lindenwood.edu addon mismatch.');
    }

    // Checkpoint 4: 3 Ingestion Dropzones
    const dropzones = await page.evaluate(() => {
      return {
        anthology: Boolean(document.querySelector('#optionB-anthology')),
        transcript: Boolean(document.querySelector('#optionB-transcript')),
        degreePlan: Boolean(document.querySelector('#optionA-degreePlan'))
      };
    });
    if (!dropzones.anthology || !dropzones.transcript || !dropzones.degreePlan) {
      throw new Error(`FAILED: Dropzone missing: ${JSON.stringify(dropzones)}`);
    }
    console.log('[PASS] Live Checkpoint 4: 3 Ingestion dropzones verified.');

    // Checkpoint 5: Card 3 Pacing Controls & Overload / Summer Gating
    console.log('Testing Card 3 Pacing Controls on live site...');
    const pacingModeSelect = await page.$('#optionB-pacing-mode');
    if (!pacingModeSelect) throw new Error('FAILED: #optionB-pacing-mode missing on live site!');

    // Test Overload Notice at 21 cr
    const capSelect = await page.$('#optionB-max-16wk');
    await page.select('#optionB-max-16wk', '21');
    await new Promise((r) => setTimeout(r, 400));

    const overloadNoticeText = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="overload-notice"]');
      return el ? el.innerText.replace(/\n+/g, ' ') : null;
    });
    if (!overloadNoticeText || !overloadNoticeText.includes('Students with a cumulative GPA of 3.5 or above are eligible to take up to 24 credits')) {
      throw new Error(`FAILED: Overload notice missing or mismatch at 21 cr. Found: ${overloadNoticeText}`);
    }
    console.log('[PASS] Live Checkpoint 5: Overload notice verified at 21 cr.');

    // Test Summer Availability & Dynamic Summer Cap Dropdown
    await page.select('#optionB-summer-select', 'Yes Summer');
    await new Promise((r) => setTimeout(r, 400));
    const summerCapExists = await page.$('#optionB-summer-cap');
    if (!summerCapExists) throw new Error('FAILED: #optionB-summer-cap missing when "Yes Summer" selected!');
    console.log('[PASS] Live Checkpoint 6: Summer availability & dynamic summer cap dropdown verified.');

    // Checkpoint 7: Test Modal B on zero-course state
    console.log('Testing Modal B Registration Start Term Confirmation Modal on live site...');
    // Provide student identity and declare a primary major to satisfy intake progression gate
    await page.type('#optionB-student-name', 'Jane Doe');
    await page.type('#optionB-student-id', 'A00998877');

    const comboboxTrigger = await page.$('#optionB-program-combobox-trigger');
    if (comboboxTrigger) {
      await comboboxTrigger.click();
      await new Promise((r) => setTimeout(r, 400));
      const searchInput = await page.$('#optionB-program-search-input');
      if (searchInput) {
        await searchInput.type('Cybersecurity, BS');
        await new Promise((r) => setTimeout(r, 400));
      }
      await page.evaluate(() => {
        const opt = Array.from(document.querySelectorAll('div[id^="program-option-"]')).find(
          (el) => el.textContent.includes('Cybersecurity, BS')
        );
        if (opt) opt.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      const addBtn = await page.$('#add-program-to-stack-button');
      if (addBtn) await addBtn.click();
      await new Promise((r) => setTimeout(r, 400));
    }

    const submitBtn = await page.$('#optionB-submit-btn');
    if (!submitBtn) throw new Error('FAILED: #optionB-submit-btn missing on live site!');
    await submitBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    const modalBTitle = await page.evaluate(() => {
      const h3 = Array.from(document.querySelectorAll('h3')).find((el) => el.textContent.includes('Confirm Registration Start Term'));
      return h3 ? h3.textContent.trim() : null;
    });
    if (!modalBTitle) throw new Error('FAILED: Modal B did not open when clicking Run Degree Audit with zero active courses!');
    console.log('[PASS] Live Checkpoint 7: Modal B confirmed on live site with priority window info.');

    // Cancel modal B
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Cancel'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Checkpoint 8: Real Transcript Upload (Brandon Paz)
    console.log('Testing Brandon Paz Unofficial Transcript upload on live site...');
    const transcriptInput = await page.$('input#optionB-transcript-input');
    if (!transcriptInput) throw new Error('FAILED: input#optionB-transcript-input not found on live site!');

    const samplePdf = 'c:\\Users\\todwood\\Documents\\Antigravity Work\\Degree_Panner\\.tmp\\samples\\Brandon Paz\\sub_Transcript - UnOfficial_landscape.pdf';
    await transcriptInput.uploadFile(samplePdf);
    await new Promise((r) => setTimeout(r, 2500));

    const liveSummaryBadge = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="parsed-telemetry-panel"]');
      return el ? el.innerText.replace(/\n+/g, ' ') : null;
    });
    if (!liveSummaryBadge || !liveSummaryBadge.includes('Parsed') || !liveSummaryBadge.includes('Total Credits')) {
      throw new Error(`FAILED: Parsed Telemetry Panel text missing. Found: ${liveSummaryBadge}`);
    }
    console.log(`[PASS] Live Checkpoint 8: Brandon Paz transcript processed. Telemetry banner: "${liveSummaryBadge.slice(0, 100)}..."`);

    // Checkpoint 9: Modal A (Active Term Course Editor)
    console.log('Testing Modal A (Active Term Course Editor) on live site...');
    const editActiveTermBtn = await page.$('[data-testid="edit-active-term-btn"]');
    if (!editActiveTermBtn) throw new Error('FAILED: [data-testid="edit-active-term-btn"] missing on live site!');
    await editActiveTermBtn.click();
    await new Promise((r) => setTimeout(r, 500));

    const modalATitle = await page.evaluate(() => {
      const h3 = Array.from(document.querySelectorAll('h3')).find(
        (el) => el.textContent.includes('Active Term') || el.textContent.includes('Enrolled Coursework')
      );
      return h3 ? h3.textContent.trim() : null;
    });
    if (!modalATitle) throw new Error('FAILED: Modal A did not open when clicking Edit Active Term button!');
    console.log('[PASS] Live Checkpoint 9: Modal A verified on live site.');

    // Close Modal A
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Cancel'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Checkpoint 10: Screen 2 "Path to Graduation" & Policy Drawer Verification
    console.log('Testing Screen 2 "Path to Graduation" on live site...');
    const runAuditBtn = await page.$('#optionB-submit-btn');
    if (!runAuditBtn) throw new Error('FAILED: #optionB-submit-btn missing for Brandon Paz!');
    await runAuditBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    const pathTitle = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="path-to-graduation-title"]');
      return el ? el.textContent.trim() : null;
    });
    if (pathTitle !== 'PATH TO GRADUATION') {
      throw new Error(`FAILED: Expected "PATH TO GRADUATION" on live Screen 2, found: "${pathTitle}"`);
    }
    console.log('[PASS] Live Checkpoint 10: "PATH TO GRADUATION" confirmed on live Screen 2.');

    const lionPawExists = await page.$('[data-testid="lion-paw-marker"]');
    if (!lionPawExists) throw new Error('FAILED: [data-testid="lion-paw-marker"] missing on live Screen 2!');
    console.log('[PASS] Live Checkpoint 11: Lion Paw marker verified on live site.');

    const diplomaExists = await page.$('[data-testid="diploma-finish-icon"]');
    if (!diplomaExists) throw new Error('FAILED: [data-testid="diploma-finish-icon"] missing on live Screen 2!');
    console.log('[PASS] Live Checkpoint 12: Diploma finish line verified on live site.');

    // Toggle drawer open
    const drawerToggle = await page.$('#audit-details-drawer-toggle');
    if (!drawerToggle) throw new Error('FAILED: #audit-details-drawer-toggle missing on live Screen 2!');
    await drawerToggle.click();
    await new Promise((r) => setTimeout(r, 500));

    const policyGridExists = await page.$('[data-testid="policy-checks-grid"]');
    if (!policyGridExists) throw new Error('FAILED: [data-testid="policy-checks-grid"] missing after opening drawer!');
    console.log('[PASS] Live Checkpoint 13: Policy drawer expanded and verified on live site.');

    // Save screenshot
    const screenPath = '.tmp/live_github_pages_verification.png';
    await page.screenshot({ path: screenPath, fullPage: true });
    console.log(`[PASS] Saved live screenshot to ${screenPath}`);

    console.log(`\nLive Site Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error('Console errors:', consoleErrors);
    }

    await browser.close();
    process.exit(consoleErrors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('Live Verification Error:', err);
    await browser.close();
    process.exit(1);
  }
}

verifyLive();
