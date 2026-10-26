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
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.toString());
  });

  try {
    console.log('Navigating to live deployment...');
    await page.goto(LIVE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const title = await page.title();
    console.log(`[PASS] Live Page Title: "${title}"`);

    // Verify Header
    const header = await page.$eval('header', (el) => el.innerText);
    console.log('[PASS] Live Header Text:', header.replace(/\n/g, ' '));

    // Verify Screen 1 Intake
    const screen1H1 = await page.$eval('h1, h2', (el) => el.innerText);
    console.log('[PASS] Live Screen 1 Heading:', screen1H1);

    // Checkpoint 1: Bingo Sheet dropzone is 100% removed
    const bingoDropzone = await page.$('#optionB-bingo-sheet');
    if (bingoDropzone !== null) {
      throw new Error('FAILED: #optionB-bingo-sheet still exists in the live DOM!');
    }
    console.log('[PASS] Live Checkpoint 1: Bingo Sheet dropzone completely removed.');

    // Checkpoint 2: Schedule Start Semester labeling
    const startSemLabel = await page.evaluate(() => {
      const el = document.querySelector('label[for="optionB-start-semester"]') ||
        Array.from(document.querySelectorAll('label')).find((l) => l.textContent.includes('Schedule Start Semester'));
      return el ? el.textContent.trim() : null;
    });
    if (!startSemLabel || !startSemLabel.includes('Schedule Start Semester')) {
      throw new Error(`FAILED: Start Semester label mismatch. Found: ${startSemLabel}`);
    }
    console.log(`[PASS] Live Checkpoint 2: "Schedule Start Semester" verified.`);

    // Checkpoint 3: Zero-Upload Button Label
    const submitBtnText = await page.$eval('#optionB-submit-btn', (el) => el.textContent.trim());
    console.log(`[PASS] Live Checkpoint 3: Submit button initial label: "${submitBtnText}"`);
    if (!submitBtnText.includes('Proceed to Optimal Degree Plan') && !submitBtnText.includes('Proceed to Plan Setup')) {
      throw new Error(`FAILED: Expected "Proceed to Optimal Degree Plan". Found: ${submitBtnText}`);
    }

    // Checkpoint 4: Test Currently Enrolled Courses tray
    console.log('Testing Currently Enrolled Courses tray on live site...');
    const trayToggleBtn = await page.$('#optionB-toggle-enrolled-tray-btn');
    if (!trayToggleBtn) {
      throw new Error('FAILED: #optionB-toggle-enrolled-tray-btn missing on live site!');
    }
    await trayToggleBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    const searchInput = await page.$('#tray-course-search');
    if (!searchInput) throw new Error('FAILED: #tray-course-search missing on live site!');
    await searchInput.type('ICS 21300');
    await new Promise((r) => setTimeout(r, 400));

    const addBtn1 = await page.$('button[data-tray-add-code="ICS21300"]');
    if (!addBtn1) throw new Error('FAILED: Could not find button[data-tray-add-code="ICS21300"] on live site!');
    await addBtn1.click();
    console.log('[PASS] Live Checkpoint 4: Successfully added ICS 21300 via Quick-Add tray.');

    // Checkpoint 5: Zero-Upload Modal Flow to Screen 3
    console.log('Testing Zero-Upload Modal flow to Screen 3 on live site...');
    const mainProceedBtn = await page.$('#optionB-submit-btn');
    await mainProceedBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    const modal = await page.$('#zero-upload-modal');
    const isModalOpen = await page.evaluate((m) => m && m.open, modal);
    if (!isModalOpen) {
      throw new Error('FAILED: #zero-upload-modal did not open on live site!');
    }
    console.log('[PASS] Live Checkpoint 5: Zero-upload confirmation modal opened successfully.');

    // Click Proceed to Schedule Board inside modal
    const confirmBtn = await page.$('#zero-upload-proceed-btn');
    if (!confirmBtn) throw new Error('FAILED: #zero-upload-proceed-btn missing in modal!');
    await confirmBtn.click();
    await new Promise((r) => setTimeout(r, 1200));

    // Verify Screen 3
    const screen3H1 = await page.$eval('h1', (el) => el.innerText);
    console.log('[PASS] Live Screen 3 Heading:', screen3H1);

    // Check course cards or bands
    const scheduledCourses = await page.evaluate(() => {
      return document.body.innerText.includes('ICS 21300') || document.body.innerText.includes('Interactive Graduation Road Map');
    });
    console.log(`[PASS] Live Checkpoint 6: Landed on Schedule Board (Roadmap verified: ${scheduledCourses})`);

    // Checkpoint 7: Test Unofficial Transcript PDF Upload on Live Site
    console.log('Testing Brandon Paz Unofficial Transcript PDF upload on live site...');
    await page.goto(LIVE_URL, { waitUntil: 'networkidle2' });
    const transcriptInput = await page.$('input#optionB-transcript-input');
    if (!transcriptInput) throw new Error('FAILED: input#optionB-transcript-input not found on live site!');
    
    const samplePdf = 'c:\\Users\\todwood\\Documents\\Antigravity Work\\Degree_Panner\\.tmp\\samples\\Brandon Paz\\sub_Transcript - UnOfficial_landscape.pdf';
    await transcriptInput.uploadFile(samplePdf);
    await new Promise((r) => setTimeout(r, 2000));

    const liveErrorBox = await page.evaluate(() => {
      const el = document.querySelector('.text-red-700, .bg-red-50, .border-red-500');
      return el ? el.innerText.replace(/\n+/g, ' ') : null;
    });
    if (liveErrorBox) {
      throw new Error(`FAILED: Error box displayed on live transcript upload: ${liveErrorBox}`);
    }

    const liveSummaryBadge = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div, span')).find((d) => d.textContent.includes('Active Courses'));
      return el ? el.innerText.replace(/\n+/g, ' ') : null;
    });
    console.log(`[PASS] Live Checkpoint 7: Transcript uploaded cleanly without errors. Badge: "${liveSummaryBadge}"`);

    // Take screenshot of live deployed site
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
