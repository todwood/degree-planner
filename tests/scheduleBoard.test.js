import { describe, it, expect } from 'vitest';
import {
  getDefaultNextSemesterAndSlot,
  executeCourseMove,
  formatSemesterCreditMetric,
  getTermChronologicalRank,
  isTermInPast,
  executePlanRetake,
  executeCancelRetake
} from '../src/components/Screen3ScheduleBoard.jsx';

describe('Screen 3 Schedule Board — Course Movement & Move Modal Suite', () => {
  const sampleSemesters = [
    {
      id: 'fall_2026',
      title: 'Fall 2026',
      season: 'Fall',
      year: 2026,
      totalCredits: 6,
      lanes: {
        'Fall-16wk': [],
        'FA-I': [
          {
            code: 'MTH 14100',
            compactCode: 'MTH14100',
            title: 'Basic Statistics',
            credits: 3,
            locked: false,
            prereq_logic: null
          }
        ],
        'FA-II': [
          {
            code: 'ENGL 15000',
            compactCode: 'ENGL15000',
            title: 'Composition I (GE-Comm)',
            credits: 3,
            locked: false,
            prereq_logic: null
          }
        ]
      }
    },
    {
      id: 'spring_2027',
      title: 'Spring 2027',
      season: 'Spring',
      year: 2027,
      totalCredits: 3,
      lanes: {
        'Spring-16wk': [],
        'SP-I': [
          {
            code: 'ENGL 17000',
            compactCode: 'ENGL17000',
            title: 'Composition II (GE-Comm)',
            credits: 3,
            locked: false,
            prereq_logic: {
              op: 'OR',
              items: [{ code: 'ENGL 15000' }, { code: 'EPP 15000' }]
            }
          }
        ],
        'SP-II': []
      }
    },
    {
      id: 'summer_2027',
      title: 'Summer 2027',
      season: 'Summer',
      year: 2027,
      totalCredits: 0,
      lanes: {
        SU: []
      }
    },
    {
      id: 'fall_2027',
      title: 'Fall 2027',
      season: 'Fall',
      year: 2027,
      totalCredits: 0,
      lanes: {
        'Fall-16wk': [],
        'FA-I': [],
        'FA-II': []
      }
    }
  ];

  const sampleSchedule = {
    id: 'test_sched',
    semesters: sampleSemesters
  };

  describe('1. Move Modal Target Semester & Session Selection', () => {
    it('defaults target semester to the immediate chronologically next semester', () => {
      // From Fall 2026 (index 0) -> Spring 2027 (index 1)
      const fromFall = getDefaultNextSemesterAndSlot(sampleSemesters, 'fall_2026', 'FA-I');
      expect(fromFall.targetSemId).toBe('spring_2027');
      expect(fromFall.targetSlotKey).toBe('SP-I');

      // From Spring 2027 (index 1) -> Summer 2027 (index 2)
      const fromSpring = getDefaultNextSemesterAndSlot(sampleSemesters, 'spring_2027', 'SP-I');
      expect(fromSpring.targetSemId).toBe('summer_2027');
      expect(fromSpring.targetSlotKey).toBe('SU');

      // From Summer 2027 (index 2) -> Fall 2027 (index 3)
      const fromSummer = getDefaultNextSemesterAndSlot(sampleSemesters, 'summer_2027', 'SU');
      expect(fromSummer.targetSemId).toBe('fall_2027');
      expect(fromSummer.targetSlotKey).toBe('FA-I');
    });

    it('loops back cleanly to an available alternative semester when course sits in the final semester', () => {
      // From Fall 2027 (final index) -> defaults to first available other semester (Fall 2026)
      const fromFinal = getDefaultNextSemesterAndSlot(sampleSemesters, 'fall_2027', 'FA-I');
      expect(fromFinal.targetSemId).toBe('fall_2026');
      expect(fromFinal.targetSlotKey).toBe('FA-I');
    });

    it('preserves session format when transitioning between 16-week and 8-week sessions', () => {
      // 16-week in Fall -> 16-week in Spring
      const from16 = getDefaultNextSemesterAndSlot(sampleSemesters, 'fall_2026', 'Fall-16wk');
      expect(from16.targetSlotKey).toBe('Spring-16wk');

      // Session II in Fall -> Session II in Spring
      const fromSlot2 = getDefaultNextSemesterAndSlot(sampleSemesters, 'fall_2026', 'FA-II');
      expect(fromSlot2.targetSlotKey).toBe('SP-II');
    });
  });

  describe('2. Deterministic executeCourseMove Execution', () => {
    it('successfully relocates a course across semesters, updating credit totals and lane arrays accurately', () => {
      const result = executeCourseMove(
        sampleSchedule,
        'MTH 14100',
        'fall_2026',
        'FA-I',
        'spring_2027',
        'SP-II',
        []
      );

      expect(result.success).toBe(true);

      const nextSemesters = result.nextSchedule.semesters;
      const nextFall = nextSemesters.find((s) => s.id === 'fall_2026');
      const nextSpring = nextSemesters.find((s) => s.id === 'spring_2027');

      // Fall 2026 loses MTH 14100 (6cr -> 3cr)
      expect(nextFall.totalCredits).toBe(3);
      expect(nextFall.lanes['FA-I']).toHaveLength(0);

      // Spring 2027 gains MTH 14100 in SP-II (3cr -> 6cr)
      expect(nextSpring.totalCredits).toBe(6);
      expect(nextSpring.lanes['SP-II']).toHaveLength(1);
      expect(nextSpring.lanes['SP-II'][0].code).toBe('MTH 14100');
      expect(nextSpring.lanes['SP-II'][0].assignedSemesterId).toBe('spring_2027');
      expect(nextSpring.lanes['SP-II'][0].assignedSlot).toBe('SP-II');
      expect(nextSpring.lanes['SP-II'][0].sessionFormat).toBe('8-Week Accelerated Session');
    });

    it('handles intra-semester moves between sessions without mutating semester credit totals', () => {
      const result = executeCourseMove(
        sampleSchedule,
        'MTH 14100',
        'fall_2026',
        'FA-I',
        'fall_2026',
        'FA-II',
        []
      );

      expect(result.success).toBe(true);

      const nextFall = result.nextSchedule.semesters.find((s) => s.id === 'fall_2026');
      expect(nextFall.totalCredits).toBe(6); // 6 credits remains unchanged
      expect(nextFall.lanes['FA-I']).toHaveLength(0);
      expect(nextFall.lanes['FA-II']).toHaveLength(2); // ENGL 15000 + MTH 14100
      expect(nextFall.lanes['FA-II'].map((c) => c.code)).toEqual(['ENGL 15000', 'MTH 14100']);
    });

    it('rejects moves when the course is locked', () => {
      const lockedSchedule = {
        ...sampleSchedule,
        semesters: sampleSemesters.map((sem) => {
          if (sem.id === 'fall_2026') {
            return {
              ...sem,
              lanes: {
                ...sem.lanes,
                'FA-I': [{ ...sem.lanes['FA-I'][0], locked: true }]
              }
            };
          }
          return sem;
        })
      };

      const result = executeCourseMove(
        lockedSchedule,
        'MTH 14100',
        'fall_2026',
        'FA-I',
        'spring_2027',
        'SP-I',
        []
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('COURSE_LOCKED');
    });

    it('rejects moves when source and target slot are identical', () => {
      const result = executeCourseMove(
        sampleSchedule,
        'MTH 14100',
        'fall_2026',
        'FA-I',
        'fall_2026',
        'FA-I',
        []
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('SAME_SLOT');
    });

    it('detects prerequisite conflicts when moving a course prior to its prerequisite', () => {
      // ENGL 17000 in Spring 2027 requires ENGL 15000 (currently in Fall 2026 FA-II).
      // If we move ENGL 17000 backward into Fall 2026 FA-I (before ENGL 15000 in FA-II):
      const result = executeCourseMove(
        sampleSchedule,
        'ENGL 17000',
        'spring_2027',
        'SP-I',
        'fall_2026',
        'FA-I',
        []
      );

      expect(result.success).toBe(true);
      expect(result.validation.hasConflict).toBe(true);
      expect(result.conflictDot).not.toBeNull();
      expect(result.conflictDot.conflicts.some((c) => c.type === 'PREREQUISITE_UNMET')).toBe(true);
    });
  });

  describe('3. Semester Credit Counter Metrics (formatSemesterCreditMetric)', () => {
    it('formats future / inactive semesters strictly as "## Pending Credits"', () => {
      const futureSem = {
        id: 'spring_2028',
        isEnrolledSemester: false,
        hasEnrolledCourses: false,
        totalCredits: 15,
        lanes: {
          'Spring-16wk': [],
          'SP-I': [{ code: 'CSC 10100', credits: 3 }, { code: 'CSC 10200', credits: 3 }],
          'SP-II': [{ code: 'CSC 20100', credits: 3 }, { code: 'CSC 20200', credits: 3 }, { code: 'CSC 20300', credits: 3 }]
        }
      };

      const result = formatSemesterCreditMetric(futureSem, 0);
      expect(result).toBe('15 Pending Credits');
    });

    it('formats active semester with 0 completed sub-session credits as "## Pending Credits"', () => {
      const activeSem = {
        id: 'fall_2026',
        isEnrolledSemester: true,
        hasEnrolledCourses: true,
        totalCredits: 12,
        lanes: {
          'Fall-16wk': [{ code: 'MTH 14100', credits: 3 }],
          'FA-I': [{ code: 'ICS 10000', credits: 3 }, { code: 'ENG 15000', credits: 3 }],
          'FA-II': [{ code: 'ICS 20000', credits: 3 }]
        }
      };

      const result = formatSemesterCreditMetric(activeSem, 0);
      expect(result).toBe('12 Pending Credits');
    });

    it('formats active semester with completed sub-session credits as "## Pending • ## Complete Credits (## Total)"', () => {
      const activeSem = {
        id: 'fall_2026',
        isEnrolledSemester: true,
        hasEnrolledCourses: true,
        totalCredits: 9,
        lanes: {
          'Fall-16wk': [{ code: 'MTH 14100', credits: 3 }],
          'FA-I': [],
          'FA-II': [{ code: 'ICS 20000', credits: 3 }, { code: 'ENG 17000', credits: 3 }]
        }
      };

      // 3 completed credits from Session I
      const result = formatSemesterCreditMetric(activeSem, 3);
      expect(result).toBe('9 Pending • 3 Complete Credits (12 Total)');
    });
  });

  describe('4. Chronological Ranking & Concluded Past Terms (isTermInPast)', () => {
    it('computes ascending chronological ranks across academic years and seasons', () => {
      const rankFall2025 = getTermChronologicalRank('Fall', 2025);
      const rankSpring2026 = getTermChronologicalRank('Spring', 2026);
      const rankSummer2026 = getTermChronologicalRank('Summer', 2026);
      const rankFall2026 = getTermChronologicalRank('Fall', 2026);
      const rankSpring2027 = getTermChronologicalRank('Spring', 2027);

      expect(rankFall2025).toBeLessThan(rankSpring2026);
      expect(rankSpring2026).toBeLessThan(rankSummer2026);
      expect(rankSummer2026).toBeLessThan(rankFall2026);
      expect(rankFall2026).toBeLessThan(rankSpring2027);
    });

    it('marks preceding terms in academic triad as past when active semester is Spring', () => {
      const activeSem = { season: 'Spring', year: 2027 };

      // In Academic Year 2026–2027:
      // Fall 2026 precedes Spring 2027 -> is past
      expect(isTermInPast('Fall', 2026, activeSem)).toBe(true);
      // Spring 2027 is active -> not in past
      expect(isTermInPast('Spring', 2027, activeSem)).toBe(false);
      // Summer 2027 is future -> not in past
      expect(isTermInPast('Summer', 2027, activeSem)).toBe(false);
      // Fall 2027 is future -> not in past
      expect(isTermInPast('Fall', 2027, activeSem)).toBe(false);
    });

    it('marks preceding Fall and Spring terms as past when active semester is Summer', () => {
      const activeSem = { season: 'Summer', year: 2027 };

      // In Academic Year 2026–2027:
      expect(isTermInPast('Fall', 2026, activeSem)).toBe(true);
      expect(isTermInPast('Spring', 2027, activeSem)).toBe(true);
      expect(isTermInPast('Summer', 2027, activeSem)).toBe(false);
    });

    it('does not mark Fall 2026 as past when Fall 2026 itself is the active semester', () => {
      const activeSem = { season: 'Fall', year: 2026 };

      expect(isTermInPast('Fall', 2026, activeSem)).toBe(false);
      expect(isTermInPast('Spring', 2027, activeSem)).toBe(false);
      // But Fall 2025 from previous academic year is past
      expect(isTermInPast('Fall', 2025, activeSem)).toBe(true);
    });
  });

  describe('5. In-Progress Course Retake Workflow (executePlanRetake & executeCancelRetake)', () => {
    const activeSchedule = {
      id: 'active_sched',
      semesters: [
        {
          id: 'Fall-2026',
          title: 'Fall 2026',
          season: 'Fall',
          year: 2026,
          isEnrolledSemester: true,
          hasEnrolledCourses: true,
          totalCredits: 6,
          lanes: {
            'Fall-16wk': [],
            'FA-I': [
              {
                code: 'ICS 42300',
                compactCode: 'ICS42300',
                title: 'Machine Learning',
                credits: 3,
                locked: true,
                isEnrolled: true,
                state: 'Current'
              }
            ],
            'FA-II': []
          }
        },
        {
          id: 'Spring-2027',
          title: 'Spring 2027',
          season: 'Spring',
          year: 2027,
          totalCredits: 3,
          lanes: {
            'Spring-16wk': [],
            'SP-I': [
              {
                code: 'ICS 41200',
                compactCode: 'ICS41200',
                title: 'Operating Systems',
                credits: 3,
                locked: false
              }
            ],
            'SP-II': []
          }
        }
      ]
    };

    it('plans a retake of active course into the next chronological semester without mutating original course lock', () => {
      const planRes = executePlanRetake(activeSchedule, 'ICS 42300', 'Fall-2026', 'FA-I');
      expect(planRes.success).toBe(true);
      expect(planRes.targetSemId).toBe('Spring-2027');

      const updatedFall = planRes.schedule.semesters.find((s) => s.id === 'Fall-2026');
      const activeCourse = updatedFall.lanes['FA-I'].find((c) => c.code === 'ICS 42300');
      // Active course retains locked and enrolled status, gains planned retake flag
      expect(activeCourse.locked).toBe(true);
      expect(activeCourse.isEnrolled).toBe(true);
      expect(activeCourse.hasPlannedRetake).toBe(true);
      expect(activeCourse.retakeTargetSemId).toBe('Spring-2027');

      // Target semester receives new retake course instance
      const updatedSpring = planRes.schedule.semesters.find((s) => s.id === 'Spring-2027');
      const retakeCourse = updatedSpring.lanes['SP-I'].find((c) => c.code === 'ICS 42300');
      expect(retakeCourse).toBeDefined();
      expect(retakeCourse.isPlannedRetake).toBe(true);
      expect(retakeCourse.locked).toBe(false);
      expect(retakeCourse.state).toBe('Scheduled');
      // Total credits in Spring 2027 increased by 3 (from 3 to 6)
      expect(updatedSpring.totalCredits).toBe(6);
    });

    it('cancels a planned retake and removes the future retake instance while resetting active course state', () => {
      // First plan retake
      const planRes = executePlanRetake(activeSchedule, 'ICS 42300', 'Fall-2026', 'FA-I');
      // Then cancel retake
      const cancelRes = executeCancelRetake(planRes.schedule, 'ICS 42300', 'Fall-2026', 'FA-I');
      expect(cancelRes.success).toBe(true);

      const updatedFall = cancelRes.schedule.semesters.find((s) => s.id === 'Fall-2026');
      const activeCourse = updatedFall.lanes['FA-I'].find((c) => c.code === 'ICS 42300');
      expect(activeCourse.hasPlannedRetake).toBe(false);
      expect(activeCourse.retakeTargetSemId).toBeNull();

      const updatedSpring = cancelRes.schedule.semesters.find((s) => s.id === 'Spring-2027');
      const retakeCourse = updatedSpring.lanes['SP-I'].find((c) => c.code === 'ICS 42300' && c.isPlannedRetake);
      expect(retakeCourse).toBeUndefined();
      // Total credits in Spring 2027 decreased back to 3
      expect(updatedSpring.totalCredits).toBe(3);
    });
  });
});
