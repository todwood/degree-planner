import React, { useState, useEffect } from 'react';
import HeaderNav from './components/HeaderNav.jsx';
import Screen0Login from './components/Screen0Login.jsx';
import { clearAdvisorSession } from './utils/authHelpers.js';
import Screen1Intake from './components/Screen1Intake.jsx';
import Screen2Audit from './components/Screen2Audit.jsx';
import Screen3ScheduleBoard from './components/Screen3ScheduleBoard.jsx';
import SharedDatabaseModal from './components/SharedDatabaseModal.jsx';
import AdvisorTestingExceptionCard from './components/AdvisorTestingExceptionCard.jsx';
import Footer from './components/Footer.jsx';

import masterDb from './data/masterDatabase.json' with { type: 'json' };
import dbAdapter from './data/dbAdapter.js';
import { runWaterfallAudit, runDegreeAudit } from './engine/waterfallAudit.js';
import { generateOptimalSchedule } from './engine/scheduler.js';
import { processRawCourseRecords } from './engine/transcriptParser.js';

export const DEFAULT_CONSTRAINTS = {
  startSemester: 'Fall 2026',
  modalityPreference: 'No Preference (Flexible)',
  summerAvailability: 'No Summer',
  maxSummerCredits: 6,
  pacingMode: 'Full-Time',
  max8wkCredits: 9,
  max16wkCredits: 18
};

