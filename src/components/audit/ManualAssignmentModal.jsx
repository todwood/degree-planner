import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, X, Check } from 'lucide-react';
import { toCompact } from '../../engine/waterfallAudit.js';

/**
 * Directive C: "Set to Complete" Manual Assignment Modal
 *
 * Provides:
 * 1. Special Exemption Option (Top):
 *    "🛡️ Student is Exempted (Policy Exemption Form Filed)"
 * 2. Student Course Roster:
 *    Completed, in-progress, and scheduled student courses with:
 *    "[Code] · [Title] (already matched to [Requirement Name])"
 * 3. GE Double-Dip Policy Warning:
 *    "⚠️ General Education Policy: Each GE course may satisfy only one distribution category (except for the /HD Human Diversity tag)."
 * 4. Submitting sets override (marking row ✓ Exempted or ✓ Manually Matched).
 */
export default function ManualAssignmentModal({
  isOpen = false,
  onClose = () => {},
  onAssign = () => {},
  reqKey = '',
  reqCode = '',
  reqTitle = 'Degree Requirement',
  isGEPanel = false,
  studentCourses = [],
  courseMatchedMap = {}
}) {
  const [selectedType, setSelectedType] = useState('EXEMPTION'); // 'EXEMPTION' or 'COURSE'
  const [selectedCourseCode, setSelectedCourseCode] = useState('');

  if (!isOpen) return null;

  const selectedCourse = studentCourses.find(
    (c) => c.code === selectedCourseCode || toCompact(c.code) === toCompact(selectedCourseCode)
  );

  const matchedRequirementForSelected = selectedCourse
    ? courseMatchedMap[selectedCourse.code] || courseMatchedMap[toCompact(selectedCourse.code)]
    : null;

  const isSelectedAlreadyMatched = Boolean(matchedRequirementForSelected);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (selectedType === 'EXEMPTION') {
      onAssign({
        type: 'EXEMPTION',
        note: 'Policy Exemption Form Filed',
        credits: 0,
        reqKey,
        reqCode,
        reqTitle
      });
      onClose();
      return;
    }

    if (selectedType === 'COURSE' && selectedCourse) {
      onAssign({
        type: 'MANUAL_MATCH',
        course: selectedCourse,
        note: 'Manually Matched',
        credits: Number(selectedCourse.credits) || 3,
        reqKey,
        reqCode,
        reqTitle,
        warning: isGEPanel && isSelectedAlreadyMatched ? 'GE Double-Dip Override' : null
      });
      onClose();
    }
  };

  return (
    <div
      data-testid="manual-assignment-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-xl w-full p-6 text-neutral-900 relative space-y-5 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span>Set Requirement to Complete</span>
            </h3>
            <p className="text-xs text-neutral-600 mt-0.5">
              Target: <strong className="text-neutral-900">{reqCode ? `${reqCode} · ` : ''}{reqTitle}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          {/* Top Option: Special Policy Exemption Form */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
              Administrative Exemption / Waiver
            </span>
            <label
              data-testid="exemption-option"
              className={`p-3.5 rounded-lg border cursor-pointer block transition ${
                selectedType === 'EXEMPTION'
                  ? 'bg-[#FDFBF7] border-[#857542] ring-1 ring-[#857542]'
                  : 'bg-white border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-start space-x-3">
                <input
                  type="radio"
                  name="manualAssignmentOption"
                  value="__EXEMPTION__"
                  checked={selectedType === 'EXEMPTION'}
                  onChange={() => {
                    setSelectedType('EXEMPTION');
                    setSelectedCourseCode('');
                  }}
                  className="mt-1 text-[#857542] focus:ring-[#857542]"
                />
                <div>
                  <span className="font-bold text-neutral-900 text-xs flex items-center gap-1.5">
                    <span>🛡️ Student is Exempted (Policy Exemption Form Filed)</span>
                  </span>
                  <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                    Sets row to <strong className="text-emerald-800">✓ Exempted</strong> (0 earned credits, satisfies requirement via Dean/Chair waiver).
                  </p>
                </div>
              </div>
            </label>
          </div>

          {/* Student Course Roster */}
          <div className="space-y-2 pt-2 border-t border-neutral-100">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                Student Course Roster ({studentCourses.length} Courses)
              </span>
              <span className="text-[11px] text-neutral-400">
                Completed, in-progress, or scheduled
              </span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto border border-neutral-200 rounded-lg p-2 bg-neutral-50/50">
              {studentCourses.length > 0 ? (
                studentCourses.map((c) => {
                  const alreadyMatchedReq = courseMatchedMap[c.code] || courseMatchedMap[toCompact(c.code)];
                  const isSelected = selectedType === 'COURSE' && selectedCourseCode === c.code;

                  return (
                    <label
                      key={c.code}
                      data-testid={`course-option-${c.code}`}
                      className={`p-2.5 rounded-md border text-xs cursor-pointer block transition ${
                        isSelected
                          ? 'bg-white border-[#857542] ring-1 ring-[#857542] shadow-2xs'
                          : 'bg-white border-neutral-200 hover:bg-neutral-100/70'
                      }`}
                    >
                      <div className="flex items-start space-x-2.5">
                        <input
                          type="radio"
                          name="manualAssignmentOption"
                          value={c.code}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedType('COURSE');
                            setSelectedCourseCode(c.code);
                          }}
                          className="mt-0.5 text-[#857542] focus:ring-[#857542]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-neutral-900">{c.code}</span>
                            <span className="text-neutral-700">· {c.title}</span>
                            <span className="text-neutral-500 font-mono text-[11px]">({c.credits || 3}cr)</span>
                            {c.grade && (
                              <span className="px-1 py-0.2 rounded bg-neutral-100 text-neutral-700 font-mono text-[10px]">
                                {c.grade}
                              </span>
                            )}
                          </div>
                          {alreadyMatchedReq && (
                            <div className="mt-1 text-[10.5px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded inline-block">
                              (already matched to {alreadyMatchedReq})
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-neutral-500 italic">
                  No courses found in student records.
                </div>
              )}
            </div>
          </div>

          {/* General Education Double-Dip Policy Warning */}
          {isGEPanel && isSelectedAlreadyMatched && (
            <div
              data-testid="double-dip-warning"
              className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs font-semibold flex items-start space-x-2 animate-in fade-in duration-100"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="leading-snug">
                <span>⚠️ General Education Policy: Each GE course may satisfy only one distribution category (except for the /HD Human Diversity tag).</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-neutral-100 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="submit-assignment-btn"
            disabled={selectedType === 'COURSE' && !selectedCourse}
            onClick={handleSubmit}
            className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded shadow transition flex items-center space-x-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Confirm &amp; Apply Override</span>
          </button>
        </div>
      </div>
    </div>
  );
}
