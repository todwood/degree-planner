import React, { useState, useMemo } from 'react';
import { Search, X, Check, BookOpen, Layers } from 'lucide-react';
import { toCompact } from '../../engine/waterfallAudit.js';
import { isCourseEligibleForGeBucket } from '../../utils/auditOverrideHelpers.js';

/**
 * Directive D: "Suggest Recommended Course" Modal
 *
 * Provides:
 * 1. Filtered active catalog courses eligible for that requirement.
 * 2. Status badges for courses student has taken / registered for:
 *    - (Completed already) [green]
 *    - (In-Progress already) [blue]
 *    - (Scheduled already) [purple]
 * 3. Search input with category filter pills:
 *    [ All ], [ 10000–20000 Lower Div ], [ 30000–40000 Upper Div ]
 * 4. Selecting a course assigns it as the target recommendation for Screen 3 scheduling.
 */
export default function CourseRecommenderModal({
  isOpen = false,
  onClose = () => {},
  onSelect = () => {},
  reqKey = '',
  reqCode = '',
  reqTitle = 'Degree Requirement',
  bucketId = null,
  poolCourses = null,
  isFreeElective = false,
  catalogCourses = [],
  studentCourses = []
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL'); // 'ALL', 'LOWER', 'UPPER'

  // Build lookup of student course history states
  const studentCourseHistoryMap = useMemo(() => {
    const map = {};
    for (const c of studentCourses || []) {
      const code = c.code || '';
      const compact = toCompact(code);
      const op = c.operationalStatus || '';
      const state = c.state || '';

      let status = null;
      if (op === 'COMPLETED' || state === 'Complete' || state === 'Completed' || state === 'TR' || Boolean(c.grade)) {
        status = 'COMPLETED';
      } else if (op === 'IN_PROGRESS' || state === 'In-Progress' || state === 'Current') {
        status = 'IN_PROGRESS';
      } else if (op === 'SCHEDULED' || state === 'Scheduled') {
        status = 'SCHEDULED';
      }

      if (status) {
        map[code] = status;
        map[compact] = status;
      }
    }
    return map;
  }, [studentCourses]);

  // Base list of courses eligible for this requirement
  const eligibleCourses = useMemo(() => {
    if (!catalogCourses || catalogCourses.length === 0) return [];

    let pool = catalogCourses.filter(
      (c) => c && c.type !== 'placeholder' && !c.isPlaceholder && !String(c.code).startsWith('REQ_')
    );

    // 1. Choice Pool (Major Elective)
    if (Array.isArray(poolCourses) && poolCourses.length > 0) {
      const poolSet = new Set(poolCourses.map((c) => toCompact(c)));
      pool = pool.filter((c) => poolSet.has(toCompact(c.code)));
    }
    // 2. GE Bucket
    else if (bucketId) {
      pool = pool.filter((c) => isCourseEligibleForGeBucket(c, bucketId));
    }
    // 3. Free Elective: retains all concrete catalog courses

    return pool;
  }, [catalogCourses, poolCourses, bucketId]);

  // Filtered by Search Query and Level Filter Pills
  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return eligibleCourses.filter((c) => {
      // Level Filter
      const num = Number(c.number || String(c.code).match(/\d+/)?.[0]) || 0;
      if (levelFilter === 'LOWER' && num >= 30000) return false;
      if (levelFilter === 'UPPER' && num < 30000) return false;

      // Search Query
      if (q) {
        const codeMatch = String(c.code || '').toLowerCase().includes(q);
        const titleMatch = String(c.title || '').toLowerCase().includes(q);
        const deptMatch = String(c.department || '').toLowerCase().includes(q);
        return codeMatch || titleMatch || deptMatch;
      }

      return true;
    });
  }, [eligibleCourses, levelFilter, searchQuery]);

  if (!isOpen) return null;

  const handleSelectCourse = (course) => {
    onSelect({
      reqKey,
      reqCode,
      reqTitle,
      course
    });
    onClose();
  };

  return (
    <div
      data-testid="course-recommender-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-2xl w-full p-6 text-neutral-900 relative space-y-4 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span>Suggest Recommended Course</span>
            </h3>
            <p className="text-xs text-neutral-600 mt-0.5">
              Target Slot: <strong className="text-neutral-900">{reqCode ? `${reqCode} · ` : ''}{reqTitle}</strong>
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

        {/* Search Bar & Level Filter Pills */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              data-testid="recommender-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search active catalog courses by code, title, or department..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-900 focus:outline-hidden focus:ring-2 focus:ring-[#857542]/30 focus:border-[#857542]"
              autoFocus
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mr-1">
              Level Filter:
            </span>
            <button
              type="button"
              data-testid="filter-pill-all"
              onClick={() => setLevelFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition border cursor-pointer ${
                levelFilter === 'ALL'
                  ? 'bg-[#857542] text-white border-[#857542] shadow-2xs'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              All Courses ({eligibleCourses.length})
            </button>
            <button
              type="button"
              data-testid="filter-pill-lower"
              onClick={() => setLevelFilter('LOWER')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition border cursor-pointer ${
                levelFilter === 'LOWER'
                  ? 'bg-[#857542] text-white border-[#857542] shadow-2xs'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              10000–20000 Lower Div
            </button>
            <button
              type="button"
              data-testid="filter-pill-upper"
              onClick={() => setLevelFilter('UPPER')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition border cursor-pointer ${
                levelFilter === 'UPPER'
                  ? 'bg-[#857542] text-white border-[#857542] shadow-2xs'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              30000–40000 Upper Div
            </button>
          </div>
        </div>

        {/* Scrollable Course List */}
        <div className="flex-1 overflow-y-auto space-y-2 border border-neutral-200 rounded-lg p-2 bg-neutral-50/50 max-h-72">
          {filteredCourses.length > 0 ? (
            filteredCourses.slice(0, 80).map((c) => {
              const histStatus = studentCourseHistoryMap[c.code] || studentCourseHistoryMap[toCompact(c.code)];

              return (
                <div
                  key={c.code}
                  className="p-3 bg-white rounded-lg border border-neutral-200 hover:border-[#857542] flex items-center justify-between gap-3 transition shadow-2xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-neutral-900 text-xs">{c.code}</span>
                      <span className="text-xs text-neutral-700 font-medium">· {c.title}</span>
                      <span className="text-neutral-500 font-mono text-[11px]">({c.credits || 3}cr)</span>

                      {/* Student Prior History Badges */}
                      {histStatus === 'COMPLETED' && (
                        <span
                          data-testid={`history-badge-completed-${c.code}`}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                        >
                          (Completed already)
                        </span>
                      )}
                      {histStatus === 'IN_PROGRESS' && (
                        <span
                          data-testid={`history-badge-inprogress-${c.code}`}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300"
                        >
                          (In-Progress already)
                        </span>
                      )}
                      {histStatus === 'SCHEDULED' && (
                        <span
                          data-testid={`history-badge-scheduled-${c.code}`}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300"
                        >
                          (Scheduled already)
                        </span>
                      )}
                    </div>

                    {c.description && (
                      <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">
                        {c.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    data-testid={`select-recommendation-${c.code}`}
                    onClick={() => handleSelectCourse(c)}
                    className="px-3 py-1.5 bg-[#857542] hover:bg-[#6E6035] text-white text-xs font-bold rounded shadow-2xs transition flex-shrink-0 cursor-pointer"
                  >
                    Select
                  </button>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-neutral-500">
              No matching catalog courses found for this requirement.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
          <span>Showing {Math.min(filteredCourses.length, 80)} of {filteredCourses.length} eligible courses</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
