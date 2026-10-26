/**
 * Degree Planner Deterministic Core
 * Stateful 5-Layer Claim-and-Remove Waterfall Audit Engine (src/engine/waterfallAudit.js)
 *
 * Implements:
 * - Layer 1: Specific GE Buckets (Buckets 1-12) with Composition C-or-higher gatekeepers
 * - Layer 2: Major Core, Emphasis, Dual-Counted Math (MTH 14100 + Any GE-Math), Legacy Substitutions,
 *            Advisor Overrides/PEs, and Cisco Concurrent Lab Exemption Rules
 * - Layer 3: Human Diversity (/HD) 2-Course (6cr) Attribute Overlay & Missouri CORE 42 Waiver
 * - Layer 4: GE Elective I & II Overflow (Buckets 13-14)
 * - Layer 5: Degree Policy Thresholds (120 Total Credits, 42 Upper-Level 30000+ Safeguard,
 *            30 LU Residency, Final 24 LU Residency, Major MAX(18cr, 40%) Residency, UNIV/LUL Waiver)
 */

import masterDbDefault from '../data/masterDatabase.json' with { type: 'json' };
import {
  normalizeCourseCode,
  isGradeCOrHigher,
  isTransferPlaceholder
} from './transcriptParser.js';

const GE_DEPARTMENTS = new Set([
  'ENGL',
  'EPP',
  'MTH',
  'HIST',
  'PS',
  'PSY',
  'SOC',
  'ANT',
  'ECON',
  'BSC',
  'ESC',
  'CHM',
  'PHY',
  'SCI',
  'ART',
  'TA',
  'MUS',
  'DAN',
  'REL',
  'PHL',
  'FRN',
  'SPA',
  'COM'
]);

const KNOWN_HD_COMPACT_CODES = new Set([
  'SOC10200',
  'ENGL21600',
  'REL20000',
  'ANT11200'
]);

export const BUCKET_TO_CANONICAL_TOKEN = {
  comp_1: 'REQ_GE_COMP1',
  comp_2: 'ENGL 17000',
  math: 'REQ_GE_MATH',
  us_hist_gov: 'REQ_GE_US_HIST_GOV',
  soc_sci: 'REQ_GE_SOC_SCI',
  nat_sci_lab: 'REQ_GE_NAT_SCI_LAB',
  sci_elective: 'REQ_GE_SCI_ELEC',
  stem_elective: 'REQ_GE_MATH',
  arts: 'REQ_GE_ART',
  lit: 'REQ_GE_LIT',
  human_culture_1: 'REQ_GE_HC_NON_LIT_ART',
  human_culture_2: 'REQ_GE_HC_ELEC',
  ge_elective_1: 'REQ_GE_ELEC1',
  ge_elective_2: 'REQ_GE_ELEC2'
};

/**
 * Determine if a course carries the Human Diversity (/HD) attribute.
 */
export function hasHumanDiversityAttribute(courseRecord, catalogCourse = null) {
  if (!courseRecord) return false;
  if (courseRecord.hasHDAttribute) return true;
  const title = `${courseRecord.title || ''} ${catalogCourse?.title || ''}`;
  if (/\/HD\b|\(HD\)|\bGE-[A-Z]+\/HD\b|HUMAN DIVERSITY/i.test(title)) {
    return true;
  }
  const notes = (catalogCourse?.pe_notes || []).join(' ');
  if (/\/HD|Human Diversity/i.test(notes)) {
    return true;
  }
  const compact = courseRecord.compactCode || normalizeCourseCode(courseRecord.code)?.compact;
  return KNOWN_HD_COMPACT_CODES.has(compact);
}

/**
 * Helper to check if a course matches a specific GE bucket (1..14).
 */
