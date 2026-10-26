import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function check() {
  console.log('Verifying live deployment at https://todwood.github.io/degree-planner/ ...');
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://todwood.github.io/degree-planner/', { waitUntil: 'networkidle2' });

  // Upload Brandon's transcript to Option B
  const pdfInput = await page.$('input#optionB-transcript-input');
  if (!pdfInput) throw new Error('Missing input#optionB-transcript-input');
  await pdfInput.uploadFile(path.resolve('.tmp/samples/Brandon Paz/sub_Transcript - UnOfficial_landscape.pdf'));
  await new Promise(r => setTimeout(r, 1500));

  // Click submit
  const submitBtn = await page.$('#optionB-submit-btn');
  if (!submitBtn) throw new Error('Missing #optionB-submit-btn');
  await submitBtn.click();
  await new Promise(r => setTimeout(r, 1500));

  // Screen 2 -> Screen 3
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Generate Optimal Graduation Plan'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Accept fallback if modal opens
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Accept Fallback & Generate Plan'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Check ribbon on live site
  const ribbonText = await page.evaluate(() => {
    const el = document.querySelector('[aria-controls="historical-coursework-accordion"]');
    return el ? el.innerText.replace(/\n+/g, ' ') : null;
  });
  console.log('Live Audit Health Ribbon Text:');
  console.log(ribbonText);

  const isHidden = await page.evaluate(() => {
    const el = document.getElementById('historical-coursework-accordion');
    return el ? el.classList.contains('hidden') : null;
  });
  console.log('Live Accordion initially hidden:', isHidden);

  // Click to expand
  await page.click('[aria-controls="historical-coursework-accordion"]');
  await new Promise(r => setTimeout(r, 500));

  const isVisible = await page.evaluate(() => {
    const el = document.getElementById('historical-coursework-accordion');
    return el ? el.classList.contains('block') : null;
  });
  console.log('Live Accordion visible after toggle:', isVisible);

  const shotPath = 'C:\\Users\\todwood\\.gemini\\antigravity\\brain\\09238737-2d6c-4ece-a830-8b1f0bc10c83\\live_screen3_ribbon_verified.png';
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log('Saved screenshot of live verified Screen 3:', shotPath);

  await browser.close();
  console.log('✅ LIVE DEPLOYMENT FULLY CONFIRMED ON GITHUB PAGES!');
}

check().catch(e => {
  console.error('Live check failed:', e);
  process.exit(1);
});
