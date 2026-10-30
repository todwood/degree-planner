#!/usr/bin/env node
/**
 * execution/scrape_common_course_schedule.js
 *
 * Scrapes Lindenwood University's Common Course Schedule (Self-Service)
 * across target terms (Fall 26, Spring 27, Summer 27).
 * Extracts section details, modalities, session bands, and titles with GE tags.
 */

import { chromium } from 'playwright';

export const SELF_SERVICE_URL = 'https://selfserve.lindenwood.edu/CMCPortal/Common/CourseSchedule.aspx';

export const DEFAULT_TERM_CONFIGS = {
  '908': { termId: '908', termText: 'Fall 26', fullName: '2026 Fall', yearPrefix: '26', season: 'Fall', seasonCode: 'FA' },
  '909': { termId: '909', termText: 'Spring 27', fullName: '2027 Spring', yearPrefix: '27', season: 'Spring', seasonCode: 'SP' },
  '910': { termId: '910', termText: 'Summer 27', fullName: '2027 Summer', yearPrefix: '27', season: 'Summer', seasonCode: 'SU' }
};

export function normalizeCode(raw) {
  if (!raw) return '';
  const cleaned = raw.replace(/[#\n\r\t]+/g, ' ').trim();
  const m = cleaned.match(/\b([A-Z]{2,4})\s*(\d{5}(?:-\d{5})?)\b/i);
  if (m) {
    return `${m[1].toUpperCase()} ${m[2]}`;
  }
  return cleaned.replace(/\s+/, ' ').toUpperCase();
}

export function parseDates(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split(/\s+to\s+/i);
  if (parts.length === 2) {
    const start = new Date(parts[0].trim());
    const end = new Date(parts[1].trim());
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const diffWeeks = Math.round(diffDays / 7);
      return { start, end, diffDays, diffWeeks };
    }
  }
  return null;
}

export function parseIsEvening(scheduleStr) {
  if (!scheduleStr) return false;
  const m = scheduleStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return false;
  let hour = parseInt(m[1], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour >= 17; // 05:00 PM or later
}

export function mapModality(deliveryMethod) {
  const d = (deliveryMethod || '').trim().toLowerCase();
  if (d.includes('online') || d.includes('distance')) {
    return { name: 'Online', tag: 'OL' };
  } else if (d.includes('hybrid') || d.includes('hyflex') || d.includes('blended') || d.includes('semi-hybrid')) {
    return { name: 'Hybrid', tag: 'HY' };
  } else {
    return { name: 'On-Ground', tag: 'OG' };
  }
}

export function mapSessionBandAndTag(termInfo, dateInfo, modalityTag) {
  const { seasonCode, yearPrefix } = termInfo;
  if (!dateInfo) {
    return {
      sessionBand: '16wk',
      offering: `${seasonCode}-16wk`,
      sectionTag: `${yearPrefix}${seasonCode}-16wk_${modalityTag}`
    };
  }

  const { start, diffWeeks } = dateInfo;
  const startMonth = start.getMonth(); // 0=Jan, 7=Aug, 8=Sep, 9=Oct

  if (termInfo.season === 'Fall') {
    if (diffWeeks >= 12) {
      return {
        sessionBand: '16wk',
        offering: 'FA-16wk',
        sectionTag: `${yearPrefix}FA-16wk_${modalityTag}`
      };
    } else if (startMonth >= 9) {
      return {
        sessionBand: 'FA-II',
        offering: 'FA-II',
        sectionTag: `${yearPrefix}FA-II_${modalityTag}`
      };
    } else {
      return {
        sessionBand: 'FA-I',
        offering: 'FA-I',
        sectionTag: `${yearPrefix}FA-I_${modalityTag}`
      };
    }
  } else if (termInfo.season === 'Spring') {
    if (diffWeeks >= 12) {
      return {
        sessionBand: '16wk',
        offering: 'SP-16wk',
        sectionTag: `${yearPrefix}SP-16wk_${modalityTag}`
      };
    } else if (startMonth <= 1) {
      return {
        sessionBand: 'SP-I',
        offering: 'SP-I',
        sectionTag: `${yearPrefix}SP-I_${modalityTag}`
      };
    } else {
      return {
        sessionBand: 'SP-II',
        offering: 'SP-II',
        sectionTag: `${yearPrefix}SP-II_${modalityTag}`
      };
    }
  } else if (termInfo.season === 'Summer') {
    if (diffWeeks <= 3) {
      return {
        sessionBand: '3wk',
        offering: 'SU-3wk',
        sectionTag: `${yearPrefix}SU-3wk_${modalityTag}`
      };
    } else if (startMonth === 4 || (startMonth === 5 && start.getDate() <= 15)) {
      return {
        sessionBand: '6wk1',
        offering: 'SU-6wk1',
        sectionTag: `${yearPrefix}SU-6wk1_${modalityTag}`
      };
    } else if (startMonth === 5 || startMonth === 6) {
      return {
        sessionBand: '6wk2',
        offering: 'SU-6wk2',
        sectionTag: `${yearPrefix}SU-6wk2_${modalityTag}`
      };
    } else if (diffWeeks >= 9) {
      return {
        sessionBand: '9wk',
        offering: 'SU-9wk',
        sectionTag: `${yearPrefix}SU-9wk_${modalityTag}`
      };
    } else {
      return {
        sessionBand: '6wk1',
        offering: 'SU-6wk1',
        sectionTag: `${yearPrefix}SU-6wk1_${modalityTag}`
      };
    }
  }

  return {
    sessionBand: '16wk',
    offering: `${seasonCode}-16wk`,
    sectionTag: `${yearPrefix}${seasonCode}-16wk_${modalityTag}`
  };
}

/**
 * Scrapes the Common Course Schedule portal across active terms using Playwright.
 * @param {import('playwright').Page} page
 * @param {Object} termConfigs
 * @returns {Promise<{ scheduleIndex: Object, scheduleTitleMap: Object, allDropdownTerms: Array, totalSections: number }>}
 */
export async function scrapeCommonCourseSchedule(page, termConfigs = DEFAULT_TERM_CONFIGS) {
  console.log('[Self-Service] Navigating to Common Course Schedule portal...');
  await page.goto(SELF_SERVICE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const allDropdownTerms = await page.$$eval('#_ctl0_PlaceHolderMain__ctl0_cbTerm option', opts => opts.map(o => ({
    value: o.value,
    text: o.textContent.trim()
  })));

  const activeTerms = [];
  for (const t of allDropdownTerms) {
    if (termConfigs[t.value]) {
      activeTerms.push(termConfigs[t.value]);
    }
  }

  const scheduleIndex = {};
  const scheduleTitleMap = {};
  let totalSections = 0;

  for (const term of activeTerms) {
    console.log(`Querying schedule for ${term.fullName} [${term.termText}]...`);
    const tStart = Date.now();

    await page.selectOption('#_ctl0_PlaceHolderMain__ctl0_cbTerm', term.termId);
    await page.click('#_ctl0_PlaceHolderMain__ctl0_rbOC');
    await page.fill('#_ctl0_PlaceHolderMain__ctl0_txtCode', '');
    await page.fill('#_ctl0_PlaceHolderMain__ctl0_txtKeyword', '');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {}),
      page.click('#_ctl0_PlaceHolderMain__ctl0_btnSearch')
    ]);

    await page.waitForSelector('#CourseList', { timeout: 60000 });
    await page.waitForTimeout(2000);

    const rawRows = await page.evaluate(() => {
      if (window.jQuery && window.jQuery.fn.DataTable && window.jQuery('#CourseList').length) {
        const dt = window.jQuery('#CourseList').DataTable();
        const rows = dt.rows().data().toArray();
        const div = document.createElement('div');
        const clean = h => { div.innerHTML = h; return div.innerText.trim(); };
        return rows.map(r => ({
          rawCourse: clean(r[0]),
          title: clean(r[1]),
          section: clean(r[2]),
          dates: clean(r[3]),
          credits: clean(r[4]),
          schedule: clean(r[5]),
          instructor: clean(r[6]),
          deliveryMethod: clean(r[7]),
          attribute: clean(r[8])
        }));
      }
      return [];
    });

    const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
    console.log(`  -> Retrieved ${rawRows.length} sections for ${term.fullName} in ${elapsed}s.`);
    totalSections += rawRows.length;

    for (const row of rawRows) {
      const normCode = normalizeCode(row.rawCourse);
      if (!normCode) continue;

      // Capture official title from schedule (preserves (GE-Math), (GE:SocSci), etc.)
      if (row.title && row.title.trim()) {
        const rawTitle = row.title.trim();
        // If row.title contains a GE marker, prioritize it
        if (/\(GE[-:][^)]+\)/i.test(rawTitle)) {
          scheduleTitleMap[normCode] = rawTitle;
        } else if (!scheduleTitleMap[normCode]) {
          scheduleTitleMap[normCode] = rawTitle;
        }
      }

      const dateInfo = parseDates(row.dates);
      const modality = mapModality(row.deliveryMethod);
      const is_evening = parseIsEvening(row.schedule);
      const { sessionBand, offering, sectionTag } = mapSessionBandAndTag(term, dateInfo, modality.tag);

      const secObj = {
        term: term.fullName,
        termYearPrefix: term.yearPrefix,
        season: term.season,
        seasonCode: term.seasonCode,
        sectionCode: row.section,
        dates: row.dates,
        dateInfo,
        schedule: row.schedule,
        is_evening,
        modalityName: modality.name,
        modalityTag: modality.tag,
        sessionBand,
        offering,
        sectionTag
      };

      if (!scheduleIndex[normCode]) {
        scheduleIndex[normCode] = [];
      }
      scheduleIndex[normCode].push(secObj);
    }
  }

  return {
    scheduleIndex,
    scheduleTitleMap,
    allDropdownTerms,
    totalSections
  };
}
