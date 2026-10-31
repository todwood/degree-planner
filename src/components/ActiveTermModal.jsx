import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, Edit3, X } from 'lucide-react';
import {
  CANONICAL_TERM_TOKENS,
  CANONICAL_COURSE_STATUSES,
  normalizeTermAbbreviation,
  normalizeActiveCourseStatus
} from '../utils/intakeHelpers.js';

/**
 * Determine display session band label for an active semester course.
 * Kept for backwards compatibility; returns standardized canonical token.
 */
export function getCourseSessionBandLabel(course) {
  return normalizeTermAbbreviation(course);
}

/**
 * Modal A: Active Term Course Editor
 * Allows advisors to modify active term coursework, term band, status, or search catalog.
 */
export default function ActiveTermModal({
  isOpen = false,
  onClose = () => {},
  activeCourses = [],
  initialTerm = 'Fall 2026',
  initialStatus = 'IN_PROGRESS',
  initialModality = 'Traditional (On-Campus)',
  masterDb = null,
  onSave = () => {}
}) {
  const [workingList, setWorkingList] = useState(() =>
    (activeCourses || []).map((c) => ({
      ...c,
      sessionBand: normalizeTermAbbreviation(c),
      term: normalizeTermAbbreviation(c),
      status: normalizeActiveCourseStatus(c),
      state:
        normalizeActiveCourseStatus(c) === 'Completed'
          ? 'Completed'
          : normalizeActiveCourseStatus(c) === 'Scheduled'
          ? 'Scheduled'
          : 'Current'
    }))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [newCourseSessionBand, setNewCourseSessionBand] = useState('FA (16wk)');
  const [newCourseStatus, setNewCourseStatus] = useState('In-Progress');

  // Sync state whenever modal opens or intake defaults change
  useEffect(() => {
    if (isOpen) {
      setWorkingList(
        (activeCourses || []).map((c) => ({
          ...c,
          sessionBand: normalizeTermAbbreviation(c),
          term: normalizeTermAbbreviation(c),
          status: normalizeActiveCourseStatus(c),
          state:
            normalizeActiveCourseStatus(c) === 'Completed'
              ? 'Completed'
              : normalizeActiveCourseStatus(c) === 'Scheduled'
              ? 'Scheduled'
              : 'Current'
        }))
      );
      setSearchQuery('');
      setNewCourseSessionBand('FA (16wk)');
      setNewCourseStatus('In-Progress');
    }
  }, [isOpen, activeCourses]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const all = masterDb?.courses || [];
    const matched = [];
    for (const c of all) {
      if (
        c.code?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.compactCode?.toLowerCase().includes(q)
      ) {
        matched.push(c);
        if (matched.length >= 25) break;
      }
    }
    return matched;
  }, [searchQuery, masterDb]);

  const handleAddCourse = (course) => {
    const compact = (course.compactCode || course.code || '').replace(/\s+/g, '').toUpperCase();
    if (
      workingList.some(
        (c) => (c.compactCode || c.code.replace(/\s+/g, '').toUpperCase()) === compact
      )
    ) {
      return;
    }
    const newCourseObj = {
      ...course,
      compactCode: compact,
      sessionBand: newCourseSessionBand,
      status: newCourseStatus,
      state:
        newCourseStatus === 'Completed'
          ? 'Completed'
          : newCourseStatus === 'Scheduled'
          ? 'Scheduled'
          : 'Current',
      term: newCourseSessionBand,
      semester: initialTerm || 'Fall 2026',
      isActiveTerm: true
    };
    setWorkingList((prev) => [newCourseObj, ...prev]);
  };

  const handleRemoveCourse = (idx) => {
    setWorkingList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    onSave({
      courses: workingList
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-term-modal-title"
    >
      <div
        className="bg-white rounded-2xl border-2 border-[#B5A36A] max-w-3xl w-full p-6 text-neutral-900 shadow-2xl relative space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-3 border-b border-neutral-200 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[#F7F5EE] border border-[#B5A36A]/50 text-[#857542]">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="active-term-modal-title" className="text-base font-extrabold text-neutral-900">
                Edit Active Term &amp; Enrolled Coursework
              </h3>
              <p className="text-xs text-neutral-500">
                Review and adjust session terms and course statuses, or search the catalog to add current and upcoming enrollments.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Section 1: Catalog Course Search (Positioned at Top) */}
          <div className="space-y-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200 shadow-2xs">
            <span className="text-xs font-bold text-neutral-800 uppercase tracking-wide block">
              Search All Catalog Courses to Add
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-6 relative">
                <input
                  type="text"
                  id="active-term-search-input"
                  data-testid="active-term-search-input"
                  placeholder="Search code or title (e.g. MTH 14100, CSC, Ethics)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-[#857542] text-neutral-900 font-medium"
                />
                <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="sm:col-span-3">
                <select
                  id="active-term-search-session"
                  data-testid="active-term-search-session"
                  value={newCourseSessionBand}
                  onChange={(e) => setNewCourseSessionBand(e.target.value)}
                  className="w-full py-2 px-2.5 text-xs bg-white border border-neutral-300 rounded-lg font-semibold text-neutral-800 cursor-pointer focus:outline-none focus:border-[#857542]"
                >
                  {CANONICAL_TERM_TOKENS.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <select
                  id="active-term-search-status"
                  data-testid="active-term-search-status"
                  value={newCourseStatus}
                  onChange={(e) => setNewCourseStatus(e.target.value)}
                  className="w-full py-2 px-2.5 text-xs bg-white border border-neutral-300 rounded-lg font-semibold text-neutral-800 cursor-pointer focus:outline-none focus:border-[#857542]"
                >
                  {CANONICAL_COURSE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Search Results List */}
            {searchQuery.trim().length >= 2 && (
              <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-neutral-100 bg-white shadow-2xs">
                {searchResults.length === 0 ? (
                  <p className="p-3 text-xs text-neutral-400 text-center">
                    No courses found matching &ldquo;{searchQuery}&rdquo;
                  </p>
                ) : (
                  searchResults.map((course) => {
                    const compact = (course.compactCode || course.code || '').replace(/\s+/g, '').toUpperCase();
                    const isAlreadyAdded = workingList.some(
                      (c) => (c.compactCode || c.code.replace(/\s+/g, '').toUpperCase()) === compact
                    );
                    return (
                      <div
                        key={course.code}
                        className="p-2.5 flex items-center justify-between gap-2 hover:bg-[#F7F5EE]/60 transition"
                      >
                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-mono font-bold text-xs text-neutral-900 mr-2">
                            {course.code}
                          </span>
                          <span className="text-xs text-neutral-700 truncate">{course.title}</span>
                          <span className="text-[10px] font-mono text-neutral-500 ml-2">
                            ({Math.round(course.credits || 3)}cr)
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={isAlreadyAdded}
                          onClick={() => handleAddCourse(course)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg transition disabled:bg-neutral-100 disabled:text-neutral-400 bg-[#857542] hover:bg-[#6E6035] text-white flex-shrink-0 cursor-pointer"
                        >
                          {isAlreadyAdded ? 'Added' : '+ Add'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Section 2: Active Enrolled Courses List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-800 uppercase tracking-wide">
                Enrolled Active Courses ({workingList.length})
              </span>
              <span className="font-mono text-neutral-600 font-semibold text-[11px]">
                Total: {workingList.reduce((sum, c) => sum + (Number(c.credits) || 0), 0)} cr
              </span>
            </div>

            {workingList.length === 0 ? (
              <div className="p-4 border-2 border-dashed border-neutral-200 rounded-xl text-center text-xs text-neutral-400">
                No active term courses currently enrolled. Search the catalog above to add courses.
              </div>
            ) : (
              <div className="space-y-2">
                {workingList.map((c, idx) => {
                  const currentBand = c.sessionBand || normalizeTermAbbreviation(c);
                  const currentStatus = c.status || normalizeActiveCourseStatus(c);

                  return (
                    <div
                      key={`${c.code}-${idx}`}
                      className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-neutral-900">{c.code}</span>
                          <span className="text-[10px] font-mono text-neutral-500 bg-white px-1.5 py-0.5 rounded border border-neutral-200">
                            {Math.round(c.credits || 3)} cr
                          </span>
                        </div>
                        <p className="text-xs text-neutral-700 truncate mt-0.5">{c.title}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                        {/* Term Band Selector */}
                        <select
                          data-testid={`active-term-select-${idx}`}
                          value={currentBand}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWorkingList((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, sessionBand: val, term: val } : item
                              )
                            );
                          }}
                          className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800 cursor-pointer shadow-2xs focus:outline-none focus:border-[#857542]"
                        >
                          {CANONICAL_TERM_TOKENS.map((token) => (
                            <option key={token} value={token}>
                              {token}
                            </option>
                          ))}
                        </select>

                        {/* Status Selector */}
                        <select
                          data-testid={`active-status-select-${idx}`}
                          value={currentStatus}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWorkingList((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? {
                                      ...item,
                                      status: val,
                                      state:
                                        val === 'Completed'
                                          ? 'Completed'
                                          : val === 'Scheduled'
                                          ? 'Scheduled'
                                          : 'Current'
                                    }
                                  : item
                              )
                            );
                          }}
                          className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800 cursor-pointer shadow-2xs focus:outline-none focus:border-[#857542]"
                        >
                          {CANONICAL_COURSE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          data-testid={`remove-active-course-${idx}`}
                          onClick={() => handleRemoveCourse(idx)}
                          className="p-1.5 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 transition cursor-pointer font-bold text-xs"
                          title="Remove course"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-neutral-200 flex items-center justify-end space-x-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            id="save-active-term-btn"
            data-testid="save-active-term-btn"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded-lg shadow-sm transition cursor-pointer"
          >
            Save &amp; Apply Active Changes
          </button>
        </div>
      </div>
    </div>
  );
}
