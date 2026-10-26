import React, { useState } from 'react';
import {
  X,
  Plus,
  BookOpen,
  Check,
  ShieldCheck,
  GraduationCap,
  Search,
  Download,
  Layers,
  Sparkles,
  ArrowRight,
  ClipboardPaste,
  Building2,
  ChevronDown
} from 'lucide-react';
import dbAdapter from '../data/dbAdapter.js';
import { PRESET_PROGRAMS, CSTH_DEPARTMENTS } from '../data/csthProgramCatalog.js';

export default function DegreeChecklistModal({
  isOpen,
  onClose,
  masterDb,
  facultyProfile,
  onProgramSaved
}) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('browse'); // 'browse', 'catalog', or 'builder'
  const [selectedProgramId, setSelectedProgramId] = useState(masterDb.programs?.[0]?.id || '');
  
  // Custom builder form state
  const [newProgramName, setNewProgramName] = useState('');
  const [newCatalogYear, setNewCatalogYear] = useState('2026-2027');
  const [newTotalCredits, setNewTotalCredits] = useState(60);
  const [newSelectedCourses, setNewSelectedCourses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fastPasteText, setFastPasteText] = useState('');
  const [showFastPaste, setShowFastPaste] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  // Catalog cluster recommendation state
  const [lastImportedDept, setLastImportedDept] = useState(null);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');

  const currentProgram = masterDb.programs?.find((p) => p.id === selectedProgramId) || masterDb.programs?.[0];

  const availableCourses = (masterDb.courses || [])
    .filter((c) => c.type === 'concrete' || (!c.type && !c.code.startsWith('REQ_')))
    .filter((c) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
    });

  const toggleCourseSelection = (code) => {
    if (newSelectedCourses.includes(code)) {
      setNewSelectedCourses(newSelectedCourses.filter((c) => c !== code));
    } else {
      setNewSelectedCourses([...newSelectedCourses, code]);
    }
  };

  // Fast-paste regex course code extractor
  const handleExtractPastedCourses = () => {
    if (!fastPasteText) return;
    const matches = fastPasteText.match(/\b[A-Z]{3,4}\s*\d{5}\b/gi) || [];
    const normalized = Array.from(new Set(matches.map((m) => m.toUpperCase().replace(/\s+/g, ' '))));
    if (normalized.length === 0) {
      alert('No course codes found matching format (e.g. CSC 10100 or MTH 15100).');
      return;
    }
    const combined = Array.from(new Set([...newSelectedCourses, ...normalized]));
    setNewSelectedCourses(combined);
    setFastPasteText('');
    setShowFastPaste(false);
  };

  // Save custom-built program
  const handleSaveNewProgram = async (e) => {
    e.preventDefault();
    if (!newProgramName.trim()) return;

    const slug = newProgramName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    const newProg = {
      id: `${slug}_${newCatalogYear.replace('-', '_')}`,
      catalog_year_id: newCatalogYear,
      name: newProgramName.trim(),
      program_type: 'Major',
      total_program_credits: Number(newTotalCredits) || (newSelectedCourses.length * 3),
      requirements: {
        major_core_credits: newSelectedCourses.length * 3,
        major_core_courses: newSelectedCourses,
        math_credits: 6,
        math_courses: [
          { code: 'MTH 14100', title: 'Basic Statistics', credits: 3, required: true },
          { code: 'GE-MATH-ELECTIVE', title: 'Any GE-Math course', credits: 3, required: true }
        ],
        notes: `Custom Degree Checklist created by ${facultyProfile?.first_name || 'Advisor'} ${facultyProfile?.last_name || ''}.`
      }
    };

    try {
      await dbAdapter.saveProgram(newProg);
      if (!masterDb.programs.some((p) => p.id === newProg.id)) {
        masterDb.programs.push(newProg);
      }
      setSaveSuccess(`Successfully added "${newProgramName}"!`);
      onProgramSaved?.(newProg.id);
      setTimeout(() => {
        setSaveSuccess('');
        setSelectedProgramId(newProg.id);
        setActiveTab('browse');
      }, 1000);
    } catch (err) {
      console.error('Failed to save program:', err);
    }
  };

  // Import single preset program from catalog
  const handleImportPreset = async (preset) => {
    try {
      await dbAdapter.saveProgram(preset);
      if (!masterDb.programs.some((p) => p.id === preset.id)) {
        masterDb.programs.push(preset);
      }
      setLastImportedDept(preset.department);
      setSaveSuccess(`Successfully imported "${preset.name}" into local database!`);
      onProgramSaved?.(preset.id);
      setTimeout(() => setSaveSuccess(''), 2500);
    } catch (err) {
      console.error('Failed to import preset:', err);
    }
  };

  // Batch import all programs in department cluster
  const handleBatchImportDept = async (deptId) => {
    const toImport = PRESET_PROGRAMS.filter(
      (p) => p.department === deptId && !masterDb.programs.some((mp) => mp.id === p.id)
    );
    for (const prog of toImport) {
      await dbAdapter.saveProgram(prog);
      if (!masterDb.programs.some((mp) => mp.id === prog.id)) {
        masterDb.programs.push(prog);
      }
    }
    setSaveSuccess(`Batch imported ${toImport.length} related programs in department!`);
    setTimeout(() => {
      setSaveSuccess('');
      setLastImportedDept(null);
    }, 2500);
  };

  const isProgramActive = (id) => masterDb.programs?.some((p) => p.id === id);

  const filteredPresets = PRESET_PROGRAMS.filter((p) => {
    if (selectedDeptFilter === 'all') return true;
    return p.department === selectedDeptFilter;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-neutral-900 text-white px-6 py-4 flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-[#857542] rounded-lg text-white">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Degree Program Checklist Manager
              </h2>
              <p className="text-xs text-[#B5A36A]">
                Official Academic Curricula &amp; Custom Program Checklists (Zero Spreadsheets Required)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded-md hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="bg-neutral-100 px-6 py-2.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition ${
                activeTab === 'browse'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Active Checklists ({masterDb.programs?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center space-x-1 ${
                activeTab === 'catalog'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-[#857542]" />
              <span>Catalog Presets &amp; Dept Clusters</span>
            </button>
            <button
              onClick={() => setActiveTab('builder')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center space-x-1 ${
                activeTab === 'builder'
                  ? 'bg-[#857542] text-white shadow-xs'
                  : 'text-[#857542] hover:bg-neutral-200/60'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Custom Checklist Builder</span>
            </button>
          </div>

          <span className="text-[11px] text-neutral-500 font-mono hidden sm:inline">
            Client-Side Verified Database
          </span>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          {saveSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-bold flex items-center space-x-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {/* TAB 1: BROWSE ACTIVE CHECKLISTS */}
          {activeTab === 'browse' && (
            <div className="space-y-5">
              {/* Select Program */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 uppercase tracking-wide mb-1.5">
                  Select Active Program to Inspect
                </label>
                <div className="relative">
                  <select
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    className="w-full appearance-none pl-3 pr-9 py-2 text-xs bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded-md font-bold text-neutral-900 transition shadow-2xs cursor-pointer"
                  >
                    {masterDb.programs?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.catalog_year_id}) — {p.total_program_credits} cr
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {currentProgram && (
                <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">{currentProgram.name}</h3>
                      <p className="text-[11px] text-neutral-500">
                        Catalog Year: {currentProgram.catalog_year_id} • Total Major Credits: {currentProgram.total_program_credits}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold text-[10px] flex items-center space-x-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Catalog Verified</span>
                    </span>
                  </div>

                  {/* Major Core Courses */}
                  <div>
                    <h4 className="text-[11px] font-bold text-neutral-800 uppercase tracking-wider mb-2">
                      Major Core Requirements ({currentProgram.requirements?.major_core_courses?.length || 0} Courses • {currentProgram.requirements?.major_core_credits} cr)
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {currentProgram.requirements?.major_core_courses?.map((c) => (
                        <span
                          key={c}
                          className="px-2 py-1 bg-white border border-neutral-300 rounded font-mono font-bold text-neutral-800 shadow-2xs"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Emphasis Courses if any */}
                  {currentProgram.requirements?.emphasis_courses?.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-bold text-neutral-800 uppercase tracking-wider mb-2">
                        Emphasis Track ({currentProgram.requirements.emphasis_courses.length} Courses • {currentProgram.requirements.emphasis_credits} cr)
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {currentProgram.requirements.emphasis_courses.map((c) => (
                          <span
                            key={c}
                            className="px-2 py-1 bg-amber-50 border border-amber-200 rounded font-mono font-bold text-amber-900 shadow-2xs"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Math Requirements */}
                  <div>
                    <h4 className="text-[11px] font-bold text-neutral-800 uppercase tracking-wider mb-2">
                      Foundational Mathematics (Dual-Counted in GE)
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {currentProgram.requirements?.math_courses?.map((m) => (
                        <span
                          key={m.code}
                          className="px-2 py-1 bg-blue-50 border border-blue-200 rounded font-mono font-bold text-blue-900 shadow-2xs"
                        >
                          {m.code} ({m.title})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CATALOG PRESETS & DEPARTMENT CLUSTERS */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              {/* Department Suggestion Banner if program recently imported */}
              {lastImportedDept && (
                <div className="p-3 bg-[#F7F5EE] border border-[#B5A36A] rounded-lg flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-[#857542]" />
                    <span className="text-xs font-bold text-neutral-900">
                      Smart Dept Cluster: Additional programs in {CSTH_DEPARTMENTS.find((d) => d.id === lastImportedDept)?.name} are available.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBatchImportDept(lastImportedDept)}
                    className="px-3 py-1 bg-[#857542] hover:bg-[#6E6035] text-white rounded font-bold text-xs shadow-xs"
                  >
                    Import All Dept Programs
                  </button>
                </div>
              )}

              {/* Filter by Department */}
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[11px] font-bold text-neutral-700 uppercase">Department:</span>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setSelectedDeptFilter('all')}
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        selectedDeptFilter === 'all'
                          ? 'bg-[#857542] text-white'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      All Departments
                    </button>
                    {CSTH_DEPARTMENTS.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDeptFilter(d.id)}
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          selectedDeptFilter === d.id
                            ? 'bg-[#857542] text-white'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        }`}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>

                <span className="text-[11px] text-neutral-500">
                  {filteredPresets.length} Programs Cataloged
                </span>
              </div>

              {/* Preset Program Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPresets.map((prog) => {
                  const active = isProgramActive(prog.id);
                  const dept = CSTH_DEPARTMENTS.find((d) => d.id === prog.department);
                  return (
                    <div
                      key={prog.id}
                      className={`p-3.5 rounded-lg border transition ${
                        active
                          ? 'bg-neutral-50 border-neutral-200'
                          : 'bg-white border-[#B5A36A]/50 hover:border-[#857542] shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-[10px] font-bold text-[#857542] bg-[#F7F5EE] px-1.5 py-0.5 rounded border border-[#B5A36A]/30">
                            {dept?.name || 'CSTH'}
                          </span>
                          <h4 className="font-bold text-neutral-900 text-xs mt-1">{prog.name}</h4>
                          <p className="text-[10px] text-neutral-500">
                            Catalog: {prog.catalog_year_id} • {prog.total_program_credits} cr
                          </p>
                        </div>
                        {active ? (
                          <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold text-[10px] flex items-center space-x-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleImportPreset(prog)}
                            className="px-2.5 py-1 bg-[#857542] hover:bg-[#6E6035] text-white rounded font-bold text-[11px] shadow-xs flex items-center space-x-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Import</span>
                          </button>
                        )}
                      </div>

                      <div className="text-[10px] text-neutral-600 line-clamp-1">
                        <span className="font-bold">Core ({prog.requirements.major_core_courses.length}): </span>
                        {prog.requirements.major_core_courses.join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM CHECKLIST BUILDER */}
          {activeTab === 'builder' && (
            <form onSubmit={handleSaveNewProgram} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                    Program / Degree Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Computer Science, BS or Data Science, BS"
                    value={newProgramName}
                    onChange={(e) => setNewProgramName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded font-semibold text-xs focus:border-[#857542]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                    Catalog Year
                  </label>
                  <div className="relative">
                    <select
                      value={newCatalogYear}
                      onChange={(e) => setNewCatalogYear(e.target.value)}
                      className="w-full appearance-none pl-3 pr-8 py-1.5 bg-white border border-neutral-300 hover:border-[#857542] focus:border-[#857542] focus:ring-2 focus:ring-[#857542]/20 rounded text-xs font-semibold cursor-pointer"
                    >
                      <option value="2026-2027">2026–2027</option>
                      <option value="2025-2026">2025–2026</option>
                      <option value="2024-2025">2024–2025</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Fast Course Code Paste Option */}
              <div className="p-2.5 bg-[#F7F5EE]/60 border border-[#B5A36A]/40 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <ClipboardPaste className="w-3.5 h-3.5 text-[#857542]" />
                    <span className="text-[11px] font-bold text-neutral-900">
                      Fast-Import Course Codes from Catalog Text / Syllabus
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFastPaste(!showFastPaste)}
                    className="text-[11px] font-bold text-[#857542] hover:underline"
                  >
                    {showFastPaste ? 'Hide Paste Box' : 'Open Paste Box'}
                  </button>
                </div>

                {showFastPaste && (
                  <div className="mt-2 space-y-2 animate-in fade-in">
                    <textarea
                      rows={3}
                      value={fastPasteText}
                      onChange={(e) => setFastPasteText(e.target.value)}
                      placeholder="Paste text containing course codes, e.g.: CSC 10100, CSC 14400, CSC 20100, MTH 27100..."
                      className="w-full p-2 text-xs border border-neutral-300 rounded font-mono bg-white"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleExtractPastedCourses}
                        className="px-3 py-1 bg-[#857542] hover:bg-[#6E6035] text-white font-bold rounded text-xs"
                      >
                        Extract &amp; Select Courses
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Course Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-neutral-700 uppercase">
                    Select Required Core Courses ({newSelectedCourses.length} Selected • {newSelectedCourses.length * 3} cr)
                  </label>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Search courses..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-2 py-1 text-xs border border-neutral-300 rounded font-mono"
                    />
                  </div>
                </div>

                {/* Selected pills */}
                {newSelectedCourses.length > 0 && (
                  <div className="mb-2 p-2 bg-neutral-50 border border-neutral-200 rounded flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {newSelectedCourses.map((c) => (
                      <span
                        key={c}
                        onClick={() => toggleCourseSelection(c)}
                        className="px-2 py-0.5 bg-[#857542] text-white rounded font-mono text-[10px] font-bold cursor-pointer hover:bg-red-700 flex items-center space-x-1"
                        title="Click to remove"
                      >
                        <span>{c}</span>
                        <X className="w-3 h-3" />
                      </span>
                    ))}
                  </div>
                )}

                {/* Course Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto p-2 bg-neutral-50 rounded border border-neutral-200">
                  {availableCourses.map((c) => {
                    const isSelected = newSelectedCourses.includes(c.code);
                    return (
                      <button
                        type="button"
                        key={c.code}
                        onClick={() => toggleCourseSelection(c.code)}
                        className={`text-left p-1.5 rounded border transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#857542] text-white border-[#857542]'
                            : 'bg-white hover:bg-neutral-100 text-neutral-800 border-neutral-200'
                        }`}
                      >
                        <div className="truncate pr-1">
                          <p className="font-mono font-bold text-[11px]">{c.code}</p>
                          <p className="text-[10px] truncate opacity-90">{c.title}</p>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('browse')}
                  className="px-4 py-2 border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newProgramName.trim() || newSelectedCourses.length === 0}
                  className="px-5 py-2 bg-[#857542] hover:bg-[#6E6035] disabled:bg-neutral-300 text-white font-bold rounded shadow transition"
                >
                  Save Degree Checklist
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="bg-neutral-50 px-6 py-3 border-t border-neutral-200 flex items-center justify-between text-neutral-500 text-[11px]">
          <span>Checklists persist locally in your browser memory &amp; IndexedDB.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 text-white rounded hover:bg-neutral-900 font-bold text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
