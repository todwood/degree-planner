import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function testUpload() {
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGEERROR] ${err.toString()}`));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

  const p = path.resolve('.tmp/samples/Brandon Paz');
  const pdfA = path.join(p, 'sub_Transcript - UnOfficial_landscape.pdf');
  const pdfB = path.join(p, 'sub_UnofficialTranscript - Student Based_landscape.pdf');

  console.log('\n--- Test 1: Upload PDF A (Enrollment-Based) ---');
  // Find transcript dropzone file input in Option B
  const fileInputs = await page.$$('input[type="file"]');
  console.log(`Found ${fileInputs.length} file inputs on page.`);
  for (let i = 0; i < fileInputs.length; i++) {
    const accept = await page.evaluate(el => el.getAttribute('accept'), fileInputs[i]);
    const id = await page.evaluate(el => el.id, fileInputs[i]);
    console.log(`Input ${i}: id="${id}", accept="${accept}"`);
  }

  // Upload to Option B transcript input (accept=".pdf")
  const transcriptInput = fileInputs[fileInputs.length - 1]; // or find by accept .pdf
  await transcriptInput.uploadFile(pdfA);
  await new Promise(r => setTimeout(r, 2000));

  console.log('Console logs:');
  consoleLogs.forEach(l => console.log('  ', l));

  const wrongDocModal = await page.evaluate(() => {
    const el = document.querySelector('#wrong-document-modal');
    return el && el.open ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Wrong doc modal:', wrongDocModal);

  const currencyModal = await page.evaluate(() => {
    const el = document.querySelector('#currency-warning-dialog');
    return el && el.open ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Currency warning modal:', currencyModal);

  const errorText = await page.evaluate(() => {
    const errEl = document.querySelector('.text-red-700, .bg-red-50, .border-red-500');
    return errEl ? errEl.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Error box on page:', errorText);

  const summary = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div, span')).find(d => d.textContent.includes('Active Courses'));
    return el ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Extraction summary:', summary);

  const studentNameVal = await page.$eval('#optionB-student-name', el => el.value);
  const studentIdVal = await page.$eval('#optionB-student-id', el => el.value);
  const programVal = await page.$eval('#optionB-program-select', el => el.value);
  console.log(`Populated Student: "${studentNameVal}" | ID: "${studentIdVal}" | Program: "${programVal}"`);

  // Click Proceed to Degree Audit & Waterfall Match
  console.log('Advancing to Screen 2 (Degree Audit)...');
  const proceedBtn = await page.$('#optionB-submit-btn');
  await proceedBtn.click();
  await new Promise(r => setTimeout(r, 1200));

  const screen2Heading = await page.$eval('h1, h2', el => el.innerText);
  console.log('Screen 2 Heading:', screen2Heading);

  const auditCredits = await page.evaluate(() => {
    return {
      completed: document.body.innerText.includes('74.0') || document.body.innerText.includes('74 cr'),
      enrolled: document.body.innerText.includes('84.0') || document.body.innerText.includes('84 cr')
    };
  });
  console.log('Audit credits verified:', auditCredits);

  // Click Generate Optimal Graduation Plan
  console.log('Generating optimal graduation plan to advance to Screen 3...');
  const genBtn = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Generate Optimal Graduation Plan'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  await new Promise(r => setTimeout(r, 1000));

  const screen3Heading = await page.$eval('h1, h2', el => el.innerText);
  console.log('Screen 3 Heading:', screen3Heading);

  console.log('\n--- Test 2: Upload PDF B (Student-Based) ---');
  // Reload page to start fresh
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  const fileInputs2 = await page.$$('input[type="file"]');
  const transcriptInput2 = fileInputs2[fileInputs2.length - 1];
  await transcriptInput2.uploadFile(pdfB);
  await new Promise(r => setTimeout(r, 2000));

  const wrongDocModal2 = await page.evaluate(() => {
    const el = document.querySelector('#wrong-document-modal');
    return el && el.open ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Wrong doc modal (PDF B):', wrongDocModal2);

  const currencyModal2 = await page.evaluate(() => {
    const el = document.querySelector('#currency-warning-dialog');
    return el && el.open ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Currency warning modal (PDF B):', currencyModal2);

  const errorText2 = await page.evaluate(() => {
    const errEl = document.querySelector('.text-red-700, .bg-red-50, .border-red-500');
    return errEl ? errEl.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Error box on page (PDF B):', errorText2);

  const summary2 = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div, span')).find(d => d.textContent.includes('Active Courses'));
    return el ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Extraction summary (PDF B):', summary2);

  const studentNameVal2 = await page.$eval('#optionB-student-name', el => el.value);
  const studentIdVal2 = await page.$eval('#optionB-student-id', el => el.value);
  const programVal2 = await page.$eval('#optionB-program-select', el => el.value);
  console.log(`Populated Student (PDF B): "${studentNameVal2}" | ID: "${studentIdVal2}" | Program: "${programVal2}"`);

  await browser.close();
}

testUpload().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
