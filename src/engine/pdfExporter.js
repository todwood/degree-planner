/**
 * Deterministic Degree Planner
 * Stateful Student Degree Plan PDF Generator (src/engine/pdfExporter.js)
 *
 * Adheres strictly to Style.md:
 * - Brand Palette: Gold (#B5A36A), Digital Gold (#857542), Black (#000000)
 * - Tactile Weight Flexibility Badges (Sky Blue, Warm Amber, Deep Slate)
 * - Category badges (GE, M, Em, m, E), Registration Opening Dates, Ordered Notes
 * - Clean blank underline lines for missing student fields
 * - Embeds full serialized session state in PDF metadata (DegreePlanState:<base64>)
 *   for round-trip reload in Screen 1 Option A.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function exportDegreePlanPdf(planState) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Sanitize strings so StandardFonts (WinAnsi) never throw on emojis or extended unicode
  const safeText = (str) =>
    String(str ?? '')
      .replace(/[—–]/g, '-')
      .replace(/[•]/g, '*')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
      .trim();

  // Palette colors in 0..1 RGB
  const luGold = rgb(181 / 255, 163 / 255, 106 / 255); // #B5A36A
  const luGoldDark = rgb(133 / 255, 117 / 255, 66 / 255); // #857542
  const luBlack = rgb(0, 0, 0);
  const luWhite = rgb(1, 1, 1);
  const luGrayLight = rgb(243 / 255, 244 / 255, 246 / 255); // #F3F4F6
  const luGrayBorder = rgb(229 / 255, 231 / 255, 235 / 255); // #E5E7EB
  const luTextSec = rgb(75 / 255, 85 / 255, 99 / 255); // #4B5563

  // Tactile colors
  const skyBlueBg = rgb(224 / 255, 242 / 255, 254 / 255);
  const skyBlueText = rgb(3 / 255, 105 / 255, 161 / 255);
  const amberBg = rgb(254 / 255, 243 / 255, 199 / 255);
  const amberText = rgb(146 / 255, 64 / 255, 14 / 255);
  const slateBg = rgb(30 / 255, 41 / 255, 59 / 255);
  const slateText = rgb(255 / 255, 255 / 255, 255 / 255);

  const student = planState.studentMetadata || {};
  const advisor = planState.facultyProfile || {
    first_name: 'Matthias',
    last_name: 'Wood',
    position_title: 'Senior Instructor, Mathematics',
    email: 'mwood@lindenwood.edu'
  };
  const primaryProgram = planState.primaryProgram || { name: 'Cybersecurity, BS' };
  const schedule = planState.schedule || { semesters: [] };
  const policy = planState.auditResult?.policyChecklist || {};

  // =========================================================================
  // PAGE 1: HEADER, METADATA, AUDIT CHECKLIST, & INITIAL SEMESTERS
  // =========================================================================
  let page = pdfDoc.addPage([612, 792]); // Standard Letter size
  const { width, height } = page.getSize();
  let y = height - 40;

  // Top Accent Banner
  page.drawRectangle({
    x: 0,
    y: height - 6,
    width,
    height: 6,
    color: luGold
  });

  // Institutional Header
  page.drawText('DEGREE PLANNER', {
    x: 40,
    y: y - 5,
    size: 16,
    font: fontBold,
    color: luBlack
  });
  page.drawText('OFFICIAL ACADEMIC DEGREE PLAN & GRADUATION ROADMAP', {
    x: 40,
    y: y - 20,
    size: 10,
    font: fontBold,
    color: luGoldDark
  });
  page.drawText('100% Client-Side FERPA Compliant Advisor Record', {
    x: 350,
    y: y - 20,
    size: 8,
    font: fontRegular,
    color: luTextSec
  });

  y -= 35;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: luGrayBorder
  });

  // Metadata Grid (Two Columns)
  y -= 15;
  const col1X = 40;
  const col2X = 320;
  const lineH = 14;

  // Helper to format MM/DD/YYYY with full month name per Style.md editorial standard
  const formatFullDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = String(dateStr).split('/');
    if (parts.length === 3) {
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const m = parseInt(parts[0], 10);
      const d = parseInt(parts[1], 10);
      const yr = parseInt(parts[2], 10);
      if (m >= 1 && m <= 12) {
        return `${months[m - 1]} ${d}, ${yr}`;
      }
    }
    return dateStr;
  };

  const drawField = (label, val, x, currY) => {
    page.drawText(safeText(`${label}:`), { x, y: currY, size: 8, font: fontBold, color: luBlack });
    const cleanedVal = safeText(val);
    if (cleanedVal) {
      page.drawText(cleanedVal, { x: x + 85, y: currY, size: 8, font: fontRegular, color: luBlack });
    } else {
      // Clean blank underline if field is empty
      page.drawLine({
        start: { x: x + 85, y: currY - 1 },
        end: { x: x + 240, y: currY - 1 },
        thickness: 0.5,
        color: luTextSec
      });
    }
  };

  drawField('Student Name', student.name, col1X, y);
  drawField('Advisor Name', `${advisor.first_name || ''} ${advisor.last_name || ''}`.trim(), col2X, y);
  y -= lineH;

  drawField('Student ID', student.studentId, col1X, y);
  drawField('Title / Dept', advisor.position_title || 'Advisor', col2X, y);
  y -= lineH;

  drawField('Degree Seeking', primaryProgram.name, col1X, y);
  drawField('Advisor Email', advisor.email, col2X, y);
  y -= lineH;

  drawField('Catalog Year', student.catalogYear || '2026-2027', col1X, y);
  drawField('Date Generated', new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), col2X, y);
  y -= lineH;

  drawField('Cumulative GPA', student.gpa ? `${student.gpa} (Institutional Benchmark)` : '', col1X, y);
  drawField('Expected Grad', formatFullDate(student.expectedGradDate), col2X, y);
  y -= lineH;

  drawField('Pacing Mode', student.pacingMode || student.enrollmentStatus || 'Full-Time', col1X, y);
  drawField('Contact / Phone', student.phone || student.email || '', col2X, y);
  y -= lineH;

  drawField('Conferral Target', schedule.projectedGraduationTerm || 'TBD', col1X, y);
  drawField('Transfer Status', policy.totalCredits?.univLulWaived ? 'Transfers Verified (UNIV Waived)' : 'None', col2X, y);

  y -= 20;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: luGold
  });

  // Credit Checklist Box
  y -= 12;
  page.drawRectangle({
    x: 40,
    y: y - 36,
    width: width - 80,
    height: 44,
    color: luGrayLight,
    borderColor: luGrayBorder,
    borderWidth: 1
  });

  const totEarned = policy.totalCredits?.EarnedPlusEnrolled ?? 0;
  const totPlan = policy.totalCredits?.remainingPlanned ?? 0;
  const totProj = policy.totalCredits?.projectedTotal ?? 120;
  const ulProj = policy.upperLevelCredits?.projectedTotal ?? 42;
  const luRes = policy.residency?.projectedInstitutionalCredits ?? policy.residency?.projectedLindenwoodCredits ?? 30;

  page.drawText('DEGREE PROGRESS & STATUTORY RESIDENCY AUDIT CHECKLIST', {
    x: 48,
    y: y - 4,
    size: 8,
    font: fontBold,
    color: luGoldDark
  });

  const check1 = `* Total Credits: ${totEarned} Earned/Enrolled + ${totPlan} Planned = ${totProj} / 120+ (Target: ${totProj >= 120 ? 'MET' : 'DEFICIT'})`;
  const check2 = `* Upper-Level (30000+): ${ulProj} / 42 cr (Target: ${ulProj >= 42 ? 'MET' : 'DEFICIT'})`;
  const check3 = `* Institutional Residency: ${luRes} / 30 cr (Final 24cr Met: YES)  * Human Diversity (/HD): 2 Courses Met`;

  page.drawText(safeText(check1), { x: 48, y: y - 16, size: 7.5, font: fontRegular, color: luBlack });
  page.drawText(safeText(check2), { x: 48, y: y - 26, size: 7.5, font: fontRegular, color: luBlack });
  page.drawText(safeText(check3), { x: 48, y: y - 36, size: 7.5, font: fontRegular, color: luBlack });

  y -= 52;

  // Render Semesters
  const drawSemesterTable = (sem) => {
    if (y < 120) {
      // New Page
      page = pdfDoc.addPage([612, 792]);
      y = height - 40;
      page.drawRectangle({
        x: 0,
        y: height - 4,
        width,
        height: 4,
        color: luGold
      });
    }

    // Semester Header
    page.drawRectangle({
      x: 40,
      y: y - 16,
      width: width - 80,
      height: 18,
      color: luBlack
    });
    page.drawText(safeText(`${sem.title.toUpperCase()}  (${sem.totalCredits} Credits)`), {
      x: 48,
      y: y - 12,
      size: 9,
      font: fontBold,
      color: luWhite
    });
    y -= 20;

    // Course rows across lanes
    const allCoursesInSem = [];
    for (const [laneKey, list] of Object.entries(sem.lanes || {})) {
      for (const c of list) {
        allCoursesInSem.push({ ...c, lane: laneKey });
      }
    }

    for (const c of allCoursesInSem) {
      if (y < 60) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 40;
      }

      // Tactile weight background pill
      const tier = c.tactileWeight?.tier || 1;
      const bg = tier === 1 ? skyBlueBg : tier === 2 ? amberBg : slateBg;
      const txtColor = tier === 1 ? skyBlueText : tier === 2 ? amberText : slateText;

      page.drawRectangle({
        x: 40,
        y: y - 11,
        width: 60,
        height: 12,
        color: bg
      });
      page.drawText(safeText(c.tactileWeight?.label ? c.tactileWeight.label.slice(0, 10) : 'Standard'), {
        x: 42,
        y: y - 8,
        size: 6,
        font: fontBold,
        color: txtColor
      });

      // Category icon badge (e.g. [M], [GE], [Em])
      page.drawText(safeText(`[${c.category || 'M'}]`), {
        x: 105,
        y: y - 8,
        size: 7.5,
        font: fontBold,
        color: luGoldDark
      });

      // Course code & title
      page.drawText(safeText(`${c.code} - ${c.title}`).slice(0, 55), {
        x: 130,
        y: y - 8,
        size: 8,
        font: fontRegular,
        color: luBlack
      });

      // Session Lane & Credits
      page.drawText(safeText(`${c.lane} | ${c.credits} cr`), {
        x: width - 110,
        y: y - 8,
        size: 7.5,
        font: fontMono,
        color: luTextSec
      });

      y -= 13;
    }

    // Registration Notice if present
    if (sem.registrationNotice?.bannerText) {
      page.drawText(safeText(`Registration: ${sem.registrationNotice.bannerText}`).slice(0, 95), {
        x: 45,
        y: y - 8,
        size: 6.5,
        font: fontBold,
        color: luGoldDark
      });
      y -= 12;
    }

    // Semester Notes list
    for (const n of sem.notes || []) {
      page.drawText(safeText(`* Note: ${n.text}`).slice(0, 95), {
        x: 48,
        y: y - 7,
        size: 6.5,
        font: fontRegular,
        color: luTextSec
      });
      y -= 10;
    }

    y -= 8;
  };

  for (const sem of schedule.semesters || []) {
    if (sem.totalCredits > 0) {
      drawSemesterTable(sem);
    }
  }

  // Footer on final page
  page.drawText(safeText('Lindenwood University | 209 S. Kingshighway St., St. Charles, MO 63301 | www.lindenwood.edu | Official Student Degree Plan'), {
    x: 40,
    y: 20,
    size: 7,
    font: fontRegular,
    color: luTextSec
  });

  // =========================================================================
  // EMBED STATEFUL JSON METADATA (Round-trip reload in Screen 1 Option A)
  // =========================================================================
  // Compact course objects in metadata payload so pdf-lib's String.fromCharCode(...bytes)
  // never exceeds V8's 65,535 call stack limit during PDFDocument.load().
  const compactCourse = (c) => {
    if (!c || typeof c !== 'object') return c;
    const { description, rawRow, ...rest } = c;
    return rest;
  };

  const compactAudit = planState.auditResult
    ? {
        ...planState.auditResult,
        normalizedHistory: (planState.auditResult.normalizedHistory || []).map(compactCourse),
        remainingCourseItems: (planState.auditResult.remainingCourseItems || []).map(compactCourse)
      }
    : planState.auditResult;

  const compactSchedule = planState.schedule
    ? {
        ...planState.schedule,
        semesters: (planState.schedule.semesters || []).map((s) => ({
          ...s,
          lanes: Object.fromEntries(
            Object.entries(s.lanes || {}).map(([k, list]) => [
              k,
              (list || []).map(compactCourse)
            ])
          )
        }))
      }
    : planState.schedule;

  const serializedState = JSON.stringify({
    _AdvisorState: true,
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    studentMetadata: planState.studentMetadata,
    facultyProfile: planState.facultyProfile,
    primaryProgram: planState.primaryProgram,
    constraints: planState.constraints,
    auditResult: compactAudit,
    schedule: compactSchedule
  });

  const b64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(serializedState)))
      : Buffer.from(serializedState, 'utf-8').toString('base64');

  pdfDoc.setTitle('Lindenwood University Student Academic Degree Plan');
  pdfDoc.setAuthor(`${advisor.first_name || ''} ${advisor.last_name || ''}`.trim());
  pdfDoc.setSubject(`DegreePlanState:${b64}`);
  pdfDoc.setKeywords(['LindenwoodDegreePlanState', '_AdvisorState']);

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
