import fs from 'fs';
import { parseTranscriptPdf, parseAnthologySpreadsheet } from '../src/engine/transcriptParser.js';

function parseCourseTerm(c) {
  const isTransfer =
    c.state === 'TR' ||
    c.state === 'Transfer' ||
    c.grade?.startsWith('TR') ||
    c.term === 'TRANSFER_TERM' ||
    c.termInfo?.isTransfer;

  if (isTransfer && (!c.term || c.term === 'TRANSFER_TERM' || !c.termInfo?.year)) {
    return {
      termName: 'Transfer & Prior Learning',
      sortKey: 0,
      sessionName: 'Transfer Credits',
      isTransfer: true
    };
  }

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

  const seasonOrder = season === 'Spring' ? 1 : season === 'Summer' ? 2 : 3;
  const sortKey = year * 10 + seasonOrder;
  const termName = `${season} ${year}`;

  let sessionName = 'Full Semester (16-Week)';
  const sessionVal = c.termInfo?.session || '';
  if (sessionVal === 'FA-I' || sessionVal === 'SP-I' || /_I_|-I|OL11/i.test(termStr)) {
    sessionName = 'Session I (8-Week)';
  } else if (sessionVal === 'FA-II' || sessionVal === 'SP-II' || /_II_|-II|OL21/i.test(termStr)) {
    sessionName = 'Session II (8-Week)';
  } else if (season === 'Summer') {
    sessionName = 'Summer Session (8-Week)';
  }

  return {
    termName,
    sortKey,
    sessionName,
    isTransfer: Boolean(isTransfer)
  };
}

const pdfBuf = fs.readFileSync('.tmp/samples/Brandon Paz/sub_Transcript - UnOfficial_landscape.pdf');
const resPdf = await parseTranscriptPdf(pdfBuf);
const allPastPdf = [...(resPdf.transferCourses || []), ...(resPdf.completedCourses || [])];

const groups = new Map();
for (const c of allPastPdf) {
  const meta = parseCourseTerm(c);
  if (!groups.has(meta.termName)) {
    groups.set(meta.termName, { termName: meta.termName, sortKey: meta.sortKey, courses: [] });
  }
  groups.get(meta.termName).courses.push({ ...c, ...meta });
}

const sortedTerms = Array.from(groups.values()).sort((a, b) => a.sortKey - b.sortKey);
console.log('PDF Chronological Terms:');
sortedTerms.forEach(t => {
  const cr = t.courses.reduce((sum, c) => sum + (c.credits || 0), 0);
  console.log(` - ${t.termName} (${cr}cr, ${t.courses.length} courses): ${t.courses.map(c => c.code).join(', ')}`);
});

const xlsxBuf = fs.readFileSync('.tmp/samples/Brandon Paz/StudentCourseSchedules (All Results).xlsx');
const resXlsx = await parseAnthologySpreadsheet(xlsxBuf);
const allPastXlsx = [...(resXlsx.transferCourses || []), ...(resXlsx.completedCourses || [])];
const groupsXlsx = new Map();
for (const c of allPastXlsx) {
  const meta = parseCourseTerm(c);
  if (!groupsXlsx.has(meta.termName)) {
    groupsXlsx.set(meta.termName, { termName: meta.termName, sortKey: meta.sortKey, courses: [] });
  }
  groupsXlsx.get(meta.termName).courses.push({ ...c, ...meta });
}
const sortedTermsXlsx = Array.from(groupsXlsx.values()).sort((a, b) => a.sortKey - b.sortKey);
console.log('\nAnthology Chronological Terms:');
sortedTermsXlsx.forEach(t => {
  const cr = t.courses.reduce((sum, c) => sum + (c.credits || 0), 0);
  console.log(` - ${t.termName} (${cr}cr, ${t.courses.length} courses):`);
  const sessions = new Map();
  t.courses.forEach(c => {
    if (!sessions.has(c.sessionName)) sessions.set(c.sessionName, []);
    sessions.get(c.sessionName).push(c);
  });
  sessions.forEach((courses, sess) => {
    console.log(`     [${sess}]: ${courses.map(c => c.code).join(', ')}`);
  });
});
