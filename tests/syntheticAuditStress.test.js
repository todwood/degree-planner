import { describe, it, expect } from 'vitest';
import masterDb from '../src/data/masterDatabase.json';
import {
  runDegreeAudit,
  getAllCatalogPrograms,
  toCompact
} from '../src/engine/waterfallAudit.js';

const ARCHETYPES = [
  'computer_science_bs',
  'cybersecurity_bs',
  'mathematics_bs',
  'business_administration_bs',
  'psychology_bs',
  'theatre_bfa_acting_emphasis',
  'data_science_bs'
];

describe('Synthetic Audit Stress & Specificity Hierarchy Benchmark Suite', () => {
  const allPrograms = getAllCatalogPrograms(masterDb);
  const progMap = new Map(allPrograms.map((p) => [p.id, p]));

  describe('1. 100-Student Synthetic Audit Stress Benchmark', () => {
    it('executes 100 diverse audits across 2024-2027 catalogs in under 2000ms with zero errors', () => {
      const audits = [];
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        // Distribute: 34 students in 2024-2025, 33 in 2025-2026, 33 in 2026-2027
        const yrSuffix = i < 34 ? '2024' : i < 67 ? '2025' : '2026';
        const catalogYear =
          yrSuffix === '2024' ? '2024-2025' : yrSuffix === '2025' ? '2025-2026' : '2026-2027';

        const arch = ARCHETYPES[i % ARCHETYPES.length];
        const primaryProg = progMap.get(`${arch}_${yrSuffix}`);
        expect(primaryProg).toBeDefined();

        const profile = i % 5;
        const validCourses = [];

        if (profile === 0) {
          // Profile 0: Freshman (0 credits)
        } else if (profile === 1) {
          // Profile 1: Transfer with Missouri CORE 42 waiver (60 credits)
          for (let j = 1; j <= 20; j++) {
            validCourses.push({
              code: `TR ${10000 + j}`,
              compactCode: `TR${10000 + j}`,
              department: 'TR',
              number: 10000 + j,
              level: 10000 + j,
              credits: 3,
              grade: 'TR',
              state: 'TR'
            });
          }
        } else if (profile === 2) {
          // Profile 2: Sophomore / Junior with mixed Completed / In-Progress / Scheduled
          validCourses.push(
            {
              code: 'ART 13600',
              compactCode: 'ART13600',
              department: 'ART',
              number: 13600,
              level: 13600,
              title: 'GE-HC: Arts',
              credits: 3,
              grade: 'A',
              state: 'Completed'
            },
            {
              code: 'PHL 10000',
              compactCode: 'PHL10000',
              department: 'PHL',
              number: 10000,
              level: 10000,
              title: 'GE-HC: Humanities',
              credits: 3,
              grade: 'B',
              state: 'Completed'
            },
            {
              code: 'CSC 10100',
              compactCode: 'CSC10100',
              department: 'CSC',
              number: 10100,
              level: 10100,
              credits: 3,
              grade: 'IP',
              state: 'In-Progress',
              operationalStatus: 'IN_PROGRESS'
            },
            {
              code: 'CSC 14400',
              compactCode: 'CSC14400',
              department: 'CSC',
              number: 14400,
              level: 14400,
              credits: 3,
              grade: 'IP',
              state: 'Scheduled',
              operationalStatus: 'SCHEDULED'
            }
          );
          for (let j = 1; j <= 8; j++) {
            validCourses.push({
              code: `GEN ${20000 + j}`,
              compactCode: `GEN${20000 + j}`,
              department: 'GEN',
              number: 20000 + j,
              level: 20000 + j,
              credits: 3,
              grade: 'A',
              state: 'Completed'
            });
          }
        } else if (profile === 3) {
          // Profile 3: Developmental (MTH 09000) and repeated courses
          validCourses.push(
            {
              code: 'MTH 09000',
              compactCode: 'MTH09000',
              department: 'MTH',
              number: 9000,
              level: 9000,
              title: 'Intermediate Algebra',
              credits: 3,
              grade: 'P',
              state: 'Completed'
            },
            {
              code: 'ENG 15000',
              compactCode: 'ENG15000',
              department: 'ENG',
              number: 15000,
              level: 15000,
              title: 'Composition I',
              credits: 3,
              grade: 'F',
              state: 'Completed',
              term: 'Fall 2024'
            },
            {
              code: 'ENG 15000',
              compactCode: 'ENG15000',
              department: 'ENG',
              number: 15000,
              level: 15000,
              title: 'Composition I',
              credits: 3,
              grade: 'A',
              state: 'Completed',
              term: 'Spring 2025'
            },
            {
              code: 'CSC 10100',
              compactCode: 'CSC10100',
              department: 'CSC',
              number: 10100,
              level: 10100,
              credits: 3,
              grade: 'D',
              state: 'Completed',
              term: 'Fall 2024'
            },
            {
              code: 'CSC 10100',
              compactCode: 'CSC10100',
              department: 'CSC',
              number: 10100,
              level: 10100,
              credits: 3,
              grade: 'B',
              state: 'Completed',
              term: 'Spring 2025'
            },
            {
              code: 'ART 13600',
              compactCode: 'ART13600',
              department: 'ART',
              number: 13600,
              level: 13600,
              title: 'GE-HC: Arts',
              credits: 3,
              grade: 'A',
              state: 'Completed'
            },
            {
              code: 'PHL 10000',
              compactCode: 'PHL10000',
              department: 'PHL',
              number: 10000,
              level: 10000,
              title: 'GE-HC: Humanities',
              credits: 3,
              grade: 'A',
              state: 'Completed'
            }
          );
        } else if (profile === 4) {
          // Profile 4: Double Major (target > 120cr)
          validCourses.push(
            {
              code: 'ART 13600',
              compactCode: 'ART13600',
              department: 'ART',
              number: 13600,
              level: 13600,
              title: 'GE-HC: Arts',
              credits: 3,
              grade: 'A',
              state: 'Completed'
            },
            {
              code: 'PHL 10000',
              compactCode: 'PHL10000',
              department: 'PHL',
              number: 10000,
              level: 10000,
              title: 'GE-HC: Humanities',
              credits: 3,
              grade: 'B',
              state: 'Completed'
            },
            {
              code: 'MTH 27100',
              compactCode: 'MTH27100',
              department: 'MTH',
              number: 27100,
              level: 27100,
              credits: 5,
              grade: 'A',
              state: 'Completed'
            },
            {
              code: 'CSC 10100',
              compactCode: 'CSC10100',
              department: 'CSC',
              number: 10100,
              level: 10100,
              credits: 3,
              grade: 'A',
              state: 'Completed'
            },
            {
              code: 'CSC 14400',
              compactCode: 'CSC14400',
              department: 'CSC',
              number: 14400,
              level: 14400,
              credits: 3,
              grade: 'IP',
              state: 'In-Progress',
              operationalStatus: 'IN_PROGRESS'
            }
          );
        }

        const declaredPrograms = [primaryProg];
        if (profile === 4) {
          const secondArch = arch === 'mathematics_bs' ? 'computer_science_bs' : 'mathematics_bs';
          const secProg = progMap.get(`${secondArch}_${yrSuffix}`);
          if (secProg) declaredPrograms.push(secProg);
        }

        const studentRecord = {
          validCourses,
          studentMetadata: {
            studentName: `Synthetic Student ${i + 1}`,
            catalogYear
          }
        };

        const audit = runDegreeAudit({
          studentRecord,
          declaredPrograms,
          catalogDb: masterDb,
          auditOptions: {
            catalogYear,
            core42Completed: profile === 1
          }
        });

        audits.push({ i, profile, validCourses, audit });
      }

      const totalElapsedMs = performance.now() - startTime;
      expect(audits).toHaveLength(100);
      expect(totalElapsedMs).toBeLessThan(2000);

      // Verify Core Invariants across all 100 students
      const validReasons = new Set(['DEVELOPMENTAL', 'REPEATED_ATTEMPT', 'BELOW_MIN_GRADE']);

      for (const { i, profile, validCourses, audit } of audits) {
        // 1. Dynamic Graduation Target >= 120 (and strictly higher for double majors)
        expect(audit.dynamicGraduationTarget).toBeGreaterThanOrEqual(120);
        if (profile === 4) {
          expect(audit.dynamicGraduationTarget).toBeGreaterThan(120);
        }

        // 2. Excluded Courses Ledger Reason Contract
        expect(
          audit.excludedCoursesLedger.every((c) => validReasons.has(c.reason))
        ).toBe(true);
        if (profile === 3) {
          expect(audit.excludedCoursesLedger.length).toBeGreaterThan(0);
          const devCourse = audit.excludedCoursesLedger.find((c) => c.reason === 'DEVELOPMENTAL');
          expect(devCourse).toBeDefined();
          expect(devCourse.code).toBe('MTH 09000');
        }

        // 3. Specificity Hierarchy: ART 13600 & PHL 10000 fulfills Arts bucket
        const hasArtAndPhl =
          validCourses.some((c) => c.compactCode === 'ART13600') &&
          validCourses.some((c) => c.compactCode === 'PHL10000');
        if (hasArtAndPhl) {
          const artsBucket = audit.geBuckets.find((b) => b.bucket_id === 'arts');
          expect(artsBucket).toBeDefined();
          expect(artsBucket.fulfilled).toBe(true);
          expect(audit.artsSatisfied).toBe(true);
        }

        // 4. In-Progress & Scheduled courses never leak into unfulfilledRequirements queue
        const inProgressOrScheduledCodes = new Set(
          validCourses
            .filter(
              (c) =>
                c.operationalStatus === 'IN_PROGRESS' ||
                c.operationalStatus === 'SCHEDULED' ||
                c.state === 'In-Progress' ||
                c.state === 'Scheduled'
            )
            .map((c) => toCompact(c.code))
        );

        for (const unfulfilled of audit.unfulfilledRequirements) {
          const compact = unfulfilled.compactCode || toCompact(unfulfilled.code);
          expect(inProgressOrScheduledCodes.has(compact)).toBe(false);
          expect(['In-Progress', 'Scheduled', 'IN_PROGRESS', 'SCHEDULED']).not.toContain(
            unfulfilled.operationalStatus
          );
          expect(['In-Progress', 'Scheduled', 'IN_PROGRESS', 'SCHEDULED']).not.toContain(
            unfulfilled.state
          );
        }
      }
    });
  });

  describe('2. Specificity Hierarchy (Greedy Allocation Prevention)', () => {
    it('allocates ART 13600 to narrow GE-HC: Arts and PHL 10000 to broad GE-HC: Any, fulfilling both', () => {
      const studentRecord = {
        validCourses: [
          {
            code: 'ART 13600',
            compactCode: 'ART13600',
            department: 'ART',
            number: 13600,
            level: 13600,
            title: 'GE-HC: Arts',
            credits: 3,
            grade: 'A',
            state: 'Completed'
          },
          {
            code: 'PHL 10000',
            compactCode: 'PHL10000',
            department: 'PHL',
            number: 10000,
            level: 10000,
            title: 'GE-HC: Humanities',
            credits: 3,
            grade: 'B',
            state: 'Completed'
          }
        ],
        studentMetadata: { catalogYear: '2026-2027' }
      };

      const csMajor = progMap.get('computer_science_bs_2026');
      const audit = runDegreeAudit({
        studentRecord,
        declaredPrograms: [csMajor],
        catalogDb: masterDb,
        auditOptions: { catalogYear: '2026-2027', core42Completed: false }
      });

      const artsBucket = audit.geBuckets.find((b) => b.bucket_id === 'arts');
      const hc1Bucket = audit.geBuckets.find((b) => b.bucket_id === 'human_culture_1');

      expect(artsBucket).toBeDefined();
      expect(artsBucket.fulfilled).toBe(true);
      expect(artsBucket.matchedCourse?.compactCode).toBe('ART13600');

      expect(hc1Bucket).toBeDefined();
      expect(hc1Bucket.fulfilled).toBe(true);
      expect(hc1Bucket.matchedCourse?.compactCode).toBe('PHL10000');

      expect(audit.artsSatisfied).toBe(true);

      // Verify in 8-Category CORE 42 distribution ledger
      const hfaCategory = audit.generalEducationAudit?.categories?.find(
        (c) => c.id === 'humanities_fine_arts'
      );
      expect(hfaCategory).toBeDefined();
      expect(hfaCategory.subGroups?.arts?.satisfied).toBe(true);
      expect(hfaCategory.subGroups?.humanCulture?.satisfied).toBe(true);
      expect(hfaCategory.artsSatisfied).toBe(true);
    });
  });

  describe('3. Anthology Status Fidelity & Scheduling Contract', () => {
    it('treats IN_PROGRESS and SCHEDULED courses as active credit earners, tentative prereqs, and excludes them from unfulfilled queue', () => {
      const studentRecord = {
        validCourses: [
          {
            code: 'CSC 10100',
            compactCode: 'CSC10100',
            department: 'CSC',
            number: 10100,
            level: 10100,
            title: 'Computer Science I',
            credits: 3,
            grade: 'IP',
            state: 'In-Progress',
            operationalStatus: 'IN_PROGRESS'
          },
          {
            code: 'CSC 14400',
            compactCode: 'CSC14400',
            department: 'CSC',
            number: 14400,
            level: 14400,
            title: 'Computer Science II',
            credits: 3,
            grade: 'IP',
            state: 'Scheduled',
            operationalStatus: 'SCHEDULED'
          }
        ],
        studentMetadata: { catalogYear: '2026-2027' }
      };

      const csMajor = progMap.get('computer_science_bs_2026');
      const audit = runDegreeAudit({
        studentRecord,
        declaredPrograms: [csMajor],
        catalogDb: masterDb,
        auditOptions: { catalogYear: '2026-2027', core42Completed: false }
      });

      // CSC 10100 & CSC 14400 are accounted for in totalEarnedAndEnrolledCredits
      expect(audit.totalEarnedAndEnrolledCredits).toBe(6);

      // Neither CSC 10100 nor CSC 14400 should appear in unfulfilledRequirements
      const unfulfilledCodes = audit.unfulfilledRequirements.map(
        (c) => c.compactCode || toCompact(c.code)
      );
      expect(unfulfilledCodes).not.toContain('CSC10100');
      expect(unfulfilledCodes).not.toContain('CSC14400');
    });
  });

  describe('4. Excluded Courses Ledger Determinism', () => {
    it('classifies developmental, repeated attempt, and failing courses with strict reasons', () => {
      const studentRecord = {
        validCourses: [
          {
            code: 'MTH 09000',
            compactCode: 'MTH09000',
            department: 'MTH',
            number: 9000,
            level: 9000,
            credits: 3,
            grade: 'P',
            state: 'Completed'
          },
          {
            code: 'ENG 15000',
            compactCode: 'ENG15000',
            department: 'ENG',
            number: 15000,
            level: 15000,
            credits: 3,
            grade: 'F',
            state: 'Completed',
            term: 'Fall 2024'
          },
          {
            code: 'ENG 15000',
            compactCode: 'ENG15000',
            department: 'ENG',
            number: 15000,
            level: 15000,
            credits: 3,
            grade: 'A',
            state: 'Completed',
            term: 'Spring 2025'
          },
          {
            code: 'CSC 10100',
            compactCode: 'CSC10100',
            department: 'CSC',
            number: 10100,
            level: 10100,
            credits: 3,
            grade: 'C',
            state: 'Completed',
            term: 'Fall 2024'
          },
          {
            code: 'CSC 10100',
            compactCode: 'CSC10100',
            department: 'CSC',
            number: 10100,
            level: 10100,
            credits: 3,
            grade: 'A',
            state: 'Completed',
            term: 'Spring 2025'
          }
        ],
        studentMetadata: { catalogYear: '2026-2027' }
      };

      const csMajor = progMap.get('computer_science_bs_2026');
      const audit = runDegreeAudit({
        studentRecord,
        declaredPrograms: [csMajor],
        catalogDb: masterDb,
        auditOptions: { catalogYear: '2026-2027', core42Completed: false }
      });

      expect(audit.excludedCoursesLedger).toHaveLength(3);

      const mth090 = audit.excludedCoursesLedger.find((c) => c.code === 'MTH 09000');
      expect(mth090).toBeDefined();
      expect(mth090.reason).toBe('DEVELOPMENTAL');

      const eng150 = audit.excludedCoursesLedger.find(
        (c) => c.code === 'ENG 15000' && c.grade === 'F'
      );
      expect(eng150).toBeDefined();
      expect(eng150.reason).toBe('BELOW_MIN_GRADE');

      const csc101 = audit.excludedCoursesLedger.find(
        (c) => c.code === 'CSC 10100' && c.grade === 'C'
      );
      expect(csc101).toBeDefined();
      expect(csc101.reason).toBe('REPEATED_ATTEMPT');
    });
  });
});