function matchesGEBucket(bucketId, course, catalogCourse = null) {
  const code = course.code;
  const compact = course.compactCode;
  const dept = course.department;
  const title = `${course.title || ''} ${catalogCourse?.title || ''}`;

  // ELECT placeholders flow directly into free elective pools, never claimed by GE buckets
  if (
    course.department === 'ELECT' ||
    course.subject === 'ELECT' ||
    course.placeholderType === 'FREE_ELECTIVE' ||
    /^ELECT/i.test(code || '') ||
    /^ELECT/i.test(compact || '')
  ) {
    return false;
  }

  if (
    catalogCourse?.ge_bucket_id === bucketId ||
    course.ge_bucket_id === bucketId ||
    code === BUCKET_TO_CANONICAL_TOKEN[bucketId] ||
    compact === (BUCKET_TO_CANONICAL_TOKEN[bucketId] || '').replace(/\s+/g, '')
  ) {
    return true;
  }

  switch (bucketId) {
    case 'comp_1':
      return compact === 'ENGL15000' || compact === 'EPP15000';

    case 'comp_2':
      return compact === 'ENGL17000';

    case 'math':
      return compact === 'MTH14100';

    case 'us_hist_gov':
      return (
        /USHisGov|GE-Civ|GE-HistGov|GE-History/i.test(title) ||
        ['HIST10500', 'HIST10600', 'PS15500', 'PS15600'].includes(compact)
      );

    case 'soc_sci':
      return (
        /SocSci|GE-SocSci|GE-SocialScience/i.test(title) ||
        ['PSY10000', 'SOC10200', 'ECON23010', 'ECON23020'].includes(compact) ||
        ['PSY', 'SOC', 'ECON'].includes(dept)
      );

    case 'nat_sci_lab':
      return (
        /NatSciLec\/Lab|NatSciLab|with Lab/i.test(title) ||
        ['BSC10000', 'ESC10000', 'CHM10000', 'PHY10000'].includes(compact) ||
        (['BSC', 'ESC', 'CHM', 'PHY'].includes(dept) && course.credits >= 4)
      );

    case 'sci_elective':
      return (
        /SocSci|NatSci/i.test(title) ||
        ['PSY', 'SOC', 'ECON', 'ANT', 'BSC', 'ESC', 'CHM', 'PHY', 'SCI'].includes(dept)
      );

    case 'stem_elective':
      // Satisfied by second Major Math course (any GE-Math >= 14100, excluding MTH 11000) or SocSci/NatSci
      if (dept === 'MTH' && course.number >= 14100 && compact !== 'MTH14100') {
        return true;
      }
      return /GE-Math|SocSci|NatSci/i.test(title);

    case 'arts':
      return (
        /:Art|Human Culture:\s*Art|\bGE-Art|\bGE-Arts|\bGE-FineArts\b/i.test(title) ||
        ['ART18100', 'TA11700', 'MUS10000', 'DAN10100'].includes(compact) ||
        ['ART', 'TA', 'MUS', 'DAN'].includes(dept)
      );

    case 'lit':
      return (
        /:Lit|Human Culture:\s*Literature|\bGE-Lit|\bGE-Literature\b/i.test(title) ||
        ['ENGL20100', 'ENGL20200', 'ENGL21600'].includes(compact) ||
        (dept === 'ENGL' && course.number >= 20000 && course.number < 30000)
      );

    case 'human_culture_1':
      // Non-Literature, Non-Arts Human Culture
      if (/:Art|:Lit|Human Culture:\s*(Art|Literature)|\bGE-(?:Art|Arts|FineArts|Lit|Literature)\b/i.test(title)) {
        return false;
      }
      return (
        /GE-HC|Human Culture|GE-Humanities/i.test(title) ||
        ['REL20000', 'PHL10000', 'ANT11200'].includes(compact) ||
        ['REL', 'PHL', 'HIST', 'FRN', 'SPA'].includes(dept)
      );

    case 'human_culture_2':
      return (
        /GE-HC|Human Culture|GE-Humanities|:Art|:Lit|\bGE-(?:Art|Arts|FineArts|Lit|Literature)\b/i.test(title) ||
        ['REL', 'PHL', 'HIST', 'ART', 'TA', 'MUS', 'FRN', 'SPA'].includes(dept) ||
        (dept === 'ENGL' && course.number >= 20000 && course.number < 30000)
      );

    case 'ge_elective_1':
    case 'ge_elective_2':
      // Any remaining unclaimed GE course (excluding sub-GE MTH 11000, UNIV 10100, and D-grade Composition I/II)
      if (
        compact === 'MTH11000' ||
        compact === 'ENGL15000' ||
        compact === 'EPP15000' ||
        compact === 'ENGL17000' ||
        dept === 'UNIV' ||
        dept === 'LUL'
      ) {
        return false;
      }
      return (
        /\(GE|GE-/i.test(title) ||
        (GE_DEPARTMENTS.has(dept) && course.number >= 10000 && course.number < 30000)
      );

    default:
      return false;
  }
}

/**
 * Execute the 5-Layer Deterministic Waterfall Audit.
 *
 * @param {Object} parsedTranscript - Output from transcriptParser.js
 * @param {string|string[]} programIdOrIds - Program ID(s) or name(s) (e.g. 'cybersecurity_bs_2026')
 * @param {Object} masterDb - Master database JSON object
 * @param {Object} options - Optional advisor settings:
 *   - core42Completed {boolean}
 *   - mathPlacementMet {boolean}
 *   - ciscoCertExempt {boolean}
 *   - incomingTransfers {Array<{code, title, credits, institution}>}
 *   - advisorOverrides {Object} map of requirementKey -> { courseCode, note, type: 'PE' | 'Tentative' }
 */
export function runWaterfallAudit(
  parsedTranscript,
  programIdOrIds = 'cybersecurity_bs_2026',
  masterDb = masterDbDefault,
  options = {}
) {
  const db = masterDb || masterDbDefault;
  const catalogByCompact = new Map();
  for (const c of db.courses || []) {
    const norm = normalizeCourseCode(c.code);
    if (norm) catalogByCompact.set(norm.compact, c);
    catalogByCompact.set(c.code.replace(/\s+/g, '').toUpperCase(), c);
    catalogByCompact.set(c.code.toUpperCase(), c);
  }

  // Resolve selected program(s)
  const requestedIds = Array.isArray(programIdOrIds) ? programIdOrIds : [programIdOrIds];
  const selectedPrograms = requestedIds
    .map((idOrName) => {
      const q = String(idOrName || '').trim().toLowerCase();
      return (db.programs || []).find(
        (p) =>
          p.id.toLowerCase() === q ||
          p.name.toLowerCase() === q ||
          String(p.acalog_poid) === q
      );
    })
    .filter(Boolean);

  if (selectedPrograms.length === 0 && db.programs?.length > 0) {
    selectedPrograms.push(db.programs[0]);
  }

  const primaryProgram = selectedPrograms[0];

  // Combine valid student courses + any pending incoming transfer placeholders
  const incomingList = (options.incomingTransfers || []).map((tr) => {
    const norm = normalizeCourseCode(tr.code) || {
      canonical: tr.code,
      compact: String(tr.code).replace(/\s+/g, '').toUpperCase(),
      department: 'TR',
      number: 10000
    };
    return {
      code: norm.canonical,
      compactCode: norm.compact,
      department: norm.department,
      number: norm.number,
      title: tr.title || `Incoming Transfer (${tr.institution || 'Pending'})`,
      credits: Number(tr.credits) || 3,
      grade: 'TR',
      state: 'TR',
      isIncomingPlaceholder: true,
      institution: tr.institution || 'External',
      hasHDAttribute: Boolean(tr.hasHDAttribute || /\/HD\b/i.test(tr.title || ''))
    };
  });

  const allStudentCourses = [...(parsedTranscript?.validCourses || []), ...incomingList].map(
    (c) => {
      const cat = catalogByCompact.get(c.compactCode);
      return {
        ...c,
        title: c.title || cat?.title || c.code,
        hasHDAttribute: hasHumanDiversityAttribute(c, cat)
      };
    }
  );

  // Pool of unclaimed student courses (preserving multiple instances for transfer placeholders)
  const unclaimedPool = new Map();
  for (let i = 0; i < allStudentCourses.length; i++) {
    const c = allStudentCourses[i];
    const placeholderMeta = isTransferPlaceholder(c);
    const key = placeholderMeta?.allowMultipleInstances
      ? `${c.compactCode}_${c.term || 'TR'}_${c.grade || ''}_${c.credits || ''}_${i}`
      : c.compactCode;
    c._unclaimedKey = key;
    unclaimedPool.set(key, c);
  }

  function findAndClaimUnclaimed(compactCode) {
    if (unclaimedPool.has(compactCode)) {
      const match = unclaimedPool.get(compactCode);
      unclaimedPool.delete(compactCode);
      return match;
    }
    for (const [key, candidate] of unclaimedPool.entries()) {
      if (candidate.compactCode === compactCode) {
        unclaimedPool.delete(key);
        return candidate;
      }
    }
    return null;
  }

  const compositionGatekeeperWarnings = [];
  const advisorRecommendations = [];

  // Detect retired legacy courses ICS 32600 / ICS 32601 on transcript
  if (unclaimedPool.has('ICS32600') || unclaimedPool.has('ICS32601')) {
    advisorRecommendations.push(
      'Student record contains retired course ICS 32600/32601. Recommend rolling forward to the 2024-2025+ catalog or filing a Policy Exception (PE).'
    );
  }

  // =========================================================================
  // PRE-PASS: Math Placement & Human Diversity (/HD) Attribute Overlay Scan
  // =========================================================================
  const hasMathCourseOnTranscript = allStudentCourses.some(
    (c) => c.department === 'MTH' && c.number >= 11000
  );
  const mathPlacementSatisfied = Boolean(hasMathCourseOnTranscript || options.mathPlacementMet);

  const hdCoursesSatisfied = allStudentCourses.filter((c) => c.hasHDAttribute);
  const hdCount = hdCoursesSatisfied.length;
  const hdDeficit = Math.max(0, 2 - hdCount);

  // =========================================================================
  // LAYER 2 PRE-LOCK: Reserve Major Core & Emphasis Courses First
  // (So no Major/Emphasis course is ever swallowed by a generic GE bucket,
  //  except MTH 14100 and the second GE-Math course which dual-satisfy!)
  // =========================================================================
  const majorCoreCodes = [];
  const emphasisCodes = [];
  for (const prog of selectedPrograms) {
    for (const code of prog.requirements?.major_core_courses || []) {
      if (!majorCoreCodes.includes(code)) majorCoreCodes.push(code);
    }
    for (const code of prog.requirements?.emphasis_courses || []) {
      if (!emphasisCodes.includes(code)) emphasisCodes.push(code);
    }
  }

  // Build Legacy Substitution Map: e.g. ICS 41500 <- ICS 41100, ICS 41700 <- ICS 41400
  const legacySubMap = {
    ICS41500: ['ICS41100'],
    ICS41700: ['ICS41400']
  };
  for (const c of db.courses || []) {
    const norm = normalizeCourseCode(c.code);
    if (norm && Array.isArray(c.legacy_substitutions) && c.legacy_substitutions.length > 0) {
      legacySubMap[norm.compact] = c.legacy_substitutions
        .map((s) => normalizeCourseCode(s)?.compact)
        .filter(Boolean);
    }
  }

  // Evaluate Cisco Concurrent Lab Exemption Rule for IT Networking (poid=2152)
  const isNetworkingMajor = selectedPrograms.some((p) => p.acalog_poid === 2152);
  const ciscoLectureCodes = ['ICS32300', 'ICS32400', 'ICS32500'];
  const hasTransferredOrPriorCisco = allStudentCourses.some(
    (c) =>
      ciscoLectureCodes.includes(c.compactCode) &&
      ((c.state === 'TR' && isGradeCOrHigher(c.grade)) ||
        (c.termInfo?.year && c.termInfo.year < 2024))
  );
  const ciscoLabExemptionApplied = Boolean(
    isNetworkingMajor && (hasTransferredOrPriorCisco || options.ciscoCertExempt)
  );

  // Claim Major Core & Emphasis courses from unclaimedPool
  const majorRequirements = [];
  const emphasisRequirements = [];
  const advisorOverrides = options.advisorOverrides || {};

  function claimProgramCourseList(codeList, targetArray, categoryTag) {
    for (const reqCode of codeList) {
      const norm = normalizeCourseCode(reqCode);
      const compact = norm.compact;
      const catCourse = catalogByCompact.get(compact);

      // 1. Check direct match in unclaimedPool
      let matchedStudentCourse = findAndClaimUnclaimed(compact);
      let matchNote = null;

      // 2. Check Legacy Substitution (e.g., ICS 41100 -> ICS 41500, ICS 41400 -> ICS 41700)
      if (!matchedStudentCourse && legacySubMap[compact]) {
        for (const subCompact of legacySubMap[compact]) {
          matchedStudentCourse = findAndClaimUnclaimed(subCompact);
          if (matchedStudentCourse) {
            matchNote = `Satisfied via legacy substitution (${matchedStudentCourse.code})`;
            break;
          }
        }
      }

      // 3. Check Advisor Override / Policy Exception (PE)
      if (!matchedStudentCourse && advisorOverrides[reqCode]) {
        const overrideNorm = normalizeCourseCode(advisorOverrides[reqCode].courseCode);
        if (overrideNorm) {
          matchedStudentCourse = findAndClaimUnclaimed(overrideNorm.compact);
          if (matchedStudentCourse) {
            matchNote = `Satisfied via Advisor ${advisorOverrides[reqCode].type || 'Override'} (${matchedStudentCourse.code})`;
          }
        }
      }

      // 4. Special check for Cisco 1cr Lab Exemption if corresponding 5cr lecture was completed/transferred under exemption
      const ciscoLabToLecture = {
        ICS32301: 'ICS32300',
        ICS32401: 'ICS32400',
        ICS32501: 'ICS32500'
      };
      let waivedByCiscoRule = false;
      if (
        !matchedStudentCourse &&
        ciscoLabExemptionApplied &&
        ciscoLabToLecture[compact] &&
        allStudentCourses.some((c) => c.compactCode === ciscoLabToLecture[compact])
      ) {
        waivedByCiscoRule = true;
        matchNote = 'Cisco Concurrent Lab Exempt (Prior Catalog / Transfer >= C / Certification)';
      }

      targetArray.push({
        code: reqCode,
        compactCode: compact,
        title: catCourse?.title || reqCode,
        credits: catCourse?.credits || 3,
        category: categoryTag,
        fulfilled: Boolean(matchedStudentCourse || waivedByCiscoRule),
        waived: waivedByCiscoRule,
        matchedCourse: matchedStudentCourse,
        state: matchedStudentCourse ? matchedStudentCourse.state : waivedByCiscoRule ? 'Waived' : 'Remaining',
        note: matchNote
      });
    }
  }

  claimProgramCourseList(majorCoreCodes, majorRequirements, 'M');
  claimProgramCourseList(emphasisCodes, emphasisRequirements, 'Em');

  // =========================================================================
  // LAYER 1 & LAYER 4: 14-Bucket (42-Credit) General Education Waterfall
  // =========================================================================
  const geBucketsResult = [];
  const schemaBuckets = [...(db.ge_waterfall_schema || [])].sort((a, b) => a.order - b.order);

  // Track dual-counted Major Math requirements
  let mth14100MatchedCourse = null;
  let secondGeMathMatchedCourse = null;

  for (const bucket of schemaBuckets) {
    const bucketId = bucket.bucket_id;

    // Check Composition I & II Gatekeeper (Grade >= C required)
    if (bucketId === 'comp_1' || bucketId === 'comp_2') {
      const candidateCodes = bucketId === 'comp_1' ? ['ENGL15000', 'EPP15000'] : ['ENGL17000'];
      let matched = null;

      for (const cCode of candidateCodes) {
        const candidate = unclaimedPool.get(cCode);
        if (candidate) {
          if (
            candidate.state === 'Current' ||
            candidate.state === 'Scheduled' ||
            isGradeCOrHigher(candidate.grade)
          ) {
            matched = candidate;
            unclaimedPool.delete(cCode);
            break;
          } else {
            // Grade is D (or C-): counts toward 120 total credits, but leaves Composition bucket UNFULFILLED!
            compositionGatekeeperWarnings.push({
              bucketId,
              courseCode: candidate.code,
              grade: candidate.grade,
              message: `${candidate.code} earned grade '${candidate.grade}'. A grade of C or higher is required to satisfy ${bucket.name}; credits count toward general electives only.`
            });
          }
        }
      }

      geBucketsResult.push({
        ...bucket,
        fulfilled: Boolean(matched),
        status: matched ? 'MET' : 'UNMET',
        waived: false,
        matchedCourse: matched,
        claimed_courses: matched ? [matched] : [],
        state: matched ? matched.state : 'Remaining'
      });
      continue;
    }

    // Check Bucket 3: MTH 14100 (Dual-satisfies GE Math and Major Math)
    if (bucketId === 'math') {
      const mth141 = findAndClaimUnclaimed('MTH14100');
      if (mth141) {
        mth14100MatchedCourse = mth141;
      }
      geBucketsResult.push({
        ...bucket,
        fulfilled: Boolean(mth141),
        status: mth141 ? 'MET' : 'UNMET',
        waived: false,
        matchedCourse: mth141,
        claimed_courses: mth141 ? [mth141] : [],
        dualSatisfiesMajor: true,
        state: mth141 ? mth141.state : 'Remaining'
      });
      continue;
    }

    // Compound Bucket Matching for nat_sci_lab:
    // Path A: Single combined course >= 4cr (e.g. BSC 10000, ESC 10000, CHM 10000)
    // Path B: Compound split (3cr lecture + 1cr lab claimed together)
    // Path C: Orphaned lecture without lab remains UNMET, cascading to sci_elective
    if (bucketId === 'nat_sci_lab') {
      let matchedSingle = null;
      let matchedSingleKey = null;
      let matchedLecture = null;
      let matchedLectureKey = null;
      let matchedLab = null;
      let matchedLabKey = null;

      // Path A: Single Combined 4cr Course
      for (const [poolKey, candidate] of unclaimedPool.entries()) {
        const catCourse = catalogByCompact.get(candidate.compactCode);
        const title = `${candidate.title || ''} ${catCourse?.title || ''}`;
        const dept = candidate.department || catCourse?.department || '';
        const credits = candidate.credits || 0;

        const isCombined =
          credits >= 4 &&
          (/NatSciLec\/Lab|with Lab/i.test(title) ||
            ['BSC10000', 'ESC10000', 'CHM10000', 'PHY10000'].includes(candidate.compactCode) ||
            ['BSC', 'ESC', 'CHM', 'PHY'].includes(dept));

        if (isCombined) {
          matchedSingle = candidate;
          matchedSingleKey = poolKey;
          break;
        }
      }

      if (matchedSingle) {
        unclaimedPool.delete(matchedSingleKey);
        geBucketsResult.push({
          ...bucket,
          fulfilled: true,
          status: 'MET',
          waived: false,
          matchedCourse: matchedSingle,
          claimed_courses: [matchedSingle],
          state: matchedSingle.state || 'Completed'
        });
        continue;
      }

      // Path B: Compound Split (3cr Lecture + 1cr Lab)
      for (const [poolKey, candidate] of unclaimedPool.entries()) {
        const catCourse = catalogByCompact.get(candidate.compactCode);
        const title = `${candidate.title || ''} ${catCourse?.title || ''}`;
        const dept = candidate.department || catCourse?.department || '';
        const credits = candidate.credits || 0;
        const numStr = String(candidate.number || '');

        const isLab =
          /NatSciLab|Lab\b/i.test(title) ||
          numStr.endsWith('01') ||
          numStr.endsWith('L') ||
          (credits <= 2 && ['BSC', 'CHM', 'ESC', 'PHY'].includes(dept));

        const isLec =
          credits >= 3 &&
          !isLab &&
          (/NatSciLec/i.test(title) || ['BSC', 'CHM', 'ESC', 'PHY'].includes(dept));

        if (!matchedLecture && isLec) {
          matchedLecture = candidate;
          matchedLectureKey = poolKey;
        } else if (!matchedLab && isLab) {
          matchedLab = candidate;
          matchedLabKey = poolKey;
        }

        if (matchedLecture && matchedLab) break;
      }

      if (matchedLecture && matchedLab) {
        unclaimedPool.delete(matchedLectureKey);
        unclaimedPool.delete(matchedLabKey);
        geBucketsResult.push({
          ...bucket,
          fulfilled: true,
          status: 'MET',
          waived: false,
          matchedCourse: matchedLecture,
          claimed_courses: [matchedLecture, matchedLab],
          state: matchedLecture.state || 'Completed'
        });
        continue;
      }

      // Path C: Orphaned lecture without lab, or no science courses
      const waivedByCore42 = Boolean(options.core42Completed);
      geBucketsResult.push({
        ...bucket,
        fulfilled: waivedByCore42,
        status: waivedByCore42 ? 'WAIVED' : 'UNMET',
        waived: waivedByCore42,
        matchedCourse: null,
        claimed_courses: [],
        state: waivedByCore42 ? 'Waived (CORE 42)' : 'Remaining'
      });
      continue;
    }

    // Check Missouri CORE 42 Waiver for remaining non-MTH14100 GE buckets
    let matched = null;
    for (const [poolKey, candidate] of unclaimedPool.entries()) {
      const catCourse = catalogByCompact.get(candidate.compactCode);
      if (matchesGEBucket(bucketId, candidate, catCourse)) {
        matched = candidate;
        unclaimedPool.delete(poolKey);
        break;
      }
    }

    if (bucketId === 'stem_elective' && matched && matched.department === 'MTH') {
      secondGeMathMatchedCourse = matched;
    }

    const waivedByCore42 = !matched && Boolean(options.core42Completed);

    geBucketsResult.push({
      ...bucket,
      fulfilled: Boolean(matched || waivedByCore42),
      status: matched ? 'MET' : (waivedByCore42 ? 'WAIVED' : 'UNMET'),
      waived: waivedByCore42,
      matchedCourse: matched,
      claimed_courses: matched ? [matched] : [],
      dualSatisfiesMajor: bucketId === 'stem_elective',
      state: matched ? matched.state : waivedByCore42 ? 'Waived (CORE 42)' : 'Remaining'
    });
  }

  // Record Dual-Satisfied Major Math status inside majorRequirements
  const majorMathRequirements = [
    {
      code: 'MTH 14100',
      compactCode: 'MTH14100',
      title: 'Basic Statistics (Dual-Counted in GE Math)',
      credits: 3,
      category: 'M/GE',
      dualCountedWithGEBucket: 'math',
      fulfilled: Boolean(mth14100MatchedCourse),
      matchedCourse: mth14100MatchedCourse,
      state: mth14100MatchedCourse ? mth14100MatchedCourse.state : 'Remaining'
    },
    {
      code: 'REQ_GE_MATH',
      compactCode: 'REQ_GE_MATH',
      title: 'Mathematics Elective (GE-Math)',
      credits: 3,
      category: 'M/GE',
      dualCountedWithGEBucket: 'stem_elective',
      fulfilled: Boolean(secondGeMathMatchedCourse),
      matchedCourse: secondGeMathMatchedCourse,
      state: secondGeMathMatchedCourse ? secondGeMathMatchedCourse.state : 'Remaining'
    }
  ];

  // =========================================================================
  // LAYER 3: Human Diversity (/HD) Overlay on Remaining GE Placeholders
  // =========================================================================
  let remainingHdToTag = hdDeficit;
  // Prefer tagging Human Culture or Social Science or GE Elective buckets first
  const hdEligibleBucketIds = new Set([
    'human_culture_1',
    'human_culture_2',
    'soc_sci',
    'lit',
    'arts',
    'ge_elective_1',
    'ge_elective_2'
  ]);

  for (const b of geBucketsResult) {
    if (remainingHdToTag > 0 && !b.fulfilled && hdEligibleBucketIds.has(b.bucket_id)) {
      b.requiresHD = true;
      b.needs_hd = true;
      b.displayPlaceholderTitle = `${b.name} (HD)`;
      remainingHdToTag -= 1;
    } else {
      b.requiresHD = false;
      b.needs_hd = false;
      b.displayPlaceholderTitle = b.name;
    }
  }

  // =========================================================================
  // LAYER 5: Free Electives, Upper-Level (30000+) Safeguard, & 120-Credit Gap
  // =========================================================================
  const claimedFreeElectives = Array.from(unclaimedPool.values());
  unclaimedPool.clear();

  // Unique Credit Summations (Every student course summed strictly once)
  const completedCredits = allStudentCourses
    .filter((c) => c.state === 'TR' || c.state === 'Completed')
    .reduce((sum, c) => sum + c.credits, 0);

  const enrolledCredits = allStudentCourses
    .filter((c) => c.state === 'Current' || c.state === 'Scheduled')
    .reduce((sum, c) => sum + c.credits, 0);

  const totalEarnedAndEnrolledCredits = completedCredits + enrolledCredits;
  const totalTransferCredits = allStudentCourses
    .filter((c) => c.state === 'TR')
    .reduce((sum, c) => sum + c.credits, 0);

  const univLulWaived = totalTransferCredits > 0;

  // Build Remaining Required Courses for the Scheduler (Zero Duplicate Math!)
  const remainingCourseItems = [];

  // 1. Remaining GE Buckets
  for (const b of geBucketsResult) {
    if (!b.fulfilled) {
      if (b.bucket_id === 'comp_1') {
        const cat = catalogByCompact.get('REQ_GE_COMP1');
        remainingCourseItems.push({
          ...(cat || {}),
          code: 'REQ_GE_COMP1',
          compactCode: 'REQ_GE_COMP1',
          department: 'GE',
          number: 10100,
          title: b.requiresHD ? 'GE: Composition I (HD) (3cr)' : (cat?.title || 'GE: Composition I (3cr)'),
          credits: 3,
          category: 'GE',
          geBucketId: b.bucket_id,
          eligible_courses: cat?.eligible_courses || ['ENGL 15000', 'EPP 15000'],
          default_course: cat?.default_course || 'ENGL 15000',
          selected_course: 'ENGL 15000',
          type: 'placeholder',
          isPlaceholder: true,
          system_locked: true,
          requiresHD: Boolean(b.requiresHD),
          needs_hd: Boolean(b.requiresHD),
          offered_sessions: cat?.offered_sessions || ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
          FA_I_8wk: true,
          FA_II_8wk: true,
          FA_16wk: true,
          SP_I_8wk: true,
          SP_II_8wk: true,
          SP_16wk: true,
          SU_8wk: true,
          modalities: cat?.modalities || ['Online', 'OnGround'],
          prereq_logic: null,
          coreq_codes: [],
          verification_status: 'Verified'
        });
      } else if (b.bucket_id === 'comp_2') {
        const cat = catalogByCompact.get('ENGL17000');
        remainingCourseItems.push({
          ...(cat || {}),
          code: 'ENGL 17000',
          compactCode: 'ENGL17000',
          department: 'ENGL',
          number: 17000,
          title: cat?.title || 'Composition II (GE-Comm)',
          credits: 3,
          category: 'GE',
          geBucketId: b.bucket_id,
          type: 'concrete',
          isPlaceholder: false
        });
      } else if (b.bucket_id === 'math') {
        const cat = catalogByCompact.get('MTH14100');
        remainingCourseItems.push({
          ...(cat || {}),
          code: 'MTH 14100',
          compactCode: 'MTH14100',
          department: 'MTH',
          number: 14100,
          title: cat?.title || 'Basic Statistics (GE-Math)',
          credits: 3,
          category: 'M',
          dualSatisfiesGE: true,
          geBucketId: b.bucket_id,
          type: 'concrete',
          isPlaceholder: false
        });
      } else if (b.bucket_id === 'stem_elective' && !secondGeMathMatchedCourse) {
        // CS/IT majors require a second GE-Math course (standardized on REQ_GE_MATH)
        const cat = catalogByCompact.get('REQ_GE_MATH');
        remainingCourseItems.push({
          ...(cat || {}),
          code: 'REQ_GE_MATH',
          compactCode: 'REQ_GE_MATH',
          department: 'GE',
          number: 14000,
          title: b.requiresHD ? 'GE: Mathematics (HD) (3cr)' : (cat?.title || 'GE: Mathematics (3cr)'),
          credits: 3,
          category: 'M',
          dualSatisfiesGE: true,
          geBucketId: b.bucket_id,
          type: 'placeholder',
          isPlaceholder: true,
          system_locked: true,
          requiresHD: Boolean(b.requiresHD),
          needs_hd: Boolean(b.requiresHD),
          offered_sessions: cat?.offered_sessions || ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
          FA_I_8wk: true,
          FA_II_8wk: true,
          FA_16wk: true,
          SP_I_8wk: true,
          SP_II_8wk: true,
          SP_16wk: true,
          SU_8wk: true,
          modalities: cat?.modalities || ['Online', 'OnGround'],
          prereq_logic: null,
          coreq_codes: [],
          verification_status: 'Verified'
        });
      } else {
        const canonicalCode = BUCKET_TO_CANONICAL_TOKEN[b.bucket_id] || `REQ_GE_${b.bucket_id.toUpperCase()}`;
        const cat = catalogByCompact.get(canonicalCode);
        const placeholderCredits = b.bucket_id === 'nat_sci_lab' ? 4 : (cat?.credits || b.required_credits || 3);
        const baseTitle = cat?.title || `GE: ${b.name} (${placeholderCredits}cr)`;
        let displayTitle = baseTitle;
        if (b.requiresHD) {
          if (baseTitle.includes('(HD)')) {
            displayTitle = baseTitle;
          } else if (baseTitle.includes('(3cr)')) {
            displayTitle = baseTitle.replace('(3cr)', '(HD) (3cr)');
          } else if (baseTitle.includes('(4cr)')) {
            displayTitle = baseTitle.replace('(4cr)', '(HD) (4cr)');
          } else {
            displayTitle = `${baseTitle} (HD)`;
          }
        }

        remainingCourseItems.push({
          ...(cat || {}),
          code: canonicalCode,
          compactCode: canonicalCode,
          department: cat?.department || 'GE',
          number: cat?.number ? Number(cat.number) : 10000 + b.order * 100,
          title: displayTitle,
          credits: placeholderCredits,
          category: 'GE',
          geBucketId: b.bucket_id,
          requiresHD: Boolean(b.requiresHD),
          needs_hd: Boolean(b.requiresHD),
          type: 'placeholder',
          isPlaceholder: true,
          system_locked: true,
          offered_sessions: cat?.offered_sessions || ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
          FA_I_8wk: true,
          FA_II_8wk: true,
          FA_16wk: true,
          SP_I_8wk: true,
          SP_II_8wk: true,
          SP_16wk: true,
          SU_8wk: true,
          modalities: cat?.modalities || ['Online', 'OnGround'],
          prereq_logic: null,
          coreq_codes: [],
          verification_status: 'Verified'
        });
      }
    }
  }

  // If CORE 42 waived STEM bucket, check if second Major Math is still needed
  if (
    options.core42Completed &&
    !secondGeMathMatchedCourse &&
    !remainingCourseItems.some((c) => c.geBucketId === 'stem_elective' || c.code === 'REQ_GE_MATH')
  ) {
    const cat = catalogByCompact.get('REQ_GE_MATH');
    remainingCourseItems.push({
      ...(cat || {}),
      code: 'REQ_GE_MATH',
      compactCode: 'REQ_GE_MATH',
      department: 'GE',
      number: 14000,
      title: 'Mathematics Elective (GE-Math)',
      credits: 3,
      category: 'M',
      dualSatisfiesGE: true,
      type: 'placeholder',
      isPlaceholder: true,
      system_locked: true,
      offered_sessions: cat?.offered_sessions || ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
      FA_I_8wk: true,
      FA_II_8wk: true,
      FA_16wk: true,
      SP_I_8wk: true,
      SP_II_8wk: true,
      SP_16wk: true,
      SU_8wk: true,
      modalities: ['Online', 'OnGround'],
      prereq_logic: null,
      coreq_codes: [],
      verification_status: 'Verified'
    });
  }

  // 2. Remaining Major Core & Emphasis Courses
  for (const req of [...majorRequirements, ...emphasisRequirements]) {
    if (!req.fulfilled) {
      const cat = catalogByCompact.get(req.compactCode);
      remainingCourseItems.push({
        ...(cat || {}),
        code: req.code,
        compactCode: req.compactCode,
        department: cat?.department || req.code.split(' ')[0],
        number: parseInt(cat?.number || req.code.split(' ')[1] || '30000', 10),
        title: req.title,
        credits: req.credits,
        category: req.category,
        verification_status: cat?.verification_status || 'Blank_Unverified'
      });
    }
  }

  // 3. Upper-Level (30000+) 42-Credit Safeguard
  const earnedAndEnrolledUpperLevelCredits = allStudentCourses
    .filter((c) => c.number >= 30000)
    .reduce((sum, c) => sum + c.credits, 0);

  const remainingRequiredUpperLevelCredits = remainingCourseItems
    .filter((c) => c.number >= 30000)
    .reduce((sum, c) => sum + c.credits, 0);

  const projectedUpperLevelBeforeElectives =
    earnedAndEnrolledUpperLevelCredits + remainingRequiredUpperLevelCredits;

  const upperLevelDeficit = Math.max(0, 42 - projectedUpperLevelBeforeElectives);
  const upperLevelElectiveCount = Math.ceil(upperLevelDeficit / 3);
  const generatedUpperLevelElectives = [];

  for (let i = 1; i <= upperLevelElectiveCount; i++) {
    const ulItem = {
      code: `REQ_ELEC_UPPER_${i}`,
      canonicalCode: 'REQ_ELEC_UPPER',
      compactCode: `REQ_ELEC_UPPER_${i}`,
      department: 'ELEC',
      number: 30000 + i,
      title: 'Upper-Level Elective (30000+) (3cr)',
      credits: 3,
      category: 'E',
      type: 'placeholder',
      isPlaceholder: true,
      isUpperLevelElective: true,
      system_locked: true,
      offered_sessions: ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
      FA_I_8wk: true,
      FA_II_8wk: true,
      FA_16wk: true,
      SP_I_8wk: true,
      SP_II_8wk: true,
      SP_16wk: true,
      SU_8wk: true,
      modalities: ['Online', 'OnGround'],
      prereq_logic: null,
      coreq_codes: [],
      verification_status: 'Verified'
    };
    generatedUpperLevelElectives.push(ulItem);
    remainingCourseItems.push(ulItem);
  }

  // 4. 120-Credit Total Graduation Safeguard (General Electives)
  const remainingCreditsSoFar = remainingCourseItems.reduce((sum, c) => sum + c.credits, 0);
  const projectedTotalBeforeGeneralElectives =
    totalEarnedAndEnrolledCredits + remainingCreditsSoFar;

  const generalElectiveDeficit = Math.max(0, 120 - projectedTotalBeforeGeneralElectives);
  const generalElectiveCount = Math.ceil(generalElectiveDeficit / 3);
  const generatedGeneralElectives = [];

  for (let i = 1; i <= generalElectiveCount; i++) {
    const genItem = {
      code: `REQ_ELEC_GEN_${i}`,
      canonicalCode: 'REQ_ELEC_GEN',
      compactCode: `REQ_ELEC_GEN_${i}`,
      department: 'ELEC',
      number: 10000 + i,
      title: 'General Elective (3cr)',
      credits: 3,
      category: 'E',
      type: 'placeholder',
      isPlaceholder: true,
      system_locked: true,
      offered_sessions: ['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'],
      FA_I_8wk: true,
      FA_II_8wk: true,
      FA_16wk: true,
      SP_I_8wk: true,
      SP_II_8wk: true,
      SP_16wk: true,
      SU_8wk: true,
      modalities: ['Online', 'OnGround'],
      prereq_logic: null,
      coreq_codes: [],
      verification_status: 'Verified'
    };
    generatedGeneralElectives.push(genItem);
    remainingCourseItems.push(genItem);
  }

  const totalRemainingPlannedCredits = remainingCourseItems.reduce(
    (sum, c) => sum + c.credits,
    0
  );
  const finalProjectedTotalCredits =
    totalEarnedAndEnrolledCredits + totalRemainingPlannedCredits;
  const finalProjectedUpperLevelCredits =
    projectedUpperLevelBeforeElectives + generatedUpperLevelElectives.length * 3;

  // 5. Institutional & Major Residency Calculations
  const currentLindenwoodCredits = allStudentCourses
    .filter((c) => c.state !== 'TR')
    .reduce((sum, c) => sum + c.credits, 0);
  const projectedLindenwoodCredits = currentLindenwoodCredits + totalRemainingPlannedCredits;

  const totalMajorAndEmphasisRequiredCredits =
    (primaryProgram?.requirements?.major_core_credits || 0) +
    (primaryProgram?.requirements?.emphasis_credits || 0);
  const majorResidencyTargetCredits = Math.max(
    18,
    Math.ceil(totalMajorAndEmphasisRequiredCredits * 0.4)
  );

  const lindenwoodMajorCredits = [...majorRequirements, ...emphasisRequirements]
    .filter((r) => !r.fulfilled || (r.matchedCourse && r.matchedCourse.state !== 'TR'))
    .reduce((sum, r) => sum + r.credits, 0);

  return {
    studentMetadata: parsedTranscript?.studentMetadata || null,
    selectedPrograms,
    primaryProgram,
    geBuckets: geBucketsResult,
    majorRequirements,
    emphasisRequirements,
    majorMathRequirements,
    claimedFreeElectives,
    freeElectives: claimedFreeElectives,
    generatedUpperLevelElectives,
    generatedGeneralElectives,
    remainingCourseItems,
    excludedCourses: parsedTranscript?.excludedCourses || [],
    warnings: {
      compositionGatekeeperWarnings,
      advisorRecommendations
    },
    flags: {
      univLulWaived,
      mathPlacementSatisfied,
      ciscoLabExemptionApplied,
      core42Completed: Boolean(options.core42Completed)
    },
    policyChecklist: {
      totalCredits: {
        completed: completedCredits,
        enrolled: enrolledCredits,
        EarnedPlusEnrolled: totalEarnedAndEnrolledCredits,
        remainingPlanned: totalRemainingPlannedCredits,
        projectedTotal: finalProjectedTotalCredits,
        target: Math.max(120, finalProjectedTotalCredits),
        minThreshold: 120,
        transferCredits: totalTransferCredits,
        univLulWaived,
        satisfied: finalProjectedTotalCredits >= 120
      },
      upperLevelCredits: {
        earnedAndEnrolled: earnedAndEnrolledUpperLevelCredits,
        remainingRequired: remainingRequiredUpperLevelCredits,
        generatedUpperLevelElectiveCredits: generatedUpperLevelElectives.length * 3,
        projectedTotal: finalProjectedUpperLevelCredits,
        minThreshold: 42,
        satisfied: finalProjectedUpperLevelCredits >= 42
      },
      residency: {
        currentLindenwoodCredits,
        projectedLindenwoodCredits,
        minLindenwoodCredits: 30,
        currentInstitutionalCredits: currentLindenwoodCredits,
        projectedInstitutionalCredits: projectedLindenwoodCredits,
        minInstitutionalCredits: 30,
        final24ResidencyMet: projectedLindenwoodCredits >= 24 && incomingList.length === 0,
        majorResidencyTargetCredits,
        projectedLindenwoodMajorCredits: lindenwoodMajorCredits,
        projectedInstitutionalMajorCredits: lindenwoodMajorCredits,
        majorResidencyMet: lindenwoodMajorCredits >= majorResidencyTargetCredits,
        satisfied:
          projectedLindenwoodCredits >= 30 &&
          lindenwoodMajorCredits >= majorResidencyTargetCredits
      },
      humanDiversity: {
        completedOrEnrolledCount: hdCount,
        completedOrEnrolledCourses: hdCoursesSatisfied.map((c) => c.code),
        remainingTaggedInGE: hdDeficit - remainingHdToTag,
        requiredCourses: 2,
        requiredCredits: 6,
        satisfied: hdCount + (hdDeficit - remainingHdToTag) >= 2
      },
      compositionGatekeeper: {
        comp1Fulfilled: geBucketsResult.find((b) => b.bucket_id === 'comp_1')?.fulfilled || false,
        comp2Fulfilled: geBucketsResult.find((b) => b.bucket_id === 'comp_2')?.fulfilled || false,
        warnings: compositionGatekeeperWarnings,
        satisfied:
          Boolean(geBucketsResult.find((b) => b.bucket_id === 'comp_1')?.fulfilled) &&
          Boolean(geBucketsResult.find((b) => b.bucket_id === 'comp_2')?.fulfilled) &&
          compositionGatekeeperWarnings.length === 0
      }
    }
  };
}