export default function App() {
  // Initialize faculty profile from session storage if active
  const [facultyProfile, setFacultyProfile] = useState(() => {
    try {
      const session = localStorage.getItem('lu_advisor_session');
      if (session) {
        return JSON.parse(session);
      }
    } catch (e) {
      // ignore
    }
    return null;
  });

  const [currentScreen, setCurrentScreen] = useState(() => {
    try {
      const session = localStorage.getItem('lu_advisor_session');
      if (session) return 1;
    } catch (e) {
      // ignore
    }
    return 0;
  });
  const [sharedDbModalOpen, setSharedDbModalOpen] = useState(false);

  // Core application state
  const [parsedTranscript, setParsedTranscript] = useState(null);
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [additionalPrograms, setAdditionalPrograms] = useState([]);
  const [catalogYear, setCatalogYear] = useState('2026-2027');
  const [constraints, setConstraints] = useState(DEFAULT_CONSTRAINTS);
  const [intakeFiles, setIntakeFiles] = useState({
    anthologyFile: null,
    transcriptFile: null,
    degreePlanFile: null,
    optionAAnthologyFile: null,
    optionATranscriptFile: null,
    activeOption: 'B'
  });

  const [auditResult, setAuditResult] = useState(null);
  const [auditOptions, setAuditOptions] = useState({
    mathPlacementMet: true,
    incomingTransfers: [],
    advisorOverrides: {},
    requirementNotes: {}
  });
  const [schedule, setSchedule] = useState(null);
  const [intakeKey, setIntakeKey] = useState(0);

  // Initialize offline local database adapter on mount
  useEffect(() => {
    dbAdapter.initDatabase().catch(console.error);
  }, []);

  // Handle Screen 0 Login Success
  const handleLoginSuccess = (profile) => {
    setFacultyProfile(profile);
    setCurrentScreen(1);
  };

  // Handle Screen 1 Intake Completion
  const handleIntakeComplete = ({
    parsedTranscript: parsed,
    selectedProgramId: progId,
    additionalPrograms: addProgs,
    core42Completed: c42,
    constraints: c,
    directToSchedule = false
  }) => {
    setParsedTranscript(parsed);
    setSelectedProgramId(progId);
    setConstraints(c);
    if (addProgs) setAdditionalPrograms(addProgs);
    if (parsed?.studentMetadata?.catalogYear) {
      setCatalogYear(parsed.studentMetadata.catalogYear);
    }

    const isCore42 = Boolean(c42 ?? parsed?.studentMetadata?.core42Completed ?? c?.core42Completed);

    // Run deterministic Waterfall & Multi-Program Degree Audit
    const declared = [progId, ...(addProgs || [])].filter(Boolean);
    const audit = runDegreeAudit({
      studentRecord: parsed,
      declaredPrograms: declared,
      catalogDb: masterDb,
      auditOptions: {
        mathPlacementMet: true,
        core42Completed: isCore42,
        catalogYear: parsed?.studentMetadata?.catalogYear || catalogYear
      }
    });
    audit.programLedgers = audit.programAudits;
    setAuditResult(audit);

    // Pre-generate schedule immediately so Screen 3 is ready without roadblocks
    try {
      const sched = generateOptimalSchedule(audit, parsed, c);
      setSchedule(sched);
    } catch (err) {
      console.error('Error pre-generating schedule:', err);
    }

    setCurrentScreen(directToSchedule ? 3 : 2);
  };

  // Handle Screen 1 Option A Reload from PDF state
  const handleReloadPdfState = (extractedState) => {
    const targetProgId = extractedState.primaryProgram?.id || selectedProgramId;
    const targetConstraints = extractedState.constraints || constraints;

    if (extractedState.primaryProgram?.id) {
      setSelectedProgramId(extractedState.primaryProgram.id);
    }
    if (extractedState.primaryProgram?.catalog_year_id) {
      setCatalogYear(extractedState.primaryProgram.catalog_year_id);
    }
    if (extractedState.constraints) {
      setConstraints(extractedState.constraints);
    }

    // If newer Anthology/Transcript records were uploaded in Option A, run full audit & schedule on them
    if (extractedState.parsedTranscript) {
      setParsedTranscript(extractedState.parsedTranscript);
      const declared = [targetProgId, ...(additionalPrograms || [])].filter(Boolean);
      const updatedAudit = runDegreeAudit({
        studentRecord: extractedState.parsedTranscript,
        declaredPrograms: declared,
        catalogDb: masterDb,
        auditOptions: {
          mathPlacementMet: true,
          core42Completed: Boolean(extractedState.parsedTranscript?.studentMetadata?.core42Completed),
          catalogYear: extractedState.parsedTranscript?.studentMetadata?.catalogYear || catalogYear
        }
      });
      updatedAudit.programLedgers = updatedAudit.programAudits;
      setAuditResult(updatedAudit);
      try {
        const updatedSched = generateOptimalSchedule(
          updatedAudit,
          extractedState.parsedTranscript,
          targetConstraints
        );
        setSchedule(updatedSched);
      } catch (err) {
        console.error('Error regenerating schedule in Option A:', err);
        if (extractedState.schedule) setSchedule(extractedState.schedule);
      }
      setCurrentScreen(2);
      return;
    }

    if (extractedState.studentMetadata) {
      const history =
        extractedState.auditResult?.normalizedHistory ||
        extractedState.auditResult?.allStudentCourses ||
        [];
      setParsedTranscript({
        studentMetadata: extractedState.studentMetadata,
        validCourses: history,
        completedCourses: history.filter((c) => c.state === 'Complete' || c.state === 'Transfer'),
        currentCourses: history.filter((c) => c.state === 'Current' || c.state === 'Scheduled'),
        summary: extractedState.auditResult?.policyChecklist?.totalCredits || {}
      });
    }
    if (extractedState.auditResult) {
      setAuditResult(extractedState.auditResult);
    }
    if (extractedState.schedule) {
      setSchedule(extractedState.schedule);
      setCurrentScreen(3);
    } else {
      setCurrentScreen(2);
    }
  };

  // Update audit options (e.g. adding incoming transfer placeholder, overrides, or notes)
  const handleUpdateAuditOptions = (newOptions) => {
    const mergedOptions = {
      ...auditOptions,
      ...newOptions,
      advisorOverrides: {
        ...(auditOptions.advisorOverrides || {}),
        ...(newOptions.advisorOverrides || {})
      },
      requirementNotes: {
        ...(auditOptions.requirementNotes || {}),
        ...(newOptions.requirementNotes || {})
      }
    };
    setAuditOptions(mergedOptions);
    const declared = [selectedProgramId, ...(additionalPrograms || [])].filter(Boolean);
    const updatedAudit = runDegreeAudit({
      studentRecord: parsedTranscript,
      declaredPrograms: declared,
      catalogDb: masterDb,
      auditOptions: {
        catalogYear,
        ...mergedOptions
      }
    });
    updatedAudit.programLedgers = updatedAudit.programAudits;
    updatedAudit.incomingTransfers = mergedOptions.incomingTransfers || [];
    updatedAudit.advisorOverrides = mergedOptions.advisorOverrides || {};
    updatedAudit.requirementNotes = mergedOptions.requirementNotes || {};
    setAuditResult(updatedAudit);
  };

  // Proceed from Screen 2 Audit to Screen 3 Schedule
  const handleProceedToSchedule = (handoffPayload) => {
    try {
      let activeAudit = auditResult;
      if (handoffPayload) {
        activeAudit = {
          ...auditResult,
          activeTrackMode: handoffPayload.activeTrackMode || 'COMMITTED',
          activeTrackId: handoffPayload.activeTrackId || auditResult?.activeTrackId,
          primaryRemainingQueue: handoffPayload.primaryRemainingQueue || auditResult?.remainingCourseItems,
          secondaryRemainingQueue: handoffPayload.secondaryRemainingQueue || null,
          remainingCourseItems: handoffPayload.primaryRemainingQueue || auditResult?.remainingCourseItems
        };
        setAuditResult(activeAudit);
      }
      const sched = generateOptimalSchedule(activeAudit, parsedTranscript, constraints);
      setSchedule(sched);
      setCurrentScreen(3);
    } catch (err) {
      console.error('Error generating optimal schedule:', err);
      if (schedule) {
        setCurrentScreen(3);
      }
    }
  };

  // Update constraints from Screen 3 (e.g. applying What-If accelerator suggestion)
  const handleUpdateConstraints = (nextConstraints) => {
    const merged = { ...constraints, ...nextConstraints };
    setConstraints(merged);
    if (auditResult && parsedTranscript) {
      try {
        const sched = generateOptimalSchedule(auditResult, parsedTranscript, merged);
        setSchedule(sched);
      } catch (err) {
        console.error('Error updating schedule constraints:', err);
      }
    }
  };

  // Clear active student record, reset intake form, and return to Screen 1
  const handleClearActiveRecord = () => {
    setParsedTranscript(null);
    setAuditResult(null);
    setSchedule(null);
    setAuditOptions({
      mathPlacementMet: true,
      incomingTransfers: [],
      advisorOverrides: {},
      requirementNotes: {}
    });
    setSelectedProgramId(null);
    setAdditionalPrograms([]);
    setCatalogYear('2026-2027');
    setConstraints({ ...DEFAULT_CONSTRAINTS });
    setIntakeFiles({
      anthologyFile: null,
      transcriptFile: null,
      degreePlanFile: null,
      optionAAnthologyFile: null,
      optionATranscriptFile: null,
      activeOption: 'B'
    });
    setIntakeKey((k) => k + 1);
    setCurrentScreen(1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-[#111111]">
      {/* Global Navigation Header (Always visible when logged in) */}
      {facultyProfile ? (
        <HeaderNav
          facultyProfile={facultyProfile}
          currentScreen={currentScreen}
          setCurrentScreen={setCurrentScreen}
          activeStudentName={
            parsedTranscript?.studentMetadata?.name ||
            parsedTranscript?.studentMetadata?.student_name ||
            schedule?.studentMetadata?.name ||
            null
          }
          onLogout={() => {
            clearAdvisorSession();
            setFacultyProfile(null);
            handleClearActiveRecord();
            setCurrentScreen(0);
          }}
          onOpenSharedDb={() => setSharedDbModalOpen(true)}
          onClearActiveRecord={handleClearActiveRecord}
        />
      ) : (
        <header className="bg-black text-white h-16 border-b-[3px] border-[#B5A36A] flex items-center justify-between px-6 sticky top-0 z-50">
          <div className="flex items-center space-x-3">
            <img src="./assets/logos/lu-primary-reversed.svg" alt="Lindenwood University" className="h-9 w-auto" />
            <span className="font-display font-extrabold text-white text-base">Academic Degree Planner</span>
          </div>
          <span className="text-xs text-[#B5A36A] font-bold">Faculty Access Required</span>
        </header>
      )}

      {/* Main Screen Router */}
      <main className="flex-1 pb-16">
        {!facultyProfile || currentScreen === 0 ? (
          <Screen0Login onLoginSuccess={handleLoginSuccess} />
        ) : currentScreen === 1 ? (
          <Screen1Intake
            key={intakeKey}
            masterDb={masterDb}
            facultyProfile={facultyProfile}
            onIntakeComplete={handleIntakeComplete}
            onReloadPdfState={handleReloadPdfState}
            parsedTranscript={parsedTranscript}
            auditResult={auditResult}
            selectedProgramId={selectedProgramId}
            onSelectProgramId={setSelectedProgramId}
            constraints={constraints}
            onUpdateConstraints={setConstraints}
            catalogYear={catalogYear}
            onUpdateCatalogYear={setCatalogYear}
            additionalPrograms={additionalPrograms}
            onUpdateAdditionalPrograms={setAdditionalPrograms}
            intakeFiles={intakeFiles}
            onUpdateIntakeFiles={setIntakeFiles}
            onClearActiveRecord={handleClearActiveRecord}
          />
        ) : currentScreen === 2 ? (
          auditResult ? (
            <Screen2Audit
              auditResult={auditResult}
              auditOptions={auditOptions}
              parsedTranscript={parsedTranscript}
              masterDb={masterDb}
              onUpdateAuditOptions={handleUpdateAuditOptions}
              onProceedToSchedule={handleProceedToSchedule}
              onBackToIntake={() => setCurrentScreen(1)}
              facultyProfile={facultyProfile}
              constraints={constraints}
              selectedProgramId={selectedProgramId}
              additionalPrograms={additionalPrograms}
              catalogYear={catalogYear}
            />
          ) : (
            <AdvisorTestingExceptionCard
              targetScreen={2}
              onBackToIntake={() => setCurrentScreen(1)}
            />
          )
        ) : currentScreen === 3 ? (
          schedule || auditResult ? (
            <Screen3ScheduleBoard
              schedule={
                schedule ||
                generateOptimalSchedule(auditResult, parsedTranscript, constraints)
              }
              setSchedule={setSchedule}
              auditResult={auditResult}
              parsedTranscript={parsedTranscript}
              constraints={constraints}
              onUpdateConstraints={handleUpdateConstraints}
              facultyProfile={facultyProfile}
              masterDb={masterDb}
              onBackToAudit={() => setCurrentScreen(2)}
              selectedProgramId={selectedProgramId}
              additionalPrograms={additionalPrograms}
              catalogYear={catalogYear}
            />
          ) : (
            <AdvisorTestingExceptionCard
              targetScreen={3}
              onBackToIntake={() => setCurrentScreen(1)}
            />
          )
        ) : (
          <AdvisorTestingExceptionCard
            targetScreen={1}
            onBackToIntake={() => setCurrentScreen(1)}
          />
        )}
      </main>

      {/* Global Minimal Systems Ledger Footer */}
      <Footer />

      {/* Shared Master Database Modal */}
      <SharedDatabaseModal
        isOpen={sharedDbModalOpen}
        onClose={() => setSharedDbModalOpen(false)}
        masterDb={masterDb}
        facultyProfile={facultyProfile}
      />
    </div>
  );
}
