import React, { useState } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  Clock,
  Plus,
  Database,
  AlertCircle,
  ShieldCheck,
  Edit2,
  Filter,
  FileSpreadsheet
} from 'lucide-react';
import dbAdapter from '../data/dbAdapter.js';

export default function SharedDatabaseModal({ isOpen, onClose, masterDb, facultyProfile }) {
  if (!isOpen) return null;

  const currentAdvisorEmail = facultyProfile?.email || 'mwood@advisor.edu';
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL', 'CONCRETE', 'PLACEHOLDER'
  const [courses, setCourses] = useState(masterDb.courses || []);
  const [editingCourse, setEditingCourse] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // New course form template
  const [newCourse, setNewCourse] = useState({
    code: '',
    title: '',
    credits: 3,
    department: 'CSTH',
    description: '',
    prereq_display: 'None',
    coreq_codes: [],
    fee_info: '$0',
    modality: 'Both',
    offered_sessions: ['FA-I', 'SP-II'],
    FA_I_8wk: true,
    FA_II_8wk: false,
    FA_16wk: false,
    SP_I_8wk: false,
    SP_II_8wk: true,
    SP_16wk: false,
    SU_8wk: false
  });

  const filteredCourses = courses.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesQ =
      c.code.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      (c.department && c.department.toLowerCase().includes(q));
    if (!matchesQ) return false;
    if (typeFilter === 'CONCRETE' && c.type === 'placeholder') return false;
    if (typeFilter === 'PLACEHOLDER' && c.type !== 'placeholder') return false;
    if (filterStatus === 'ALL') return true;
    return c.verification_status === filterStatus;
  });

  // Save or update existing course
  const handleSaveCourse = async (updated) => {
    const saved = await dbAdapter.saveCourse(updated, currentAdvisorEmail);
    setCourses((prev) =>
      prev.map((c) => (c.code === saved.code ? { ...c, ...saved } : c))
    );
    setEditingCourse(null);
    setSuccessMsg(
      `Course ${saved.code} saved successfully as status: '${saved.verification_status}'.`
    );
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Two-Key Peer Confirmation (Second Advisor Key)
  const handleConfirmKey2 = async (courseToConfirm) => {
    // Calling saveCourse with a distinct advisor email promotes 'Tentative' to 'Verified'
    const saved = await dbAdapter.saveCourse(
      { ...courseToConfirm, verification_status: 'Tentative' },
      currentAdvisorEmail
    );
    setCourses((prev) =>
      prev.map((c) => (c.code === saved.code ? { ...c, ...saved } : c))
    );
    setSuccessMsg(
      `Peer Verified! ${saved.code} has been confirmed by ${currentAdvisorEmail} and is now 'Verified'.`
    );
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Add brand new course to Shared Database
  const handleCreateNewCourse = async (e) => {
    e.preventDefault();
    if (!newCourse.code.trim()) return;

    const code = newCourse.code.trim().toUpperCase();
    const toSave = {
      ...newCourse,
      code,
      verification_status: 'Tentative',
      submitted_by: currentAdvisorEmail
    };

    const saved = await dbAdapter.saveCourse(toSave, currentAdvisorEmail);
    setCourses((prev) => {
      const idx = prev.findIndex((c) => c.code === saved.code);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
    setIsAddingNew(false);
    setNewCourse({
      code: '',
      title: '',
      credits: 3,
      department: 'CSTH',
      description: '',
      prereq_display: 'None',
      coreq_codes: [],
      fee_info: '$0',
      modality: 'Both',
      offered_sessions: ['FA-I', 'SP-II'],
      FA_I_8wk: true,
      FA_II_8wk: false,
      FA_16wk: false,
      SP_I_8wk: false,
      SP_II_8wk: true,
      SP_16wk: false,
      SU_8wk: false
    });
    setSuccessMsg(`New course ${saved.code} added as '* Tentative' (Pending 2nd Advisor Confirmation).`);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-2xs">
      <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-5xl w-full h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-neutral-900 text-white flex items-center justify-between border-b-2 border-[#B5A36A]">
          <div className="flex items-center space-x-2.5">
            <Database className="w-5 h-5 text-[#B5A36A]" />
            <div>
              <h2 className="text-base font-bold font-display">Shared Master Curriculum Database</h2>
              <p className="text-[11px] text-neutral-400">
                Two-Key Peer Verification Protocol • 1st edit marks <code>* Tentative</code> • 2nd distinct advisor confirms to <code>Verified</code>.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-neutral-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls & Search Bar */}
        <div className="p-4 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by course code, title, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-md focus:outline-none focus:border-[#857542]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1 border-r border-neutral-300 pr-2">
              <span className="font-bold text-neutral-600">Type:</span>
              {[
                { id: 'ALL', label: 'All Courses' },
                { id: 'CONCRETE', label: 'Concrete' },
                { id: 'PLACEHOLDER', label: 'Placeholders' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTypeFilter(t.id)}
                  className={`px-2.5 py-1.5 rounded text-xs font-bold transition ${
                    typeFilter === t.id
                      ? 'bg-neutral-800 text-white shadow-2xs'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-1">
              <span className="font-bold text-neutral-600">Status:</span>
              {['ALL', 'Verified', 'Tentative', 'Blank_Unverified'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1.5 rounded text-xs font-bold transition ${
                    filterStatus === st
                      ? 'bg-[#857542] text-white shadow-2xs'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {st === 'Tentative' ? '* Tentative' : st}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setIsAddingNew(true);
                setEditingCourse(null);
              }}
              className="ml-auto px-3 py-1.5 bg-[#857542] hover:bg-[#6E6035] text-white font-bold rounded flex items-center space-x-1 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Course</span>
            </button>
          </div>
        </div>

        {/* Notification Banner */}
        {successMsg && (
          <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800 font-bold flex items-center space-x-2 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Courses Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Title</th>
                <th className="py-2.5 px-2 text-center">Cr</th>
                <th className="py-2.5 px-3">Sessions Offered</th>
                <th className="py-2.5 px-3">Verification State</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredCourses.map((c) => {
                const isTentative = c.verification_status === 'Tentative';
                const isVerified = c.verification_status === 'Verified';
                const canConfirmTwoKey =
                  isTentative &&
                  c.submitted_by &&
                  c.submitted_by.toLowerCase() !== currentAdvisorEmail.toLowerCase();

                return (
                  <tr key={c.code} className="hover:bg-neutral-50/80 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-neutral-900">{c.code}</td>
                    <td className="py-2.5 px-3 text-neutral-800 font-semibold">{c.title}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-neutral-600">{c.credits}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-600">
                      {(c.offered_sessions || []).join(', ') || (
                        <span className="text-amber-700 italic font-sans">Blank / Fallback</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col items-start gap-0.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isVerified
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isTentative
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                          }`}
                        >
                          {isTentative ? '* Tentative' : c.verification_status}
                        </span>
                        {isTentative && c.submitted_by && (
                          <span className="text-[9px] text-neutral-500 font-mono truncate max-w-[140px]">
                            by: {c.submitted_by.split('@')[0]}
                          </span>
                        )}
                        {isVerified && c.verified_by && (
                          <span className="text-[9px] text-emerald-700 font-mono truncate max-w-[140px]">
                            peer: {c.verified_by.split('@')[0]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {canConfirmTwoKey && (
                          <button
                            onClick={() => handleConfirmKey2(c)}
                            title={`Confirm as 2nd advisor (${currentAdvisorEmail})`}
                            className="py-1 px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] font-bold shadow-2xs flex items-center space-x-1"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span>Confirm (Key 2)</span>
                          </button>
                        )}
                        {c.system_locked || c.type === 'placeholder' ? (
                          <span
                            className="text-neutral-400 font-semibold text-[10px] italic px-1 py-0.5 bg-neutral-100 rounded"
                            title="System requirement placeholders are locked and immutable"
                          >
                            Locked Placeholder
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingCourse(c);
                              setIsAddingNew(false);
                            }}
                            className="text-[#857542] hover:text-[#6E6035] font-bold text-[11px] underline"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add New Course Drawer / Form */}
        {isAddingNew && (
          <form
            onSubmit={handleCreateNewCourse}
            className="p-5 bg-neutral-100 border-t border-neutral-300 flex flex-col gap-3 text-xs animate-in slide-in-from-bottom duration-150"
          >
            <div className="flex justify-between items-center font-bold text-neutral-900 border-b border-neutral-300 pb-2">
              <span className="text-sm flex items-center space-x-1.5">
                <Plus className="w-4 h-4 text-[#857542]" />
                <span>Add New Course to Shared Master Database</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="text-neutral-500 hover:text-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Course Code *</label>
                <input
                  type="text"
                  placeholder="e.g., ICS 33000"
                  value={newCourse.code}
                  onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded font-mono font-bold"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Course Title *</label>
                <input
                  type="text"
                  placeholder="e.g., Network Security and Cryptography"
                  value={newCourse.title}
                  onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Credits</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={newCourse.credits}
                  onChange={(e) => setNewCourse({ ...newCourse, credits: Number(e.target.value) || 3 })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">Catalog Description</label>
              <textarea
                rows={2}
                placeholder="Official catalog description..."
                value={newCourse.description}
                onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded text-xs leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Prerequisites Display</label>
                <input
                  type="text"
                  placeholder="e.g., ICS 21400"
                  value={newCourse.prereq_display}
                  onChange={(e) => setNewCourse({ ...newCourse, prereq_display: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Course Fee</label>
                <input
                  type="text"
                  placeholder="e.g., $50 or $0"
                  value={newCourse.fee_info}
                  onChange={(e) => setNewCourse({ ...newCourse, fee_info: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Department</label>
                <input
                  type="text"
                  placeholder="e.g., CSTH"
                  value={newCourse.department}
                  onChange={(e) => setNewCourse({ ...newCourse, department: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-800 mb-1.5">
                Official 8-Week Session Availability:
              </label>
              <div className="flex flex-wrap gap-4 font-semibold">
                {['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'].map((sess) => {
                  const checked = (newCourse.offered_sessions || []).includes(sess);
                  return (
                    <label key={sess} className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const cur = new Set(newCourse.offered_sessions || []);
                          if (e.target.checked) cur.add(sess);
                          else cur.delete(sess);
                          setNewCourse({
                            ...newCourse,
                            offered_sessions: Array.from(cur),
                            FA_I_8wk: cur.has('FA-I'),
                            FA_II_8wk: cur.has('FA-II'),
                            FA_16wk: cur.has('Fall-16wk'),
                            SP_I_8wk: cur.has('SP-I'),
                            SP_II_8wk: cur.has('SP-II'),
                            SP_16wk: cur.has('Spring-16wk'),
                            SU_8wk: cur.has('SU')
                          });
                        }}
                      />
                      <span>{sess}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-neutral-300">
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="py-1 px-3 border border-neutral-300 rounded font-bold text-neutral-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="py-1 px-4 bg-[#857542] hover:bg-[#6E6035] text-white font-bold rounded shadow"
              >
                Add Course (* Tentative)
              </button>
            </div>
          </form>
        )}

        {/* Edit Existing Course Drawer */}
        {editingCourse && (
          <div className="p-5 bg-neutral-100 border-t border-neutral-300 flex flex-col gap-3 text-xs animate-in slide-in-from-bottom duration-150">
            <div className="flex justify-between items-center font-bold text-neutral-900 border-b border-neutral-300 pb-2">
              <span className="text-sm flex items-center space-x-1.5">
                <Edit2 className="w-4 h-4 text-[#857542]" />
                <span>
                  Edit {editingCourse.code} — {editingCourse.title}
                </span>
              </span>
              <button onClick={() => setEditingCourse(null)} className="text-neutral-500 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Prerequisites Display</label>
                <input
                  type="text"
                  value={editingCourse.prereq_display || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, prereq_display: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Course Fee</label>
                <input
                  type="text"
                  value={editingCourse.fee_info || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, fee_info: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Current Status</label>
                <span className="inline-block py-1.5 px-2 bg-neutral-200 text-neutral-800 rounded font-mono font-bold text-[11px]">
                  {editingCourse.verification_status === 'Tentative' ? '* Tentative' : editingCourse.verification_status}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">Catalog Description</label>
              <textarea
                rows={2}
                value={editingCourse.description || ''}
                onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded text-xs leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-800 mb-1.5">
                Official 8-Week Session Availability:
              </label>
              <div className="flex flex-wrap gap-4 text-xs font-semibold">
                {['FA-I', 'FA-II', 'Fall-16wk', 'SP-I', 'SP-II', 'Spring-16wk', 'SU'].map((sess) => {
                  const checked = (editingCourse.offered_sessions || []).includes(sess);
                  return (
                    <label key={sess} className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const cur = new Set(editingCourse.offered_sessions || []);
                          if (e.target.checked) cur.add(sess);
                          else cur.delete(sess);
                          setEditingCourse({
                            ...editingCourse,
                            offered_sessions: Array.from(cur),
                            FA_I_8wk: cur.has('FA-I'),
                            FA_II_8wk: cur.has('FA-II'),
                            FA_16wk: cur.has('Fall-16wk'),
                            SP_I_8wk: cur.has('SP-I'),
                            SP_II_8wk: cur.has('SP-II'),
                            SP_16wk: cur.has('Spring-16wk'),
                            SU_8wk: cur.has('SU')
                          });
                        }}
                      />
                      <span>{sess}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-neutral-300">
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className="py-1 px-3 border border-neutral-300 rounded font-bold text-neutral-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveCourse(editingCourse)}
                className="py-1 px-4 bg-[#857542] hover:bg-[#6E6035] text-white font-bold rounded shadow"
              >
                Save & Submit for Two-Key Peer Verification
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
