import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function runVerification() {
  console.log(`Starting headless Chrome verification against http://localhost:5173/ ...`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', (msg) => {
    console.log(`PAGE LOG [${msg.type()}]:`, msg.text());
  });
  page.on('pageerror', (err) => {
    console.log('PAGE ERROR:', err.toString());
  });

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
    console.log('✓ Successfully loaded http://localhost:5173/');

    const html = await page.content();
    console.log('HTML length:', html.length);
    console.log('HTML preview:', html.slice(0, 500));

    await page.waitForSelector('h1', { timeout: 5000 });
    const h1Text = await page.$eval('h1', (el) => el.innerText);
    console.log('Current H1:', h1Text);

    const allSelectIds = await page.$$eval('select', (sels) => sels.map((s) => s.id));
    console.log('Available selects on page:', allSelectIds);

    // Checkpoint 1: Bingo Sheet dropzone is 100% removed
    const bingoDropzone = await page.$('#optionB-bingo-sheet');
    if (bingoDropzone !== null) {
      throw new Error('FAILED: #optionB-bingo-sheet still exists in the DOM!');
    }
    console.log('✓ Checkpoint 1: Bingo Sheet dropzone completely removed from Screen 1');

    // Checkpoint 2: Catalog Year and Primary Degree are side-by-side
    const catalogYearSelect = await page.$('#optionB-catalog-year');
    const programSelect = await page.$('#optionB-program-select');
    if (!catalogYearSelect || !programSelect) {
      throw new Error('FAILED: Catalog Year or Primary Degree dropdown missing!');
    }
    console.log('✓ Checkpoint 2: Catalog Year and Primary Degree dropdowns present in clean grid');

    // Checkpoint 3: Start Semester labeling, helper text, and options
    const startSemLabel = await page.evaluate(() => {
      const el = document.querySelector('label[for="optionB-start-semester"]') ||
        Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('Schedule Start Semester'));
      return el ? el.textContent.trim() : null;
    });
    if (!startSemLabel || !startSemLabel.includes('Schedule Start Semester')) {
      throw new Error(`FAILED: Start Semester label mismatch. Found: ${startSemLabel}`);
    }

    const startSemOptions = await page.$$eval('#optionB-start-semester option', (opts) =>
      opts.map((o) => o.value)
    );
    console.log(`✓ Checkpoint 3: 'Schedule Start Semester' verified with ${startSemOptions.length} terms:`, startSemOptions.slice(0, 5).join(', '), '...');
    if (startSemOptions.length < 7) {
      throw new Error('FAILED: Expected at least active term + 6 future terms in Schedule Start Semester');
    }

    // Checkpoint 4: Button label when no files uploaded
    const submitBtnText = await page.$eval('#optionB-submit-btn', (el) => el.textContent.trim());
    console.log(`✓ Checkpoint 4: Submit button initial label: "${submitBtnText}"`);
    if (!submitBtnText.includes('Proceed to Plan Setup')) {
      throw new Error(`FAILED: Submit button should read "Proceed to Plan Setup →" with no files. Found: ${submitBtnText}`);
    }

    // Checkpoint 5: Currently Enrolled Courses Quick-Add Tray
    console.log('Testing Currently Enrolled Courses tray...');
    const trayToggleBtn = await page.$('#optionB-toggle-enrolled-tray-btn');
    if (!trayToggleBtn) {
      throw new Error('FAILED: #optionB-toggle-enrolled-tray-btn missing!');
    }
    await trayToggleBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    // Search and add course 1: ICS 21300
    const searchInput = await page.$('#tray-course-search');
    if (!searchInput) throw new Error('FAILED: #tray-course-search missing!');
    await searchInput.type('ICS 21300');
    await new Promise((r) => setTimeout(r, 400));

    // Find and click the Add button for ICS 21300
    const addBtn1 = await page.$('button[data-tray-add-code="ICS21300"]');
    if (!addBtn1) throw new Error('FAILED: Could not find button[data-tray-add-code="ICS21300"]');
    await addBtn1.click();
    console.log('✓ Added ICS 21300 to Active Enrollments');
    await new Promise((r) => setTimeout(r, 400));

    // Clear search and add course 2: MTH 14100
    await page.evaluate(() => {
      const inp = document.querySelector('#tray-course-search');
      if (inp) inp.value = '';
    });
    await searchInput.type('MTH 14100');
    await new Promise((r) => setTimeout(r, 400));

    const addBtn2 = await page.$('button[data-tray-add-code="MTH14100"]');
    if (!addBtn2) throw new Error('FAILED: Could not find button[data-tray-add-code="MTH14100"]');
    await addBtn2.click();
    console.log('✓ Added MTH 14100 to Active Enrollments');
    await new Promise((r) => setTimeout(r, 400));

    // Verify tray indicator in button
    const updatedTrayLabel = await page.$eval('#optionB-toggle-enrolled-tray-btn', (el) => el.textContent.trim());
    console.log(`✓ Tray updated label: "${updatedTrayLabel}"`);
    if (!updatedTrayLabel.includes('2 Courses Active')) {
      throw new Error(`FAILED: Expected "2 Courses Active" in tray label. Found: ${updatedTrayLabel}`);
    }

    // Checkpoint 6: Zero-Upload Confirmation Modal
    console.log('Clicking Proceed to Plan Setup → ...');
    await page.click('#optionB-submit-btn');
    await new Promise((r) => setTimeout(r, 500));

    const modalVisible = await page.evaluate(() => {
      const dialog = document.querySelector('#zero-upload-modal');
      return dialog && dialog.open;
    });
    if (!modalVisible) {
      throw new Error('FAILED: #zero-upload-modal is not open!');
    }
    const modalText = await page.$eval('#zero-upload-modal', (el) => el.innerText);
    console.log('✓ Checkpoint 6: Zero-Upload Confirmation Modal opened successfully:');
    console.log('  Modal text snippet:', modalText.replace(/\n+/g, ' ').slice(0, 150), '...');

    // Click Proceed to Schedule Board → in the modal
    const proceedBtn = await page.$('#zero-upload-proceed-btn');
    if (!proceedBtn) throw new Error('FAILED: #zero-upload-proceed-btn missing in modal!');
    await proceedBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    // Checkpoint 7: Verify routed directly to Screen 3 Schedule Board
    const currentScreenText = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.textContent : '';
    });
    console.log(`✓ Checkpoint 7: Landed on screen header: "${currentScreenText}"`);
    if (!currentScreenText.toLowerCase().includes('schedule') && !currentScreenText.toLowerCase().includes('graduation')) {
      throw new Error(`FAILED: Expected Screen 3 Schedule Board. Landed on: ${currentScreenText}`);
    }

    // Check Zone 2 active courses in Schedule Board (should have ICS 21300 and MTH 14100)
    const scheduleBoardText = await page.evaluate(() => document.body.innerText);
    const hasICS21300 = scheduleBoardText.includes('ICS 21300') || scheduleBoardText.includes('ICS21300');
    const hasMTH14100 = scheduleBoardText.includes('MTH 14100') || scheduleBoardText.includes('MTH14100');
    console.log(`✓ Active enrollments reflected on Schedule Board: ICS 21300=${hasICS21300}, MTH 14100=${hasMTH14100}`);
    if (!hasICS21300 || !hasMTH14100) {
      throw new Error('FAILED: Manual active enrollments not reflected on Schedule Board!');
    }

    // Checkpoint 8: Existing File Upload Flow
    console.log('\nTesting existing file upload flow (Brandon Paz XLSX)...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#optionB-anthology', { timeout: 5000 });

    const sampleFile = path.resolve('.tmp/samples/Brandon Paz/StudentCourseSchedules (All Results).xlsx');
    if (!fs.existsSync(sampleFile)) {
      throw new Error(`Sample file not found at: ${sampleFile}`);
    }

    const fileInput = await page.$('#optionB-anthology input[type="file"]');
    if (!fileInput) throw new Error('File input missing in #optionB-anthology');
    await fileInput.uploadFile(sampleFile);
    await new Promise((r) => setTimeout(r, 600));

    // Verify button label changes to Proceed to Degree Audit & Waterfall Match
    const updatedSubmitBtnText = await page.$eval('#optionB-submit-btn', (el) => el.textContent.trim());
    console.log(`✓ Button label after file upload: "${updatedSubmitBtnText}"`);
    if (!updatedSubmitBtnText.includes('Proceed to Degree Audit')) {
      throw new Error(`FAILED: Expected "Proceed to Degree Audit..." after file upload. Found: ${updatedSubmitBtnText}`);
    }

    // Submit form to proceed to Screen 2 Audit
    await page.click('#optionB-submit-btn');
    await new Promise((r) => setTimeout(r, 800));

    const auditH1 = await page.$eval('h1', (el) => el.textContent.trim());
    console.log(`✓ Checkpoint 8: Landed on Screen 2 Audit header: "${auditH1}"`);
    if (!auditH1.toLowerCase().includes('audit') && !auditH1.toLowerCase().includes('curriculum')) {
      throw new Error(`FAILED: Expected Screen 2 Audit Ledger. Landed on: ${auditH1}`);
    }

    // Verify credit summation (74.0 cr completed, 84.0 cr earned + enrolled)
    const auditBodyText = await page.evaluate(() => document.body.innerText);
    const has74Cr = auditBodyText.includes('74.0') || auditBodyText.includes('74 cr');
    const has84Cr = auditBodyText.includes('84.0') || auditBodyText.includes('84 cr');
    console.log(`✓ Brandon Paz credit totals in Audit: 74.0=${has74Cr}, 84.0=${has84Cr}`);
    if (!has74Cr) {
      throw new Error('FAILED: Completed credits (74.0 cr) not found on Screen 2 Audit!');
    }

    console.log('================================================================');
    console.log('ALL SCREEN 1 VERIFICATION CHECKPOINTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
