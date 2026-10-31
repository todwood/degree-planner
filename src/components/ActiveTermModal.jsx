import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, Edit3, X, Calendar, Activity, Laptop } from 'lucide-react';

/**
 * Determine display session band label for an active semester course.
 */
export function getCourseSessionBandLabel(course) {
  if (!course) return 'Full 16-Week';
  if (course.sessionBand) return course.sessionBand;
  const rawTerm = String(course.session || course.term || course.semester || course.termId || '').toUpperCase();
  if (/_II\b|SESSION\s*II|8-?WK\s*II|FA-II|SP-II/i.test(rawTerm)) {
    return 'Session II 8-Week';
  }
  if (/_I\b|SESSION\s*I\b|8-?WK\s*I\b|FA-I|SP-I/i.test(rawTerm)) {
    return 'Session I 8-Week';
  }
  return 'Full 16-Week';
}

/**
 * Modal A: Active Term Course Editor
 * Allows advisors to modify active term coursework, term band, status, and modality.
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
  const [selectedTerm, setSelectedTerm] = useState(initialTerm || 'Fall 2026');
  const [selectedStatus, setSelectedStatus] = useState(initialStatus || 'IN_PROGRESS');
  const [selectedModality, setSelectedModality] = useState(initialModality || 'Traditional (On-Campus)');
  const [workingList, setWorkingList] = useState(() =>
    (activeCourses || []).map((c) => ({
      ...c,
      sessionBand: getCourseSessionBandLabel ? getCourseSessionBandLabel(c) : (c.sessionBand || 'Full 16-Week'),
      status:
        c.status ||
        (c.state === 'Completed' ? 'Completed' : c.state === 'Scheduled' ? 'Scheduled' : 'In-Progress')
    }))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [newCourseSessionBand, setNewCourseSessionBand] = useState('Full 16-Week');
  const [newCourseStatus, setNewCourseStatus] = useState('In-Progress');

  // Sync state whenever modal opens or intake defaults change
  useEffect(() => {
    if (isOpen) {
      setSelectedTerm(initialTerm || 'Fall 2026');
      setSelectedStatus(initialStatus || 'IN_PROGRESS');
      setSelectedModality(initialModality || 'Traditional (On-Campus)');
      setWorkingList(
        (activeCourses || []).map((c) => ({
          ...c,
          sessionBand: getCourseSessionBandLabel ? getCourseSessionBandLabel(c) : (c.sessionBand || 'Full 16-Week'),
          status:
            c.status ||
            (c.state === 'Completed' ? 'Completed' : c.state === 'Scheduled' ? 'Scheduled' : 'In-Progress')
        }))
      );
      setSearchQuery('');
    }
  }, [isOpen, initialTerm, initialStatus, initialModality, activeCourses]);

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
    if (workingList.some((c) => (c.compactCode || c.code.replace(/\s+/g, '').toUpperCase()) === compact)) {
      return;
    }
    const newCourseObj = {
      ...course,
      compactCode: compact,
      sessionBand: newCourseSessionBand,
      status: newCourseStatus,
      state: newCourseStatus === 'Completed' ? 'Completed' : newCourseStatus === 'Scheduled' ? 'Scheduled' : 'Current',
      term: selectedTerm,
      semester: selectedTerm,
      isActiveTerm: true
    };
    setWorkingList((prev) => [newCourseObj, ...prev]);
  };

  const handleRemoveCourse = (idx) => {
    setWorkingList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    onSave({
      courses: workingList,
      selectedTerm,
      status: selectedStatus,
      modality: selectedModality
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
                Active Term Course Editor ({selectedTerm})
              </h3>
              <p className="text-xs text-neutral-500">
                Configure active term semester, status, delivery modality, and enrolled coursework.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Intake Context Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 shadow-2xs">
            <div>
              <label htmlFor="active-term-selected-semester" className="block text-[11px] font-bold text-neutral-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#857542]" />
                Active Term Semester
              </label>
              <input
                id="active-term-selected-semester"
                data-testid="active-term-selected-semester"
                type="text"
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
                className="w-full text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-900 focus:outline-none focus:border-[#857542]"
              />
            </div>

            <div>
              <label htmlFor="active-term-selected-status" className="block text-[11px] font-bold text-neutral-700 mb-1 flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-[#857542]" />
                Intake Status
              </label>
              <select
                id="active-term-selected-status"
                data-testid="active-term-selected-status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-900 cursor-pointer focus:outline-none focus:border-[#857542]"
              >
                <option value="IN_PROGRESS">In-Progress</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div>
              <label htmlFor="active-term-selected-modality" className="block text-[11px] font-bold text-neutral-700 mb-1 flex items-center gap-1">
                <Laptop className="w-3.5 h-3.5 text-[#857542]" />
                Delivery Modality
              </label>
              <select
                id="active-term-selected-modality"
                data-testid="active-term-selected-modality"
                value={selectedModality}
                onChange={(e) => setSelectedModality(e.target.value)}
                className="w-full text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-900 cursor-pointer focus:outline-none focus:border-[#857542]"
              >
                <option value="Traditional (On-Campus)">Traditional (On-Campus)</option>
                <option value="Online">Online</option>
                <option value="Hybrid">Hybrid</option>
                <option value="No Preference (Flexible)">No Preference (Flexible)</option>
              </select>
            </div>
          </div>

          {/* Section 1: Active Term Courses List */}
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
                No active term courses currently enrolled. Search the catalog below to add courses.
              </div>
            ) : (
              <div className="space-y-2">
                {workingList.map((c, idx) => (
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
                        value={c.sessionBand || 'Full 16-Week'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWorkingList((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, sessionBand: val } : item))
                          );
                        }}
                        className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800 cursor-pointer shadow-2xs"
                      >
                        <option value="Full 16-Week">Full 16-Week</option>
                        <option value="Session I 8-Week">Session I 8-Week</option>
                        <option value="Session II 8-Week">Session II 8-Week</option>
                      </select>

                      {/* Status Selector */}
                      <select
                        value={c.status || 'In-Progress'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWorkingList((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, status: val } : item))
                          );
                        }}
                        className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800 cursor-pointer shadow-2xs"
                      >
                        <option value="In-Progress">In-Progress</option>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Completed">Completed</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveCourse(idx)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-neutral-100 transition cursor-pointer"
                        title="Remove course"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Catalog Course Search */}
          <div className="pt-3 border-t border-neutral-200 space-y-3">
            <span className="text-xs font-bold text-neutral-800 uppercase tracking-wide block">
              Search All Catalog Courses to Add
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-6 relative">
                <input
                  type="text"
                  placeholder="Search code or title (e.g. MTH 14100, CSC, Ethics)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-[#857542] text-neutral-900"
                />
                <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="sm:col-span-3">
                <select
                  value={newCourseSessionBand}
                  onChange={(e) => setNewCourseSessionBand(e.target.value)}
                  className="w-full py-2 px-2.5 text-xs bg-white border border-neutral-300 rounded-lg font-semibold text-neutral-800 cursor-pointer"
                >
                  <option value="Full 16-Week">Full 16-Week</option>
                  <option value="Session I 8-Week">Session I 8-Week</option>
                  <option value="Session II 8-Week">Session II 8-Week</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <select
                  value={newCourseStatus}
                  onChange={(e) => setNewCourseStatus(e.target.value)}
                  className="w-full py-2 px-2.5 text-xs bg-white border border-neutral-300 rounded-lg font-semibold text-neutral-800 cursor-pointer"
                >
                  <option value="In-Progress">In-Progress</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed</option>
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
            Done / Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
