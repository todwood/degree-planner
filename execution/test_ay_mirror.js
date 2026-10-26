import fs from 'fs';
import { parseTranscriptPdf, parseAnthologySpreadsheet } from '../src/engine/transcriptParser.js';

function getHistoricalSessionTitle(c, season) {
  const sessionVal = c.termInfo?.session || '';
  const termStr = String(c.term || '');

  if (season === 'Fall') {
    if (sessionVal === 'FA-I' || /_I_|-I\b|OL11/i.test(termStr)) {
      return 'FA-I • 1st 8-Week Session';
    }
    if (sessionVal === 'FA-II' || /_II_|-II\b|OL21/i.test(termStr)) {
      return 'FA-II • 2nd 8-Week Session';
    }
    return 'Fall 16-Week • Full Semester';
  }

  if (season === 'Spring') {
    if (sessionVal === 'SP-I' || /_I_|-I\b|OL11/i.test(termStr)) {
      return 'SP-I • 1st 8-Week Session';
    }
    if (sessionVal === 'SP-II' || /_II_|-II\b|OL21/i.test(termStr)) {
      return 'SP-II • 2nd 8-Week Session';
    }
    return 'Spring 16-Week • Full Semester';
  }

  if (season === 'Summer') {
    return 'Summer Session (8-Week)';
  }

  return '16-Week Full Term';
}

const xlsxBuf = fs.readFileSync('.tmp/samples/Brandon Paz/StudentCourseSchedules (All Results).xlsx');
const resXlsx = await parseAnthologySpreadsheet(xlsxBuf);

const pastTransfers = resXlsx.transferCourses || [];
const pastCompleted = resXlsx.completedCourses || [];

console.log('Transfers:', pastTransfers.length);
console.log('Completed:', pastCompleted.length);

const ayMap = new Map();
for (const c of pastCompleted) {
  let year = c.termInfo?.year;
  let season = c.termInfo?.season;
  const termStr = String(c.term || '');

  if (!year || !season) {
    const yrMatch = termStr.match(/20(\d{2})/) || termStr.match(/[_\s](\d{2})(?:[_\s]|$)/);
    if (yrMatch) {
      year = parseInt(yrMatch[1], 10) + 2000;
    }
    if (/fall|fa/i.test(termStr)) season = 'Fall';
    else if (/spring|sp/i.test(termStr)) season = 'Spring';
    else if (/summer|su/i.test(termStr)) season = 'Summer';
  }
  year = year || 2024;
  season = season || 'Fall';

  const ayStartYear = season === 'Fall' ? year : year - 1;
  const ayKey = `AY-${ayStartYear}`;

  if (!ayMap.has(ayKey)) {
    ayMap.set(ayKey, {
      key: ayKey,
      startYear: ayStartYear,
      label: `ACADEMIC YEAR ${ayStartYear}–${ayStartYear + 1}`,
      fall: null,
      spring: null,
      summer: null,
      totalCredits: 0
    });
  }

  const ay = ayMap.get(ayKey);
  ay.totalCredits += Number(c.credits) || 0;

  const semProp = season.toLowerCase(); // 'fall', 'spring', 'summer'
  if (!ay[semProp]) {
    ay[semProp] = {
      termName: `${season} ${year}`,
      season,
      year,
      totalCredits: 0,
      courses: [],
      sessions: new Map()
    };
  }

  const sem = ay[semProp];
  sem.totalCredits += Number(c.credits) || 0;
  const sessionTitle = getHistoricalSessionTitle(c, season);
  if (!sem.sessions.has(sessionTitle)) {
    sem.sessions.set(sessionTitle, []);
  }
  sem.sessions.get(sessionTitle).push(c);
  sem.courses.push(c);
}

const sortedAys = Array.from(ayMap.values()).sort((a, b) => a.startYear - b.startYear);
sortedAys.forEach(ay => {
  console.log(`\n=== ■ ${ay.label} (${ay.totalCredits} cr Total) ===`);
  ['fall', 'spring', 'summer'].forEach(s => {
    const sem = ay[s];
    if (!sem) return;
    console.log(`  [${sem.termName}] ${sem.totalCredits}cr • ${sem.courses.length} courses:`);
    sem.sessions.forEach((courses, sessTitle) => {
      console.log(`     > ${sessTitle} (${courses.length}): ${courses.map(c => c.code).join(', ')}`);
    });
  });
});
