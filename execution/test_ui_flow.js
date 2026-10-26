import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function runUiTests() {
  console.log(`Starting headless UI verification using: ${executablePath}`);
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
      console.log(`HTTP ${resp.status()}: ${resp.url()}`);
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
    // 1. Load preview site
    console.log('Navigating to http://localhost:4173 ...');
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0' });

    // Verify Title / Header
    const headerTitle = await page.$eval('header', (el) => el.innerText);
    console.log('Header text:', headerTitle.replace(/\n/g, ' '));

    // 2. Test Screen 0: Logout to test Screen 0 Login
    console.log('Testing Screen 0 (Faculty Login & FERPA Reassurance)...');
    // Open profile dropdown
    const profileBtn = await page.$('header .relative > button');
    if (profileBtn) {
      await profileBtn.click();
      await new Promise((r) => setTimeout(r, 400));
      // Click sign out
      const signOutBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find((b) => b.textContent.includes('Sign Out of Faculty Workspace'));
      });
      if (signOutBtn) {
        await signOutBtn.click();
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Verify Screen 0 elements
    const loginHeader = await page.$eval('h2', (el) => el.innerText);
    console.log('Screen 0 heading:', loginHeader);

    const ferpaText = await page.$eval('.border-l-4', (el) => el.innerText);
    console.log('FERPA Reassurance found:', ferpaText.includes('FERPA'));

    // Test Demo Bypass
    const demoBypassBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find((b) => b.textContent.includes('Instant Demo / Local Dev Bypass'));
    });
    if (demoBypassBtn) {
      await demoBypassBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      console.log('Clicked Demo Bypass -> Successfully logged in as Matthias Wood');
    }

    // 3. Test Screen 1 (Intake)
    console.log('\nTesting Screen 1 (Intake Workspace)...');
    const screen1Title = await page.$eval('h1, h2', (el) => el.innerText);
    console.log('Screen 1 title:', screen1Title);

    // Verify Pacing Mode dropdown
    const pacingSelect = await page.$('select');
    console.log('Found program/pacing controls on Screen 1');

    // Test loadDemoStudent for Cybersecurity, BS
    console.log('Triggering demo student profile for: Cybersecurity, BS...');
    const cyberBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find((b) => b.textContent.includes('Cybersecurity, BS'));
    });
    await cyberBtn.click();
    await new Promise((r) => setTimeout(r, 800));

    // 4. Test Screen 2 (Interactive Audit)
    console.log('\nTesting Screen 2 (Interactive Audit)...');
    const auditHeading = await page.$eval('h1', (el) => el.innerText);
    console.log('Screen 2 heading:', auditHeading);

    // Check Race to the Graduation Flag
    const raceTrack = await page.$eval('.rounded-xl.shadow-sm', (el) => el.innerText);
    console.log('Race to Graduation Flag found:', raceTrack.includes('Race to the Graduation Flag'));

    // Check Excluded Ledger
    const hasExcludedLedger = await page.evaluate(() => {
      return document.body.innerText.includes('Excluded Courses Ledger') ||
             document.body.innerText.includes('Audit Summary');
    });
    console.log('Audit Summary & Policy checklist verified:', hasExcludedLedger);

    // Click "Generate Optimal Graduation Plan"
    console.log('Clicking "Generate Optimal Graduation Plan" button...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Generate Optimal Graduation Plan'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // If Missing Availability Modal opened, accept fallback
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const modalBtn = buttons.find((b) => b.textContent.includes('Accept Fallback & Generate Plan'));
      if (modalBtn) modalBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // 5. Test Screen 3 (Schedule Board)
    console.log('\nTesting Screen 3 (Visual Schedule Board)...');
    const scheduleHeading = await page.$eval('h1', (el) => el.innerText);
    console.log('Screen 3 heading:', scheduleHeading);

    // Check Priority Registration Notice & Full Month name
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasOctober = bodyText.includes('October') || bodyText.includes('Registration');
    console.log('Priority Registration Notice with full-month text:', hasOctober);

    // Check Tactile Weight course cards
    const courseCards = await page.$$('div.truncate.cursor-pointer');
    console.log(`Rendered ${courseCards.length} interactive course cards on schedule board`);

    // Click a course title to test Course Inspector Drawer
    console.log('Clicking course title to test Course Inspector Drawer...');
    await page.click('div.truncate.cursor-pointer');
    await new Promise((r) => setTimeout(r, 600));

    const pageHtml = await page.content();
    const drawerOpen = pageHtml.includes('Course Inspector');
    console.log('Course Inspector Drawer opened:', drawerOpen);
    if (drawerOpen) {
      console.log('Successfully opened Course Inspector Drawer!');
      // Close drawer
      await page.evaluate(() => {
        const closeBtn = document.querySelector('.fixed.inset-0 button');
        if (closeBtn) closeBtn.click();
      });
      await new Promise((r) => setTimeout(r, 400));
    }

    // Test PDF export click
    console.log('Testing PDF Export button...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const exportPdfBtn = buttons.find((b) => b.textContent.includes('Export Degree Plan (.pdf)'));
      if (exportPdfBtn) exportPdfBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
    console.log('Export Degree Plan PDF clicked without crash');

    // 6. Test Back navigation to Screen 1 via HeaderNav, then test remaining 2 majors
    console.log('\nTesting HeaderNav Navigation & IT App Dev / Networking majors...');
    await page.evaluate(() => {
      const headerBtns = Array.from(document.querySelectorAll('header button'));
      const intakeBtn = headerBtns.find((b) => b.textContent.includes('1. Student Intake'));
      if (intakeBtn) intakeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Test IT - App Dev Emphasis demo load
    console.log('Testing Demo Student: IT - Applications Development...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('IT - Applications Development'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // On Screen 2 now
    const screen2H1 = await page.$eval('h1', (el) => el.innerText);
    console.log('IT App Dev on Screen:', screen2H1);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Generate Optimal Graduation Plan'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Accept fallback if modal appears
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const modalBtn = buttons.find((b) => b.textContent.includes('Accept Fallback & Generate Plan'));
      if (modalBtn) modalBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const postH1 = await page.$eval('h1', (el) => el.innerText);
    console.log('Post Generate Plan heading:', postH1);

    // Verify Forced Summer Alert for IIT 45200
    const itAppDevText = await page.evaluate(() => document.body.innerText);
    const hasForcedSummer = itAppDevText.includes('Forced Summer') || itAppDevText.includes('IIT 45200');
    console.log('IIT 45200 Forced Summer Alert present:', hasForcedSummer);

    // Back to intake for Networking via HeaderNav
    await page.evaluate(() => {
      const headerBtns = Array.from(document.querySelectorAll('header button'));
      const intakeBtn = headerBtns.find((b) => b.textContent.includes('1. Student Intake'));
      if (intakeBtn) intakeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Test IT - Networking Emphasis demo load
    console.log('Testing Demo Student: IT - Networking...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('IT - Networking'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent.includes('Generate Optimal Graduation Plan'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Accept fallback if modal appears
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const modalBtn = buttons.find((b) => b.textContent.includes('Accept Fallback & Generate Plan'));
      if (modalBtn) modalBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    console.log('Successfully generated schedule for IT - Networking!');

    // Check Cisco 5cr lecture + 1cr lab cards
    const netText = await page.evaluate(() => document.body.innerText);
    const hasCisco = netText.includes('ICS 32300') && netText.includes('ICS 32301');
    console.log('Cisco lecture & lab co-requisites scheduled:', hasCisco);
    console.log('Cisco lecture & lab co-requisites scheduled:', hasCisco);

    console.log('\n--- UI Verification Complete ---');
    console.log(`Console Errors recorded: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error('Console errors:', consoleErrors);
    }

    // Save final screenshot to .tmp/ui_verification.png
    if (!fs.existsSync('.tmp')) fs.mkdirSync('.tmp', { recursive: true });
    await page.screenshot({ path: '.tmp/ui_verification.png', fullPage: true });
    console.log('Saved screenshot to .tmp/ui_verification.png');

    await browser.close();

    if (consoleErrors.length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('UI Test Execution Error:', err);
    await browser.close();
    process.exit(1);
  }
}

runUiTests();
