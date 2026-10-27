import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Database,
  Layers,
  BookOpen,
  Eye,
  Calendar,
  Lock,
  Tag
} from 'lucide-react';

/**
 * SharedDatabaseModal / Master Curriculum Database Inspector
 *
 * Read-Only Architectural Inspector:
 * - Direct, immutable inspection of canonical catalog courses and requirement placeholders from masterDatabase.json.
 * - Zero editable inputs, zero client-side mutations, zero two-key peer verification buttons.
 * - Search by course code, title, department, or description.
 * - Filter by type (All, Concrete Courses, Requirement Placeholders).
 * - High-density inspection drawer for course offerings, credit metrics, and verbatim catalog descriptions.
 */
export default function SharedDatabaseModal({ isOpen, onClose, masterDb }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL', 'CONCRETE', 'PLACEHOLDER'
  const [inspectedCourse, setInspectedCourse] = useState(null);

  const courses = useMemo(() => masterDb?.courses || [], [masterDb]);

  const filteredCourses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return courses.filter((c) => {
      if (typeFilter === 'CONCRETE' && c.type === 'placeholder') return false;
      if (typeFilter === 'PLACEHOLDER' && c.type !== 'placeholder') return false;

      if (!q) return true;
      const code = (c.code || '').toLowerCase();
      const title = (c.title || '').toLowerCase();
      const dept = (c.department || '').toLowerCase();
      const desc = (c.description || '').toLowerCase();
      return code.includes(q) || title.includes(q) || dept.includes(q) || desc.includes(q);
    });
  }, [courses, searchQuery, typeFilter]);

  if (!isOpen) return null;

  const concreteCount = courses.filter((c) => c.type !== 'placeholder').length;
  const placeholderCount = courses.filter((c) => c.type === 'placeholder').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="master-database-title"
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-5xl w-full h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-neutral-900 text-white flex items-center justify-between border-b-2 border-[#B5A36A]">
          <div className="flex items-center space-x-2.5">
            <Database className="w-5 h-5 text-[#B5A36A]" />
            <div>
              <div className="flex items-center space-x-2">
                <h2 id="master-database-title" className="text-base font-bold font-display text-white">
                  Master Curriculum Database Inspector
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#857542]/30 text-[#D8CFB4] border border-[#B5A36A]/40 uppercase tracking-wider">
                  Read-Only Catalog
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Official institutional degree courses &amp; requirement placeholders ({courses.length} entries)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close database inspector"
            className="p-1 rounded text-neutral-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls & Search Bar */}
        <div className="p-4 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by course code, title, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-md focus:outline-none focus:border-[#857542] text-xs font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-neutral-600">Filter:</span>
            {[
              { id: 'ALL', label: `All (${courses.length})` },
              { id: 'CONCRETE', label: `Concrete (${concreteCount})` },
              { id: 'PLACEHOLDER', label: `Placeholders (${placeholderCount})` }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`py-1.5 px-3 rounded text-xs font-bold transition ${
                  typeFilter === t.id
                    ? 'bg-[#857542] text-white shadow-2xs'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area: Courses Table + Read-Only Detail Drawer */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
          {/* Table Container */}
          <div className="flex-1 overflow-y-auto p-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-neutral-100 shadow-2xs z-10">
                <tr className="text-neutral-700 font-bold border-b border-neutral-200">
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-2 text-center">Cr</th>
                  <th className="py-2.5 px-3">Dept</th>
                  <th className="py-2.5 px-3">Offered Sessions</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredCourses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-neutral-500 italic">
                      No matching courses found in the catalog.
                    </td>
                  </tr>
                ) : (
                  filteredCourses.map((c) => {
                    const isPlaceholder = c.type === 'placeholder' || (c.code || '').startsWith('REQ_');
                    const isSelected = inspectedCourse?.code === c.code;

                    return (
                      <tr
                        key={c.code}
                        onClick={() => setInspectedCourse(c)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-[#F7F5EE] border-l-4 border-[#857542]'
                            : 'hover:bg-neutral-50/80'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-neutral-900 whitespace-nowrap">
                          {c.code}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-800 font-semibold max-w-[280px] truncate">
                          {c.title}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-neutral-700">
                          {c.credits ?? 3}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-600">
                          {c.department || 'CSTH'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-600">
                          {Array.isArray(c.offered_sessions) && c.offered_sessions.length > 0 ? (
                            c.offered_sessions.join(', ')
                          ) : (
                            <span className="text-neutral-500 italic">Fall-16wk, Spring-16wk</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {isPlaceholder ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-900 border border-sky-300">
                              <Lock className="w-2.5 h-2.5" />
                              <span>Placeholder</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-300">
                              <BookOpen className="w-2.5 h-2.5" />
                              <span>Concrete</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectedCourse(c);
                            }}
                            className="p-1 rounded text-[#857542] hover:text-[#6E6035] hover:bg-[#F7F5EE] transition inline-flex items-center space-x-1 font-bold text-[11px]"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Read-Only Course Inspector Drawer */}
          {inspectedCourse && (
            <div className="w-full md:w-[380px] bg-neutral-50 border-t md:border-t-0 md:border-l border-neutral-300 p-5 overflow-y-auto flex flex-col gap-4 text-xs shadow-lg animate-in slide-in-from-right duration-150">
              <div className="flex items-start justify-between border-b border-neutral-200 pb-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-extrabold text-base text-neutral-900">
                      {inspectedCourse.code}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        inspectedCourse.type === 'placeholder'
                          ? 'bg-sky-100 text-sky-900 border-sky-300'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}
                    >
                      {inspectedCourse.type === 'placeholder' ? 'Requirement Placeholder' : 'Concrete Course'}
                    </span>
                  </div>
                  <h3 className="font-bold text-neutral-900 text-sm mt-1 leading-snug">
                    {inspectedCourse.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedCourse(null)}
                  className="p-1 text-neutral-400 hover:text-neutral-800 transition"
                  aria-label="Close course inspection details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Course Attributes High-Density Ledger */}
              <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-lg border border-neutral-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-500 block">Credit Value</span>
                  <span className="font-mono font-bold text-neutral-900 text-sm">
                    {inspectedCourse.credits ?? 3} cr
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-500 block">Department</span>
                  <span className="font-semibold text-neutral-900">
                    {inspectedCourse.department || 'CSTH'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-500 block">Course Fee</span>
                  <span className="font-semibold text-neutral-800">
                    {inspectedCourse.fee_info || inspectedCourse.feeInfo || '$0'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-500 block">Delivery Modality</span>
                  <span className="font-semibold text-neutral-800">
                    {inspectedCourse.modality || 'Both (Online / OnGround)'}
                  </span>
                </div>
              </div>

              {/* Prerequisites & Corequisites */}
              <div className="bg-white p-3 rounded-lg border border-neutral-200 space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-0.5">
                    Prerequisites Display
                  </span>
                  <span className="font-mono text-neutral-800 text-[11px]">
                    {inspectedCourse.prereq_display || inspectedCourse.prereqs || 'None'}
                  </span>
                </div>
                {Array.isArray(inspectedCourse.coreq_codes) && inspectedCourse.coreq_codes.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-0.5">
                      Corequisites
                    </span>
                    <span className="font-mono text-neutral-800 text-[11px]">
                      {inspectedCourse.coreq_codes.join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Official 8-Week Session Availability Badges */}
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-2 flex items-center space-x-1">
                  <Calendar className="w-3 h-3 text-[#857542]" />
                  <span>Annual Session Availability</span>
                </span>
                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-mono font-bold">
                  {[
                    { key: 'FA-I', label: 'FA-I (8wk)', active: inspectedCourse.FA_I_8wk || (inspectedCourse.offered_sessions || []).includes('FA-I') },
                    { key: 'FA-II', label: 'FA-II (8wk)', active: inspectedCourse.FA_II_8wk || (inspectedCourse.offered_sessions || []).includes('FA-II') },
                    { key: 'Fall-16wk', label: 'FA (16wk)', active: inspectedCourse.FA_16wk || (inspectedCourse.offered_sessions || []).includes('Fall-16wk') },
                    { key: 'SP-I', label: 'SP-I (8wk)', active: inspectedCourse.SP_I_8wk || (inspectedCourse.offered_sessions || []).includes('SP-I') },
                    { key: 'SP-II', label: 'SP-II (8wk)', active: inspectedCourse.SP_II_8wk || (inspectedCourse.offered_sessions || []).includes('SP-II') },
                    { key: 'Spring-16wk', label: 'SP (16wk)', active: inspectedCourse.SP_16wk || (inspectedCourse.offered_sessions || []).includes('Spring-16wk') },
                    { key: 'SU', label: 'Summer', active: inspectedCourse.SU_8wk || (inspectedCourse.offered_sessions || []).includes('SU') }
                  ].map((sess) => (
                    <div
                      key={sess.key}
                      className={`py-1 px-1 rounded border ${
                        sess.active
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-neutral-100 text-neutral-400 border-neutral-200 opacity-60'
                      }`}
                    >
                      {sess.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Verbatim Catalog Description */}
              <div className="bg-white p-3 rounded-lg border border-neutral-200">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">
                  Catalog Description
                </span>
                <p className="text-neutral-800 leading-relaxed text-[11px]">
                  {inspectedCourse.description || 'Verbatim description pulled from Academic Course Catalog.'}
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setInspectedCourse(null)}
                  className="py-1 px-3 border border-neutral-300 bg-white rounded font-bold text-neutral-700 hover:bg-neutral-100 transition"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-2.5 bg-neutral-100 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-600">
          <span>
            Institutional Catalog Baseline: <strong>{courses.length} courses loaded</strong> (Immutable Client-Side Architecture)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="py-1 px-4 bg-[#857542] hover:bg-[#6E6035] text-white font-bold rounded shadow-2xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
