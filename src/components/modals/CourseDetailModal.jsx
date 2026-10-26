import React, { useState, useMemo } from 'react';
import { X, Info, ChevronDown, ChevronUp, BookOpen, Layers } from 'lucide-react';
import { getCourseRecommendations } from '../../utils/courseRecommendations.js';

/**
 * CourseDetailModal / Inspector Slide-Over Drawer
 *
 * Implements Tiered, Institutional-Only Course Recommendations for Screen 3:
 * 1. Concrete Catalog Courses: Renders standard catalog details only. Recommendations return null.
 * 2. Placeholders: Renders placeholder details + "Recommended Institutional Offerings" table.
 * 3. Explanatory Popover Tooltip for peer data explanation.
 * 4. High-Density Recommendations Table with popularity and GPA badges.
 */
export default function CourseDetailModal({
  isOpen,
  course,
  onClose,
  activeProgram = null,
  masterDb = null,
  historicalData = null,
  activeStudentCourses = null
}) {
  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const [expandedCourseCode, setExpandedCourseCode] = useState(null);

  const recommendations = useMemo(() => {
    if (!course) return null;
    return getCourseRecommendations(
      course,
      activeProgram,
      masterDb?.courses,
      historicalData,
      activeStudentCourses
    );
  }, [course, activeProgram, masterDb, historicalData, activeStudentCourses]);

  if (!isOpen || !course) return null;

  const isConcrete = recommendations === null;

  const toggleExpandDescription = (code) => {
    setExpandedCourseCode((prev) => (prev === code ? null : code));
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex justify-end backdrop-blur-2xs transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-modal-title"
    >
      <div className="bg-white w-full max-w-lg md:max-w-xl h-full shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200 flex flex-col justify-between">
        <div className="space-y-4">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-[#857542] uppercase tracking-wider">
                {isConcrete ? 'Course Inspector Drawer' : 'Degree Requirement Inspector'}
              </span>
              {!isConcrete && recommendations?.tierLabel && (
                <span className="text-[10px] font-semibold bg-[#857542]/10 text-[#857542] border border-[#857542]/20 px-2 py-0.5 rounded-full">
                  Tier {recommendations.tier}: {recommendations.tierLabel}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition"
              title="Close Course Inspector"
              aria-label="Close Course Inspector"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Primary Course Banner */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold font-mono text-[#857542] tracking-wide">
                {course.code}
              </span>
              <span className="text-[10px] font-bold bg-neutral-100 text-neutral-700 px-2.5 py-0.5 rounded uppercase tracking-wider">
                {isConcrete ? `Dept: ${course.department || 'General'}` : 'Curriculum Placeholder'}
              </span>
            </div>
            <h3
              id="course-modal-title"
              className="text-xl font-bold text-neutral-900 mt-1 leading-snug"
            >
              {course.title}
            </h3>
          </div>

          <div className="h-px bg-neutral-200 w-full" />

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-neutral-50/80 p-3 rounded-lg border border-neutral-200/80">
            <div>
              <span className="text-neutral-500 block font-medium">Credit Value</span>
              <span className="font-bold font-mono text-neutral-900 text-sm">
                {course.credits !== undefined ? course.credits : 3} cr
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block font-medium">Course Fee</span>
              <span className="font-bold text-neutral-800 text-sm">
                {course.fee_info || course.feeInfo || '$0'}
              </span>
            </div>
          </div>

          {/* Catalog Description */}
          <div className="text-xs">
            <span className="text-neutral-500 block font-semibold mb-1">
              {isConcrete ? 'Catalog Description' : 'Requirement Specification'}
            </span>
            <p className="text-neutral-800 leading-relaxed bg-neutral-50/60 p-3 rounded-lg border border-neutral-200/80 text-[11.5px]">
              {course.description ||
                (isConcrete
                  ? 'Verbatim description pulled from Academic Course Catalog.'
                  : 'Degree curriculum placeholder fulfilling general education or elective graduation requirements.')}
            </p>
          </div>

          {/* Prerequisites & Session Availability (Concrete Only) */}
          {isConcrete && (
            <div className="space-y-2 text-xs pt-1">
              <div>
                <span className="text-neutral-500 block font-semibold">Prerequisites:</span>
                <span className="font-mono text-neutral-800 text-[11.5px]">
                  {course.prereq_display || course.prereqs || 'None'}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block font-semibold">Corequisites:</span>
                <span className="font-mono text-neutral-800 text-[11.5px]">
                  {(course.coreq_codes || []).join(', ') || 'None'}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block font-semibold">Official Session Availability:</span>
                <span className="font-bold text-neutral-800 text-[11.5px]">
                  {(course.offered_sessions || []).join(', ') || 'All Sessions'}
                </span>
              </div>
              {course.assignedSlot && (
                <div>
                  <span className="text-neutral-500 block font-semibold">Currently Scheduled In:</span>
                  <span className="font-bold text-[#857542] text-[11.5px]">
                    {course.assignedSlot} (
                    {course.assignedSlot.includes('16wk')
                      ? '16-Week Full Term Format'
                      : '8-Week Accelerated Session Format'}
                    )
                  </span>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TIERED INSTITUTIONAL COURSE RECOMMENDATIONS (PLACEHOLDERS ONLY)
          ========================================================================= */}
          {!isConcrete && recommendations && (
            <div className="pt-4 border-t border-neutral-200 space-y-3">
              {/* Header with Explanatory Popover Tooltip */}
              <div className="flex items-center justify-between relative">
                <div className="flex items-center space-x-1.5">
                  <BookOpen className="w-4 h-4 text-[#857542]" />
                  <span className="text-xs font-bold text-neutral-900 tracking-wide">
                    Recommended Institutional Offerings
                  </span>
                  {/* Accessible Info Popover Trigger */}
                  <div className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setShowInfoPopover((v) => !v)}
                      onMouseEnter={() => setShowInfoPopover(true)}
                      onMouseLeave={() => setShowInfoPopover(false)}
                      className="p-1 text-neutral-400 hover:text-[#857542] rounded-full hover:bg-neutral-100 transition focus:outline-none focus:ring-1 focus:ring-[#857542]"
                      aria-label="Information about course recommendations"
                      aria-expanded={showInfoPopover}
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>

                    {/* Popover Bubble */}
                    {showInfoPopover && (
                      <div
                        className="absolute z-30 left-0 sm:left-auto sm:right-0 mt-1 w-72 sm:w-80 p-3 bg-neutral-900 text-neutral-100 text-[11px] rounded-lg shadow-xl border border-neutral-700 leading-relaxed animate-in fade-in zoom-in-95 duration-150"
                        role="tooltip"
                      >
                        <p className="font-semibold text-[#B5A36A] mb-1">
                          Peer Fulfillment Metric Standards:
                        </p>
                        <p className="text-neutral-300">
                          Recommendations are generated from institutional completion data of peers
                          who satisfied this requirement. Excludes transfer and test credits. Average
                          GPA is calculated on a 4.0 scale across graded attempts.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-[10px] text-neutral-500 font-mono">
                  {recommendations.length} {recommendations.length === 1 ? 'option' : 'options'} found
                </span>
              </div>

              {/* High-Density Recommendations Table / Card List */}
              {recommendations.length === 0 ? (
                <div className="p-4 text-center rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-500">
                  No matching institutional courses found for this requirement.
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden divide-y divide-neutral-200 text-xs shadow-2xs">
                  {recommendations.map((rec) => {
                    const isExpanded = expandedCourseCode === rec.code;
                    return (
                      <div
                        key={rec.code}
                        className="p-2.5 hover:bg-neutral-50/80 transition flex flex-col space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          {/* Course Code & Title with Clickable Description Trigger */}
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => toggleExpandDescription(rec.code)}
                              className="text-left group flex items-baseline space-x-1.5 truncate max-w-full"
                              title="Click to toggle course description and prerequisites"
                            >
                              <span className="font-mono font-bold text-[#857542] text-[11.5px] group-hover:underline flex-shrink-0">
                                {rec.code}
                              </span>
                              <span className="font-semibold text-neutral-900 text-xs truncate group-hover:text-neutral-700">
                                {rec.title}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3 text-neutral-400 flex-shrink-0 self-center" />
                              ) : (
                                <ChevronDown className="w-3 h-3 text-neutral-400 flex-shrink-0 self-center" />
                              )}
                            </button>
                            <p className="text-[10.5px] text-neutral-500 font-mono mt-0.5">
                              {rec.credits} cr • {rec.typicalOffering}
                            </p>
                          </div>

                          {/* Peer Popularity & GPA Badges */}
                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            {/* Peer Popularity Badge */}
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${
                                rec.completionCount > 0
                                  ? 'bg-[#857542]/10 text-[#857542] border border-[#857542]/25'
                                  : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
                              }`}
                              title={rec.popularityBadge}
                            >
                              {rec.popularityBadge}
                            </span>

                            {/* Average Grade Badge */}
                            <span
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200 whitespace-nowrap font-medium"
                              title={`Average GPA: ${rec.averageGpa !== null ? rec.averageGpa : 'N/A'}`}
                            >
                              {rec.gradeBadge}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Inline Course Description */}
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-neutral-100 bg-neutral-50/70 p-2.5 rounded text-[11px] text-neutral-700 space-y-1.5 animate-in fade-in duration-150">
                            <p className="leading-relaxed">{rec.description}</p>
                            <div className="grid grid-cols-2 gap-2 pt-1 text-[10.5px]">
                              <div>
                                <span className="font-semibold text-neutral-500">Prereqs: </span>
                                <span className="font-mono text-neutral-800">{rec.prereqDisplay}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-neutral-500">Coreqs: </span>
                                <span className="font-mono text-neutral-800">{rec.coreqDisplay}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info note */}
        <div className="pt-4 mt-6 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <span>Advising System • Verified Catalog</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded font-sans text-xs font-semibold transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
