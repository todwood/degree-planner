"""
Deterministic Engine Verification Script (execution/test_engine.py)
Verifies Phase 2 (Transcript Parser & 42-Credit Waterfall Audit) and
Phase 3 (8-Week Critical-Path Scheduler & Guardrail Engine) across all 3 majors.
"""
import subprocess
import sys
import json
import os

NODE_EVAL_SCRIPT = r"""
import masterDb from './src/data/masterDatabase.json' with { type: 'json' };
import { processRawCourseRecords } from './src/engine/transcriptParser.js';
import { runWaterfallAudit } from './src/engine/waterfallAudit.js';
import { generateOptimalSchedule } from './src/engine/scheduler.js';

const sampleTranscriptRows = [
  { code: 'ENGL 15000', title: 'Beyond the Blank Page', credits: 3, grade: 'A', term: 'Transfer' },
  { code: 'ENGL 17000', title: 'Research and Argumentation', credits: 3, grade: 'B', term: 'Transfer' },
  { code: 'MTH 14100', title: 'Basic Statistics (GE-Math)', credits: 3, grade: 'A', term: '2025FA-I' },
  { code: 'ICS 21300', title: 'Foundations of Information Technology', credits: 3, grade: 'A', term: '2025FA-I' },
  { code: 'ICS 21400', title: 'Foundations of Networking', credits: 3, grade: 'A', term: '2025FA-I' },
  { code: 'ICS 31000', title: 'Foundations of Cybersecurity', credits: 3, grade: 'A', term: '2025FA-II' },
  { code: 'IIT 21500', title: 'Programming Logic and Design', credits: 3, grade: 'B', term: '2025FA-II' },
  { code: 'IIT 22000', title: 'Hardware and Operating Systems', credits: 3, grade: 'A', term: '2026SP-I' },
  { code: 'SOC 10200', title: 'Basic Concepts of Sociology (GE-SocSci / HD)', credits: 3, grade: 'A', term: '2026SP-I' },
  { code: 'REL 20000', title: 'World Religions (GE-HC / HD)', credits: 3, grade: 'A', term: '2026SP-II' }
];

const parsed = processRawCourseRecords(sampleTranscriptRows, { referenceYear: 2026 });

const programIds = [
  'cybersecurity_bs_2026',
  'it_app_dev_bs_2026',
  'it_networking_bs_2026'
];

const results = [];

for (const pid of programIds) {
  const audit = runWaterfallAudit(parsed, pid, masterDb);
  const schedule = generateOptimalSchedule(audit, parsed, {
    startSemester: 'Fall 2026',
    pacingMode: 'Full-Time',
    summerAvailability: 'No Summer'
  });

  results.push({
    programId: pid,
    programName: audit.primaryProgram.name,
    earnedAndEnrolledCredits: audit.policyChecklist.totalCredits.EarnedPlusEnrolled,
    remainingPlannedCredits: audit.policyChecklist.totalCredits.remainingPlanned,
    projectedTotalCredits: audit.policyChecklist.totalCredits.projectedTotal,
    projectedUpperLevelCredits: audit.policyChecklist.upperLevelCredits.projectedTotal,
    univLulWaived: audit.flags.univLulWaived,
    hdSatisfied: audit.policyChecklist.humanDiversity.satisfied,
    activeSemesterCount: schedule.activeSemesterCount,
    projectedGraduationTerm: schedule.projectedGraduationTerm,
    forcedSummerCount: schedule.forcedSummerAlerts.length,
    whatIfSuggestions: schedule.whatIfSuggestions.map((w) => w.title)
  });
}

console.log(JSON.stringify({ status: 'OK', results }, null, 2));
"""

def main():
    workspace_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_EVAL_SCRIPT],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=False
    )
    if proc.returncode != 0:
        print("Node engine verification failed:", proc.stderr, file=sys.stderr)
        sys.exit(1)

    payload = json.loads(proc.stdout)
    assert payload["status"] == "OK"
    for r in payload["results"]:
        assert r["projectedTotalCredits"] >= 120, f"Total credits < 120 for {r['programName']}"
        assert r["projectedUpperLevelCredits"] >= 42, f"Upper level < 42 for {r['programName']}"
        assert r["univLulWaived"] is True
        assert r["hdSatisfied"] is True
        if r["programId"] == "it_app_dev_bs_2026":
            assert r["forcedSummerCount"] >= 1, "Expected IIT 45200 Forced Summer detection"

    print("=== DETERMINISTIC ENGINE VERIFICATION PASSED FOR ALL 3 MAJORS ===")
    print(json.dumps(payload["results"], indent=2))

if __name__ == "__main__":
    main()
