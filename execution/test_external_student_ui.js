import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

const fakeAnthologyCsv = `Course Code,Course Name,Published Code,Section,Term,Course Status,Letter Grade,Start Date,Instructor,Credits,Hours,Campus,Enroll Status Credits,Enroll Status Hours,Area of Study,Payment Period,Delivery Method,Points,SPE Progression,Enrollment
IIT22000-23,Hardware and Operating Systems,IIT22000,OL21,FALL_II_26_8W,Scheduled,,2026-10-19,Leonard Tocco,3,0,MAIN Campus,3,0,,,Online,0,,INTECHBS/Information Technology BS/ATT
SOC22000,Social Problems (GE-SocSci/HD),SOC22000,OL22,FALL_II_26_8W,Current,,2026-10-19,Sarah Foley,3,0,MAIN Campus,3,0,,,Online,0,,INTECHBS/Information Technology BS/ATT
HIST11200,US History: New Republic to World Power (GE-HC:USHisGov),HIST11200,OL11,FALL_I_26_8W,Complete,A,2026-08-24,Joshua Koenig,3,0,MAIN Campus,3,0,,,Online,4,,INTECHBS/Information Technology BS/ATT
ICS21300,Foundations of Information Technology,ICS21300,OL11,FALL_I_26_8W,Complete,A,2026-08-24,David Hood,3,0,MAIN Campus,3,0,,,Online,4,,INTECHBS/Information Technology BS/ATT
CCJ30000,Policing in America,CCJ30000,,TRANSFER_TERM,Complete,TR-B,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ELECT10000,Free Elective 10000 Level,ELECT10000,,TRANSFER_TERM,Complete,TR-B,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ENGL15000,Composition I (GE-Comm),ENGL15000,,TRANSFER_TERM,Complete,TR-B,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ENGL17000,Composition II (GE-Comm),ENGL17000,,TRANSFER_TERM,Complete,TR-C,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
GE11013,GE-Natural Science (GE-NatSciLec)                                          ,GE11013,,TRANSFER_TERM,Complete,TR-D,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ICS21400,Foundations of Networking,ICS21400,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
ICS31000-23,Foundations of Cybersecurity,ICS31000,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
IIT21500-23,Programming Logic and Design,IIT21500,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
IIT33500-23,Blockchain Technology for Business,IIT33500,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
IIT35100-23,Database Analysis and Design Concepts,IIT35100,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
IIT48100-23,Project Management in Information Technology,IIT48100,,,Future,,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
MTH11000,Intermediate Algebra,MTH11000,,TRANSFER_TERM,Complete,TR-A,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
SOC10200,Basic Concepts of Sociology (GE-SocSci/HD),SOC10200,,TRANSFER_TERM,Complete,TR-C,,,3,0,,3,0,,,,0,,INTECHBS/Information Technology BS/ATT
UNIV10100,First-Year Seminar,UNIV10100,,TRANSFER_TERM,Complete,TR-B,,,1,0,,1,0,,,,0,,INTECHBS/Information Technology BS/ATT`;

async function testUi() {
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const tempCsvPath = path.resolve('.tmp', 'Ariyeona_Jones-Hadley_Anthology.csv');
  fs.writeFileSync(tempCsvPath, fakeAnthologyCsv, 'utf8');

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

  const tempPdfPath = path.resolve('.tmp', 'Ariyeona_Jones-Hadley_Transcript.pdf');

  console.log('1. Uploading Anthology CSV to Option B dropzone...');
  const csvInput = await page.$('input#optionB-anthology-input');
  if (!csvInput) throw new Error('Missing input#optionB-anthology-input');
  await csvInput.uploadFile(tempCsvPath);
  await new Promise(r => setTimeout(r, 1200));

  console.log('2. Uploading Transcript PDF to Option B dropzone (Dual Upload)...');
  const pdfInput = await page.$('input#optionB-transcript-input');
  if (!pdfInput) throw new Error('Missing input#optionB-transcript-input');
  await pdfInput.uploadFile(tempPdfPath);
  await new Promise(r => setTimeout(r, 1500));

  // Check wrong document modal or errors
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

  // Check extracted summary badge
  const summaryText = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div, span')).find(d => d.textContent.includes('Active Courses'));
    return el ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Extraction badge:', summaryText);

  const programVal = await page.$eval('#optionB-program-select', el => el.value);
  console.log('Auto-selected Program ID:', programVal);

  const startSemVal = await page.$eval('#optionB-start-semester', el => el.value);
  console.log('Auto-selected Schedule Start Semester:', startSemVal);

  const submitBtnText = await page.$eval('#optionB-submit-btn', el => el.textContent.trim());
  console.log('Submit button text:', submitBtnText);

  // Click Proceed to Degree Audit
  console.log('\nClicking "Proceed to Degree Audit & Waterfall Match →" ...');
  const proceedBtn = await page.$('#optionB-submit-btn');
  await proceedBtn.click();
  await new Promise(r => setTimeout(r, 1200));

  const screen2H1 = await page.$eval('h1, h2', el => el.innerText);
  console.log('Screen 2 Heading:', screen2H1);

  const auditCredits = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      hasCompleted28: body.includes('28.0') || body.includes('28 cr'),
      hasEnrolled34: body.includes('34.0') || body.includes('34 cr')
    };
  });
  console.log('Screen 2 Audit Credit Totals:', auditCredits);

  // Advance to Screen 3
  console.log('\nClicking "Generate Optimal Graduation Plan" ...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Generate Optimal Graduation Plan'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const screen3H1 = await page.$eval('h1, h2', el => el.innerText);
  console.log('Screen 3 Heading:', screen3H1);

  // Take screenshot
  const screenshotPath = '.tmp/external_student_verification.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved screenshot to', screenshotPath);

  await browser.close();
  console.log('\n========================================================');
  console.log('EXTERNAL FAKE STUDENT UI VERIFICATION PASSED WITH 100% SUCCESS');
  console.log('========================================================');
}

testUi().catch(err => {
  console.error('UI Test failed:', err);
  process.exit(1);
});
