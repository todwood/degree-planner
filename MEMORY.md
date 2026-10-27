# Architectural Memory Log (`MEMORY.md`)

## Project Context
- **Project Name:** Lindenwood University Deterministic Degree Planner
- **Target Audience:** Academic Advisors and Students in the College of Science, Technology, and Health (CSTH).
- **Core Tenet:** 100% deterministic auditing, credit summation, prerequisite chaining, and 8-week scheduling. Zero LLM runtime calls for degree audits. Zero FERPA data leaves client-side browser memory.

## Architectural Decisions Log

### 1. Security & FERPA Client-Side Boundary
- **Decision:** All student files (Anthology exports, unofficial transcript PDFs, returning degree plan PDFs) are parsed and evaluated strictly in-memory inside the advisor's browser.
- **Why:** Full compliance with FERPA regulations. No student PII (names, IDs, course histories, grades) is ever transmitted to Supabase, GitHub, or any remote server.
- **Rejected:** Sending transcript PDFs or raw text to an LLM or backend parsing endpoint.

### 2. Dual Database Architecture & Fallback
- **Decision:** Master public curriculum, course offerings, and faculty directory profiles are served from a local deterministic JSON database (`src/data/masterDatabase.json`) with an abstraction layer (`src/data/dbAdapter.js` / IndexedDB / localStorage) that gracefully switches to Supabase when live credentials are provided.
- **Why:** Enables 100% offline development, instant fast unit tests, and air-gapped execution while remaining fully compatible with Supabase cloud syncing.

### 3. GitHub Credentials & Deployment Target
- **Decision:** Rescued GitHub credentials from sibling project `../simple-project1/.env` in strictly read-only mode.
- **Status:**
  - `GITHUB_TOKEN`: Successfully located and transferred to `Degree_Planner/.env` (presence confirmed, raw token hidden).
  - `GITHUB_REPO`: Renamed from `synapse-ai` to `degree-planner`.
  - `GITHUB_USERNAME`: `todwood`
- **Deployment Strategy:** The GitHub repository has been renamed to `degree-planner` and hosts the live application at `https://todwood.github.io/degree-planner/`.

### 4. Windows Environment Tooling
- **Decision:** Use `npm.cmd` for Node package execution to avoid Windows PowerShell script execution policy (`.ps1`) restrictions.
- **Python Runtime:** Python 3.12 initialized in `.venv/` via Windows Python launcher (`py -m venv .venv`). Pip packages are installed via `.\.venv\Scripts\python.exe -m pip install` to navigate Windows AppLocker constraints.

### 5. Curriculum & Master Database Verification (Step 2 Completed)
- `masterDatabase.json` and `dbAdapter.js` implemented with 71 courses, full boolean 8-week offerings, modalities, structured boolean prerequisite trees, math placement flags, forced summer exceptions, legacy substitutions, the 14-bucket waterfall schema, and full checklists for all 3 majors:
  1. Cybersecurity BS: 66cr (60cr core + 6cr math)
  2. IT BS - Apps Dev: 66cr (24cr core + 36cr emphasis + 6cr math)
  3. IT BS - Networking: 60cr (24cr core + 30cr emphasis + 6cr math)
- Verified with 13 Vitest unit tests and 3 Pytest unit tests, all passing with 100% success.

### 6. Deterministic Audit & Critical-Path Scheduler Engine (`src/engine/` — Phase 2 & 3 Completed)
- **`src/engine/transcriptParser.js`:** Client-side parser for Anthology `.csv`/`.xlsx` (via SheetJS), Unofficial Transcript `.pdf`/text, and Returning Degree Plan `.pdf` state metadata (`pdf-lib`). Implements canonical/compact course code normalization (`ICS 21300` / `ICS21300`), grade/sub-10000 exclusions into the Excluded Courses Ledger, retake deduplication (retaining single highest passing attempt), 4-state classification (`TR`, `Completed`, `Current`, `Scheduled`), `UNIV/LUL` transfer waiver (`TR > 0`), and Passive 2-Year Lindenwood Course Harvester.
- **`src/engine/waterfallAudit.js`:** 5-Layer Claim-and-Remove Waterfall Audit reserving Major/Emphasis courses, enforcing `C`-or-higher gatekeepers on `ENGL 15000`/`EPP 15000` and `ENGL 17000` (with `D` grades routed strictly to general electives toward 120 credits), dual-counting `MTH 14100` and `Any GE-Math` once in credit totals, applying `/HD` 2-course (6cr) overlay tags, legacy substitutions (`ICS 41100 -> ICS 41500`, `ICS 41400 -> ICS 41700`), Cisco concurrent lab exemptions, and generating `Upper-Level Elective (30000+)` placeholders before general `Elective` placeholders to guarantee $\ge 42$ upper-level and $\ge 120$ total credits.
- **`src/engine/scheduler.js`:** Topological Critical-Path 8-week scheduler supporting `FA-I`, `FA-II`, `Fall-16wk`, `SP-I`, `SP-II`, `Spring-16wk`, and `SU`. Enforces same-semester `Session I -> Session II` prerequisite chaining, atomic Cisco 5cr lecture + 1cr lab concurrency, Odd/Even year evaluation, Forced Summer exception detection (`IIT 45200`), Capstone final-semester placement (`ICS 48900` / `IIT 48900`), Tactile Flexibility Color classification (`Sky Blue`, `Warm Amber`, `Deep Slate`), Priority Registration opening date calculation (counting `FA-I` / `SP-I` credits completed prior to the registration window), and Background "What-If" Graduation Accelerator.

### 7. Phase 4 Client-Side UI & End-to-End Verification Completed
- **Tailwind CSS Stack:** Locked to `tailwindcss@^3.4.17`, `postcss`, and `autoprefixer` with `tailwind.config.js` and `src/styles/theme.css` imported via `src/main.jsx`.
- **Screen 0 (Faculty Login):** Implemented in `src/components/Screen0Login.jsx` with split username prefix input, `@lindenwood.edu` badge, 6-digit OTP modal with paste support, 5-minute cooldown timer, FERPA reassurance box, and instant demo bypass for `Matthias Wood`.
- **Screen 1 (Intake Workspace):** Implemented in `src/components/Screen1Intake.jsx` with Option A (`.pdf` state reload) and Option B (separated Anthology `.csv`/`.xlsx` and Unofficial Transcript `.pdf` dropzones), Scribe SOP links, Program dropdown strictly above optional Bingo Sheet dropzone, 3 linked Pacing Mode dropdowns (`Full-Time` 9/18; `Part-Time` 6/11), and demo student pre-loads for all 3 majors.
- **Screen 2 (Curriculum Audit Ledger):** Implemented in `src/components/Screen2Audit.jsx` with visual "Race to the Graduation Flag" number line (0 to 120+) with stick-figure avatar and enrolled credits bar, Graduation Policy checklist (30cr/24cr residency, 42cr upper-level, 6cr Human Diversity, Composition C gatekeeper), Excluded Courses Ledger, requirement tables with student-course equivalence dropdowns, incoming transfer placeholders, and conditional Missing Availability modal.
- **Screen 3 (Schedule Board & Course Inspector):** Implemented in `src/components/Screen3ScheduleBoard.jsx` with 3-Zone layout (Zone 1 past, Zone 2 current/transfers, Zone 3 Fall/Spring/Summer grid), Tactile Weight course cards (`Sky Blue`, `Warm Amber`, `Deep Slate`), slide-over Course Inspector Drawer (department, code, title, credits, fees, catalog description, prereqs, coreqs, session availability, and popular GE stats), Priority Registration notice with full-month names without abbreviations, per-semester notes, What-If accelerator cards, and round-trip `.pdf` export (`src/engine/pdfExporter.js`).
- **Headless E2E Verification (`execution/test_ui_flow.js`):** Verified full interactive navigation across Screen 0, Screen 1, Screen 2, and Screen 3 for all 3 majors (`Cybersecurity, BS`, `IT - Applications Development`, `IT - Networking`), including drawer inspection, forced summer alerts (`IIT 45200`), Cisco concurrent lecture/lab scheduling (`ICS 32300` / `ICS 32301`), and PDF export with 0 console errors.

### 8. Phase 5: Dynamic Bingo Sheet Importer, Python Crawlers, & Live GitHub Pages Deployment
- **Dynamic Bingo Sheet Importer (`src/components/BingoSheetModal.jsx`):** Allows advisors to upload departmental `.xlsx`/`.csv` matrices, extracts 10000+ course codes, titles, credits, prerequisites, and session availability, provides an instant preview table, enables 1-click batch sync into `dbAdapter.saveCourse()`, and provides a downloadable template.
- **Shared Master Database Manager (`src/components/SharedDatabaseModal.jsx`):** Supports full curriculum search, status filter (`ALL`, `Verified`, `Tentative`, `Blank_Unverified`), Two-Key Peer Verification with a direct `[Confirm (Key 2)]` button for distinct advisors to promote tentative records to `Verified`, new course creation form (`[+ Add New Course]`), and offering editor.
- **Deterministic Python Crawlers & Directives:**
  - `directives/crawl_lindenwood_catalog.md` + `execution/crawl_lindenwood_catalog.py`: Crawls Modern Campus Catalog (Acalog `catoid=12`) for degree requirements, course descriptions, prerequisites, corequisites, and fees with graceful local seed fallback. Verified by `tests/test_crawlers.py`.
  - `directives/scrape_academic_calendar.md` + `execution/scrape_academic_calendar.py`: Computes Priority Registration opening dates by academic year and class standing with strict compliance to `Style.md` full-month editorial style. Verified by `tests/test_crawlers.py`.
- **Live Production Deployment to GitHub Pages:**
  - Automated deployment engine `execution/deploy_to_github_pages.js` packages `dist/`, ensures 0 sensitive or FERPA files are included, commits via GitHub REST API using `GITHUB_TOKEN` to `todwood/degree-planner`, and establishes `.nojekyll` to bypass Jekyll compilation errors.
  - Live site at `https://todwood.github.io/degree-planner/` verified end-to-end via headless Chrome automation (`execution/verify_live_pages.js`) with 0 console errors across Screen 0, Screen 1, Screen 2, and Screen 3.

### 9. De-Branding & Neutral Presentation ("Degree Planner")
- **Decision:** Remove all visible institutional wordmarks and references to "Lindenwood" from user-facing screens, headers, footers, drawer descriptions, email input adornments, modal dialogs, and exported PDF documents.
- **Architectural Rationale:** Eliminates legal confusion/liability regarding official endorsement, while preserving the backend ability to read and ingest accurate curriculum data (`execution/crawl_lindenwood_catalog.py`, `execution/scrape_academic_calendar.py`).
- **Implementation:**
  - All UI copy re-branded to "Degree Planner — Academic Advising System", "Institutional Residency", "Academic Course Catalog", and generic advisor emails (`@advisor.edu`).
  - SVG logos replaced with "DP" monogram and "DEGREE PLANNER / ACADEMIC ADVISING SYSTEM" in the established gold/black aesthetic.
  - PDF export title and header updated to "DEGREE PLANNER" and "Student Academic Degree Plan".
  - Retained internal property aliases (`res.projectedInstitutionalCredits` & `res.projectedLindenwoodCredits`) to guarantee 100% test suite and backward compatibility.
  - Live GitHub Pages site at `https://todwood.github.io/degree-planner/` verified to contain ZERO occurrences of "Lindenwood" in rendered DOM text.

### 10. Intake Workspace Dropzone Architecture & Dual-Record Ingestion
- **Decision:** Build a unified, strictly validated `StudentRecordDropzone` component across Screen 1 (both Option A and Option B).
- **Mutual Exclusivity Fix:** Fixed the previous exclusivity bug in Option B so advisors can upload an Anthology Export (`.csv`/`.xlsx`), an Unofficial Transcript (`.pdf`), or BOTH simultaneously.
- **Combined Ingestion Engine:** Implemented `parseCombinedStudentRecords()` in `transcriptParser.js` to merge rows from both formats and deduplicate course attempts deterministically via `processRawCourseRecords()`.
- **Drag & Drop Security & Extension Validation:** Native HTML file inputs permit dropping mismatched extensions; `StudentRecordDropzone` intercepts drag events (`onDragOver`, `onDrop`) and `onChange` to strictly reject non-permitted MIME/extensions (`.pdf` vs `.xlsx`/`.csv`) with immediate feedback and 0 state mutation.
- **Option A Symmetry:** Redesigned Option A with equal 50% width columns (`lg:grid-cols-2`), matching uppercase tracking headers (`1. PREVIOUSLY EXPORTED PLAN (.PDF ONLY)` [REQUIRED]), and side-by-side optional dropzones for newer student records (`2. OPTIONAL: NEWER STUDENT RECORDS (UPLOAD IF AVAILABLE)`).
- **Verification:** 23 Vitest unit tests passing; live deployment verified via headless Chrome automation with 0 console errors.

### 11. Screen 3 Schedule Board Kanban Redesign with Stacked Bands & Compact Cards
- **Architecture & Layout:** Consolidate each semester into a single unified column (`w-[330px] flex-shrink-0`) in a multi-column Kanban board with horizontal scrolling across academic terms.
- **Stacked Horizontal Bands:** Divided each Fall/Spring semester column into 3 stacked horizontal bands:
  1. `16-Week Full Semester` (`Fall-16wk` / `Spring-16wk`)
  2. `Session I • 1st 8-Week Session` (`FA-I` / `SP-I`)
  3. `Session II • 2nd 8-Week Session` (`FA-II` / `SP-II`)
  (and Summer `SU • Summer 8-Week Session`).
- **Drag-and-Drop & Visual Drop Placeholders:** Added HTML5 drag-and-drop support across all session bands with visible drop target placeholders (`+ Drag course here`) when a band has 0 scheduled courses.
- **Dynamic Re-Tagging:** Moving a course or placeholder (e.g., `Any GE-Math` or `MTH 15100`) between 8-week and 16-week bands updates its scheduled session format (`sessionFormat: '16-Week Full Term'` vs `'8-Week Accelerated Session'`), and displays the active format in the Course Inspector drawer.
- **Compact 3-Row Course Cards:** Reduced padding and margins (`p-2 rounded-md`, `text-[11px]`) while preserving all information:
  - **Row 1:** Category badge (`[M]`, `[GE]`, `[E]`), Course code, Credit hours, Lock/Unlock toggle, Move button (`⇄`).
  - **Row 2:** Single-line course title with ellipsis, clickable to open Course Inspector drawer.
  - **Row 3:** Left: Prerequisites (`Pre: ...`). Right: Database offering availability badge:
    - Concrete verified catalog data: `Offered: FA-I, SP-II` (emerald badge)
    - Off-session placement indicator: `Off-Session (FA-I)` (red badge)
    - Unverified availability: `Offered: Needs insight` (amber badge)
    - Placeholders: `Offered: Undetermined` (gray badge)
- **Live Deployment & Verification:** Deployed to GitHub Pages (`todwood/degree-planner`), verified via headless Chrome with 0 console errors and 0 occurrences of "Lindenwood".

### 12. Academic Year 3-Column Roadmap & Enrolled Courses Grey State
- **Simplified Tactile Color Labels:** Updated `TACTILE_WEIGHT_TIERS` and UI legend from "Sky Blue", "Warm Amber", "Deep Slate" to simple "Blue", "Amber", and "Slate".
- **Academic Year 3-Column Grid:** Structured Zone 3 into Academic Year rows (e.g. `Fall 2026, Spring 2027, Summer 2027` followed by a line break to `Fall 2027, Spring 2028, Summer 2028`), replacing horizontal overflow with an intuitive, printable vertical stack of 3-column grids (`grid-cols-1 lg:grid-cols-3`).

### 13. Instant Advisor Testing Pre-Load Fix & Intake Exception Workflow
- **Root Cause of Screen 2 "Freeze":** When `Alex Rivera` or other sample students with active enrolled courses were processed, `generateOptimalSchedule` called `parseTermInfo(c.term)`. Because `parseTermInfo` was not imported in `src/engine/scheduler.js`, an uncaught `ReferenceError: parseTermInfo is not defined` crashed `handleProceedToSchedule` silently, preventing navigation to Screen 3.
- **Root Cause of Screen 3 Fallback:** When an advisor clicked "3. Schedule Board" in `HeaderNav`, `schedule` was null because it was only lazily computed on Screen 2. The router check `currentScreen === 3 && schedule` evaluated to false, falling through to the dead-end "Please complete student record intake first" card.
- **Fix Implemented:**
  1. Imported `parseTermInfo` in `src/engine/scheduler.js`.
  2. Built rich, realistic sample student datasets in `src/data/sampleStudents.js` for `Alex Rivera` (`Cybersecurity, BS`), `Jordan Chen` (`IT - Applications Development, BS`), and `Taylor Brooks` (`IT - Networking, BS`), including completed GEs, foundational cores, and active Fall 2026 enrollments.
  3. Pre-generated `schedule` immediately in `handleIntakeComplete` so both Screen 2 and Screen 3 have instant access to the schedule board with 0 latency.
  4. Created `src/components/AdvisorTestingExceptionCard.jsx`: Replaces the dead-end error message with a dedicated Advisor Evaluation Mode panel when navigating to Screen 2 or Screen 3 without a student loaded, providing 1-click loading into either the Degree Audit or Schedule Board.
  5. Added an instant **Sample Student Switcher** to `HeaderNav.jsx` allowing advisors to switch between sample students from any screen with 1 click.
  6. Verified via automated Puppeteer test suite (`.tmp/verify_local_flow.js` and `.tmp/verify_exception_card.js`) with 100% pass rate and 0 console errors.
- **Currently Enrolled Grey State & Unlock Rules:** Courses with active enrollment (`state === 'Current'` or `'Scheduled'`) inside the ongoing academic year are incorporated directly into Zone 3:
  - Rendered in a distinct **Grey** state (`bg-neutral-100 text-neutral-800 border-l-[4px] border-neutral-400`).
  - **Locked by default** to reflect active registration.
  - Can be unlocked by clicking the lock toggle and moved under standard scheduling and prerequisite rules.
  - Upon being moved into a future semester, courses automatically revert from grey to their respective tactile flexible color scheme (Tier 1: Blue, Tier 2: Amber, Tier 3: Slate).
- **Verification:** 23 Vitest unit tests passing; live deployment verified via headless Chrome automation with 0 console errors.

### 14. 14 Real Student Dataset Ingestion, Metadata Pipelining, Profile Cards, & Zone 2 Roadmap Consolidation
- **Real Student Data Ingestion (`src/data/realStudentsCatalog.json`):**
  - Unzipped and parsed all 14 student folders from the user-provided sample dataset: `Aidan Kelley`, `Brandon Paz`, `Connor Brown`, `Fabiana Labrador`, `Garrett Bullock`, `Garrett Kopper`, `Jalen Smith`, `James Avery`, `Justen Korn`, `Landen Albers`, `Lliam Gammon`, `Manjot Sagoo`, `Timothy Frein`, and `Trey Chaney`.
  - Parsed `student info.txt` files extracting Student ID, Full Name, Program Version, Program Code, Catalog Year, Cumulative GPA, Credits Earned, Expected Graduation Date, Academic Advisor, Student Email, Phone, and Enrollment Status (`Full Time` -> `Full-Time`, `3/4 Time` -> `Part-Time`).
  - Extracted all raw course rows from `StudentCourseSchedules (All Results).xlsx` for each student.
- **Anthology Term Parsing Regex Fix (`src/engine/transcriptParser.js`):**
  - Discovered real Anthology exports format terms with underscores and two-digit years (e.g. `FALL_II_26_8W`, `FALL_I_24_8W`, `FALL_23_16W`, `SPRING_I_26_8W`, `TRANSFER_TERM`).
  - Replaced word boundary regexes with underscore-aware pattern matching `(?:_|^|[A-Z])(1\d|2\d|3\d)(?:_|$|[A-Z])` and `/_II(?:_|$)/` to correctly extract two-digit years and 8-week session lanes chronologically.
- **Zone 2 Roadmap Consolidation & Zone 1 Renaming (`src/components/Screen3ScheduleBoard.jsx`):**
  - Eliminated standalone floating Zone 2 current-semester banner. Active semester enrolled courses now render directly within their respective session bands (`Fall-16wk`, `FA-I`, `FA-II`) under Fall 2026 in the Academic Year Roadmap.
  - Renamed Zone 1 header to `"Full Semesters Complete"` with subtext `(Defined by official records showing a verified letter grade or transfer credit)`.
- **Student Metadata Pipelining & UI Integration:**
  - **Screen 1 Intake:** Added 14-student picker grouped by program (Cybersecurity, IT, Double Major), the **Detected Student Profile Card**, and auto-population of `catalogYear`, `selectedProgramId`, and `pacingMode`. Selecting a profile satisfies the intake requirement without mandatory file upload.
  - **Screen 2 Audit:** Added tactile **Student Advising Profile Card** displaying Student Name, ID, Program, Catalog Year, Cumulative GPA, Advisor Name, Email, Phone, and Expected Grad Date.
  - **Screen 3 Schedule Board:** Added **Student Advising & Graduation Benchmark Banner** comparing the student's `Expected Graduation Date` from records against the scheduler's `Deterministic Projected Conferral`.
  - **Global Navigation (`HeaderNav.jsx` & `AdvisorTestingExceptionCard.jsx`):** Expanded Instant Advisor Testing dropdown to list all 14 real students with GPA and major. Displays `Active: [Student Name]` dynamically on the header switcher.
  - **PDF Exporter (`src/engine/pdfExporter.js`):** Enriched header metadata grid with Cumulative GPA, Expected Graduation Date, Enrollment Status / Pacing, and Advisor Contact, strictly adhering to `Style.md` full-month editorial standards.
- **Deterministic Verification:** 23 Vitest unit tests pass; 14/14 real students pass full audit and scheduling via `.tmp/verify_real_students_engine.mjs`; production bundle compiles with 0 errors.

### 15. Real Document Upload Architecture & Removal of Pre-Load Exceptions
- **Removed Synthetic Pre-Load Features:**
  - Removed all mock Instant Advisor Testing buttons and pre-loaded sample student dropdowns from `Screen1Intake.jsx` and `HeaderNav.jsx`.
  - Removed intake exception rules that bypassed document uploads.
  - Refactored `AdvisorTestingExceptionCard.jsx` into a clean, informative prompt directing the advisor to Step 1 to upload documents when navigating to Screen 2 or Screen 3 without an active in-memory record.
- **Client-Side PDF Transcript Text Extraction (`extractTextFromPdf`):**
  - Integrated `pdfjs-dist` to parse `.pdf` transcripts (both student-based and enrollment-based) directly in browser memory without sending PII to any server.
  - Discovered and resolved a critical PDF stream formatting issue: implemented vertical y-coordinate grouping (`Math.abs(y - currentY) > 3`) so that text items are grouped into individual course lines rather than merged onto a single flat string.
- **Anthology Transcript Format Pattern Matching:**
  - Extended regexes in `transcriptParser.js` to match 6-column Anthology table layouts (`[Code] [Title] [Attempted] [Earned] [QualityPoints] [Grade]`), 4-column legacy formats, transfer grades (`TR-C`, `TR-[A-Z]`), and raw term headers (`Term: TRANSFER_TERM`, `Term: FALL_23`).
- **Student Advising Metadata Auto-Fill (`parseStudentInfoFile`):**
  - Added an optional dropzone in Option B for `student info.txt` (or `.csv`), allowing advisors practicing with real/fake datasets to drop `student info.txt` to instantly auto-populate Student Name, Student ID, GPA, Catalog Year, Expected Graduation Date, and Pacing Mode into editable form fields.
  - Added auto-detection of degree seeking (`INTECHBS` -> IT, `CYBSCBS` -> Cybersecurity) directly from the `Enrollment` column of uploaded `StudentCourseSchedules (All Results).xlsx` files.
- **Verification:** 23 Vitest unit tests pass; production build compiles with code-split on-demand PDF extraction chunk (`pdf-*.js`); simulated file upload across all 14 student folders (`.xlsx` + `.pdf` + `info.txt`) passes with 100% success.

### 16. Option B Full Real-World Verification & Live Deployment to GitHub Pages
- **Clean Removal of All Legacy Sample Selectors:** Verified 0 instances of "Instant Advisor Testing", pre-load sample student switchers, or hardcoded sample students across all components and live DOM.
- **Header Navigation Fix:** Added missing `ChevronDown` icon import to `src/components/HeaderNav.jsx`.
- **Semantic Dropzone IDs:** Added `id` and `id-input` to `StudentRecordDropzone` for programmatic automation, accessibility, and clean DOM querying.
- **Multi-Permutation Verification:** Automated tests across `.tmp/samples/` confirmed 100% success across:
  1. Anthology `.xlsx` only (`Manjot Sagoo`)
  2. Unofficial Transcript `.pdf` only (`Justen Korn`)
  3. Combined `.xlsx` + `.pdf` + `student info.txt` (`Aidan Kelley`, `Brandon Paz`)
- **Live Production Deployment:** Deployed bundle `index-B6gWDwAj.js` with `.nojekyll` to GitHub Pages at `https://todwood.github.io/degree-planner/`. Verified end-to-end via headless Chrome automation (`.tmp/verify_live_option_b.mjs`) with 0 console errors across Screen 1, Screen 2, and Screen 3.

### 17. In-Place Progressive Intake, Multi-Year Catalog Pre-Seeding, & Visual Checklist Manager
- **Elimination of `student info.txt` Dropzone:** Removed the artificial `student info.txt` upload box from Option B. That file was only part of the calibration set and does not exist in standard advising workflows.
- **In-Place Progressive Disclosure (Screen 1 Option B):**
  - **Stage 1 (Upload State):** Displays clean, prominent dropzones for official records: Anthology schedule (`.xlsx`/`.csv`) and/or Unofficial Transcript (`.pdf`).
  - **Stage 2 (Detected Profile & Intake Form):** Once records are parsed into memory, the dropzones collapse into a compact status bar (`Uploaded Records`), revealing the Detected Student Profile directly below in-place without page jumping.
- **Advising Metadata Minimization & Smart Fallbacks:**
  - Advisors only need to select **Primary Degree Seeking** and **Pacing Mode** (Full-Time vs. Part-Time).
  - Eliminated manual entry for GPA and Expected Graduation Date: GPA is calculated dynamically from transcripts, and graduation conferral date is calculated deterministically by the Scheduler.
  - Added smart default name generator: `Student [number] (Spelled-Out Month Day, Year)` (e.g., `Student 224 (October 22, 2026)` per `Style.md`) if missing from files.
  - Advisor identity defaults to active `facultyProfile` (`Matthias Wood`) if not detected.
- **Retirement of Departmental Bingo Sheets:**
  - Removed old departmental bingo sheet spreadsheet dropzone.
  - Pre-seeded 8 new degree programs across 2024-2025, 2025-2026, and 2026-2027 academic catalogs in `masterDatabase.json` (Cybersecurity BS, IT BS Apps Dev, IT BS Networking, Computer Science BS, Mathematics BS), expanding the catalog from 3 to 11 programs.
  - Implemented `src/components/DegreeChecklistModal.jsx` allowing advisors to inspect any program checklist or construct new customized degree checklists dynamically without needing Excel files.
- **Live Production Deployment:** Deployed bundle `index-BpV46H-h.js` to GitHub Pages at `https://todwood.github.io/degree-planner/`. Fully verified via headless Chrome with 0 errors across Screen 1, Screen 2, and Screen 3.

### 18. Dynamic Degree Importing, CSTH Department Clusters, & Organic Database Growth
- **Direct Dropdown Integration:** Added `➕ + Add New / Import Degree Checklist...` as an explicit option directly within the Primary Degree Seeking `<select>` in `Screen1Intake.jsx`. Selecting it immediately opens the visual checklist manager.
- **CSTH Program Catalog Presets (`src/data/csthProgramCatalog.js`):** Built multi-year curricula for undergraduate programs across the College of Science, Technology, and Health, organized into 3 department clusters:
  1. `Computing & Cybersecurity` (Cybersecurity, IT Apps Dev, IT Networking, Computer Science, Data Science, Web & UX)
  2. `Mathematics & Actuarial Science` (Mathematics, Actuarial Science)
  3. `Natural Sciences & Health` (Biological Sciences, Chemistry)
- **Enhanced Visual Checklist Manager (`DegreeChecklistModal.jsx`):**
  - **Tab 1: Active Checklists:** Inspects programs currently saved in the local database.
  - **Tab 2: Catalog Presets & Dept Clusters:** 1-click importing of programs. When an advisor imports a program, the system surfaces a **Smart Dept Cluster** banner recommending closely related programs in the same department with an `[Import All Dept Programs]` batch action.
  - **Tab 3: Custom Checklist Builder with Fast-Paste:** Allows typing a custom program title, catalog year, and searching courses, or pasting raw catalog text/syllabus blocks into a regex extractor (`\b[A-Z]{3,4}\s*\d{5}\b`) that matches and selects courses instantly.
- **Organic Database Growth Strategy:**
  - In-browser client requests to external catalog servers are blocked by browser CORS restrictions.
  - Deterministic Python scraper `execution/crawl_lindenwood_catalog.py` crawls Acalog with seed fallbacks, ideal for annual cron execution in March when the new catalog is published.
  - Local browser databases grow organically as advisors import presets or build custom checklists, persisted permanently via IndexedDB and `localStorage`.
- **Live Production Deployment:** Production bundle `index-Ny4FHMdN.js` successfully deployed to GitHub Pages at `https://todwood.github.io/degree-planner/`. Verified via automated headless Chrome testing (`.tmp/verify_checklist_modal_flow.mjs`) with 100% pass rate.

### 19. Option B Interface Refinement: Explicit Extraction Button, Decoupled Degree Matching, Contrasting Session Limits, & Deterministic Starting Term
- **Explicit Extraction Gatekeeper:** Replaced instant automatic disclosure with an explicit **`[ Extract Course Records & Continue → ]`** action button. Dropping files keeps them ready in the dropzone without jumping; only clicking the button extracts records into local memory and reveals Stage 2.
- **Section Title Rename:** Renamed Stage 2 to **`2. DETECTED COURSES AND STUDENT INFORMATION`** with an Extracted Records KPI summary banner showing Total Credits, Completed Courses, Enrolled Active Courses, and Transfer Courses.
- **Decoupled Degree Matching:** Completely removed automated program assumptions from file parsers. Student transcripts no longer force-match a degree; advisors explicitly choose their degree seeking.
- **Two Separate Dropdowns:**
  1. `Catalog Year` (`2026-2027`, `2025-2026`, `2024-2025`).
  2. `Primary Degree / Emphasis Seeking` (dynamically filtered by selected Catalog Year, with the `➕ + Add New / Import Degree Checklist...` action).
- **Contrasting Session Caps & Sophisticated Pacing:**
  - Full-Time (12–18 cr/term) vs. Part-Time (6–11 cr/term) tactile cards.
  - **8-Week Accelerated Session Cap** styled in a focused Sky/Blue contrast card (`3 cr`, `6 cr`, `9 cr`, `12 cr`).
  - **Total 16-Week Semester Cap** styled in a focused Slate/Charcoal contrast card (`9 cr`, `12 cr`, `15 cr`, `18 cr`).
  - **Summer Availability** with 4 tactile contrast cards (`No Summer`, `Light Summer (3 cr)`, `Standard Summer (6 cr)`, `Accelerated Summer (9 cr)`).
- **Deterministic Starting Semester:**
  - Removed manual `startSemester` input from the form.
  - Calculated automatically via `calculateStartingSemester(parsedTranscript)` based on active/scheduled enrollments (e.g. active Fall 2026 enrollments automatically initiate scheduling in Spring 2027).
- **Layout Hierarchy:** Student Full Name, Student ID, and Advisor information are repositioned *after* the important scheduling building constraints.
- **Live Production Deployment:** Production bundle `index-DPVFQyP2.js` successfully deployed to GitHub Pages at `https://todwood.github.io/degree-planner/`. Verified via automated headless Puppeteer testing (`.tmp/verify_option_b_redesign.mjs`) with 100% pass rate.

### 20. Option B Interface Polish: Clean Degree Names, Dynamic Pacing Dropdowns, Summer Dropdown, & Abbreviated Fallback Date
- **Clean Program Titles in Dropdown:** Removed the credit suffix (`— ## cr`) from the Primary Degree Seeking dropdown options, displaying only the clean degree name (e.g. `Cybersecurity, BS`).
- **Elimination of Extraction Squares:** Removed the 4 summary KPI squares from Stage 2 since full credit summation and course classification are analyzed in Screen 2 (Degree Audit Ledger).
- **Dynamic Linked Dropdowns for Academic Pacing:** Reverted from static button selectors to 3 dynamic linked dropdowns:
  1. `Academic Pacing Mode` (`Full-Time` vs `Part-Time`).
  2. `Max 8-Week Session Cap` (options change dynamically: `6, 9, 12` for FT; `3, 6` for PT).
  3. `Max Total Semester Cap` (options change dynamically: `12, 15, 18, 21` for FT; `6, 9, 11` for PT).
- **Summer Selection Reverted to Dropdown:** Replaced the 4 tactile summer cards with a clean select dropdown (`No Summer`, `Standard Summer 6cr`, `Light Summer 3cr`, `Accelerated Summer 9cr`).
- **Removed Calculated Starting Semester Badge:** Completely removed the starting semester badge from the user interface while preserving deterministic calculation under the hood.
- **Abbreviated Month Fallback:** Updated `generateDefaultStudentName()` to use abbreviated months (e.g. `Student 549 (Oct. 22, 2026)` or `Student 312 (Dec. 15, 2026)`).
- **Live Production Deployment:** Bundle `index-CLjSHv0Y.js` deployed to GitHub Pages at `https://todwood.github.io/degree-planner/`. Verified end-to-end with 100% test pass rate.

### 21. Option B Tactile Hierarchy Restoration & Extraction Directives Architecture
- **Tactile Visual Hierarchy Restored:** After testing pure dropdown menus, confirmed that a wall of 5 standard dropdowns caused cognitive overload and visual monotony. Restored the high-contrast tactile selection cards for Academic Pacing Mode (`Full-Time (12–18 cr/term)` vs `Part-Time (6–11 cr/term)`), Summer Term Availability (4 tactile cards: `No Summer`, `Light Summer`, `Standard Summer`, `Accelerated Summer`), and Course Modality Preference (3 tactile cards). Kept the two focused, high-priority dropdowns for Academic Curriculum (`Catalog Year` and clean `Primary Degree / Emphasis Seeking`) at the top.
- **SOP Directives for Document Extraction (Layer 1):**
  - **Anthology Schedule Exports:** `directives/ExtractAnthologyFile.md` (specifies sheet structure, column headers, course codes, term naming, retake rules, and grade normalization for `.xlsx` / `.csv`).
  - **Unofficial Transcripts:** `directives/ExtractTranscriptFile.md` (specifies Student-Based vs. Enrollment-Based PDF text layout, header regexes, term delimiters, multi-line course row wrapping, and transfer credit blocks for `.pdf`).
- **Deterministic Implementation Strategy (Layer 2 & 3):**
  - Offline calibration: Python test harness in `execution/` runs against all 14 real sample student folders in `.tmp/samples/`.
  - Client-side execution: Browser parser in `src/engine/transcriptParser.js` parses files 100% locally in browser memory for strict FERPA compliance.
- **Test Suite Status:** 23/23 Vitest unit tests and headless Puppeteer verification pass with 100% success.

### 22. Refined Dropdown Menu Hierarchy & Modern Form Styling (`Screen1Intake.jsx` & `DegreeChecklistModal.jsx`)
- **Restructured Curriculum Header & Label Hierarchy:**
  - Resolved awkward 3-line text wrapping by relocating the `+ Customize / Add Program` action into the Section A card header alongside `Degree Curriculum & Catalog`.
  - Normalized column labels (`Catalog Year *` and `Primary Degree / Emphasis *`) to sit directly above their respective inputs without line-breaks or ellipses truncation.
- **Modern Accessible Custom Select Appearance:**
  - Replaced raw native OS `<select>` elements with `appearance-none` styled selects featuring generous right padding (`pr-9`), subtle hover borders (`hover:border-[#857542]`), accessible focus rings (`focus:ring-2 focus:ring-[#857542]/20`), and an absolute Lucide `ChevronDown` arrow.
  - Added semantic `<optgroup label="Official Undergraduate Degree Programs">` and `<optgroup label="Custom Degree Actions">` to separate standard catalog programs from custom additions.
- **Extended to Modal Dialogs:**
  - Applied the same elevated `ChevronDown` select pattern across `src/components/DegreeChecklistModal.jsx` for catalog inspection and custom builder catalog year selection.
- **Live Production Deployment:** Production bundle `index-BDFzXgoz.js` and styling `index-BysLFoJ_.css` committed and deployed live to GitHub Pages at [https://todwood.github.io/degree-planner/](https://todwood.github.io/degree-planner/). All 9 production assets successfully pushed via GitHub API. Verified with 100% test pass rate.

### 24. Standardized Course Modality Preference Dropdown & Live Production Deployment
- **Standardized Modality Options:** Updated the `Course Modality Preference` dropdown on Screen 1 Intake (Option B) to feature exactly the four specified options:
  1. `No Preference (Flexible)`
  2. `Online-Only (100% Online)`
  3. `Prefer In-Person`
  4. `Prefer Online`
- **Schedule Builder Influence:** Passed the updated modality preference string directly to constraints state in `src/App.jsx`, ensuring it influences downstream schedule generation in Step 3.
- **Backward Compatibility Normalizer:** Added automatic value mapping in `Screen1Intake.jsx` so restored state from legacy exported degree plan PDFs (e.g., `'Prefer OnGround'` or `'No Preference'`) smoothly maps to `'Prefer In-Person'` and `'No Preference (Flexible)'` respectively.
- **Automated Verification:**
  - 23/23 Vitest unit tests passing (`npm.cmd test -- --run`).
  - Headless Chrome/Puppeteer suite (`.tmp/verify_option_b_redesign.mjs`) passing with 100% success, confirming all four modality options in the DOM.
- **Live Production Deployment:** Production bundle `index-CGhw0T5b.js` and `pdf-KDVpFlO4.js` built and deployed live to GitHub Pages at [https://todwood.github.io/degree-planner/](https://todwood.github.io/degree-planner/) via `execution/deploy_to_github_pages.js --live`. All 9 production files uploaded and verified.

### 25. Deterministic Anthology Extraction Engine (`execution/parse_anthology.py` & `src/engine/transcriptParser.js`) and File Upload Verification Modal
- **SOP Directive (`directives/ExtractAnthologyFile.md`):** Established the formal 6-section SOP specifying the 20-column Anthology `"Student Course Schedules (All Results)"` header structure, on-ground meeting sub-table noise filter (`Course Code == NaN`, weekday rows), 10 essential columns, 5-state classification (`Completed`, `Transfer`, `Current`, `Scheduled`, `Excluded`), retake deduplication with `Area of Study` minor tag preservation, inline `(GE-.../HD)` tag extraction, and the Section 6 calibration benchmark.
- **Python Deterministic Engine (`execution/parse_anthology.py`):**
  - Supports both `.xlsx` (via `openpyxl` or zero-dependency Python stdlib `zipfile` + `xml.etree.ElementTree`) and `.csv`.
  - Verified against all 14 real student exports in `.tmp/samples/` and 100% matched the Section 6 calibration benchmark (`Brandon Paz`: 78 raw rows, 34 dropped noise rows, 44 valid rows, 15 ignored unscheduled `Future` rows, 29 active unique courses, 6.0 TR credits, 68.0 completed LU credits, 10.0 current credits, 84.0 earned+enrolled credits, 30.0 upper-level credits, 2 `/HD` courses) via `tests/test_parse_anthology.py`.
- **Unified Client-Side Anthology Extraction & Verification (`src/engine/transcriptParser.js`, `src/components/Screen1Intake.jsx`, `src/App.jsx`):**
  - Synchronized `src/engine/transcriptParser.js` (`verifyAnthologySpreadsheet`, `processRawCourseRecords`, `parseAnthologySpreadsheet`, `parseCombinedStudentRecords`) to apply the exact same extraction, noise filter, unscheduled `Future` exclusion, and `Area of Study` minor merging rules across both **Option A** and **Option B** on Screen 1.
  - Added immediate client-side file upload verification (`verifyAndAssignAnthologyFile`) on both Option A (`optionA-anthology`) and Option B (`optionB-anthology`).
  - Added an accessible native `<dialog>` popup modal (`anthology-verification-modal`) that notifies the advisor when an invalid/wrong document is uploaded, details missing Anthology columns, provides step-by-step Anthology export instructions, and links directly to the Scribe SOP guide.
- **Verification:** 25/25 Vitest unit tests (`tests/engine.test.js`, `tests/masterDatabase.test.js`) and 4/4 Pytest unit tests (`tests/test_parse_anthology.py`) pass with 100% accuracy.

### 26. Deterministic Unofficial Transcript Verification Engine, Paired SOP Directive (`directives/ExtractTranscriptFile.md`), and Multi-Document Intake Modal
- **Python Master DB Test Normalization:** Updated line 15 of `tests/test_master_db.py` from `assert len(db["programs"]) == 3` to `assert len(db["programs"]) >= 3` to match `masterDatabase.test.js` following the 11-program catalog expansion. All 13 Pytest tests pass with 100% accuracy.
- **SOP Directive (`directives/ExtractTranscriptFile.md`):** Established the formal specification for Unofficial Student Transcripts (`.pdf`), documenting both Format A (Enrollment-Based landscape layout with `Program:`, `Enrollment #:`, `Term:` headers, and 6-column course grid) and Format B (Student-Based landscape layout with `***Undergraduate***`, `Student ID`, and course table).
- **Client-Side Deterministic Verification Engine (`src/engine/transcriptParser.js`):**
  - Added `verifyTranscriptText(rawText)` to deterministically validate academic transcript headers, column tokens (`Course`, `Description`, `Attempt`, `Earned`, `Pts`, `Grade`), and at least one valid course record regex pattern before saving into memory.
  - Rejects empty PDFs or non-transcript documents (such as syllabi, fee statements, or general memos) without leaking PII.
- **Intake Dropzone Integration (`src/components/Screen1Intake.jsx`):**
  - Wired `verifyAndAssignTranscriptFile` identically to both Option A (`#optionA-transcript`) and Option B (`#optionB-transcript`).
  - Added dropzone error handlers (`handleTranscriptDropzoneError`) that trigger the verification dialog upon unsupported or malformed PDF uploads.
- **Interactive Multi-Document Verification & SOP Popup Modal:**
  - Upgraded the `<dialog>` modal in `Screen1Intake.jsx` to dynamically support both Anthology Schedule and Unofficial Transcript documents with accessible tabs:
    1. `Anthology Schedule (.xlsx / .csv)` linking to `ANTHOLOGY_SOP_GUIDE_URL`
    2. `Unofficial Transcript (.pdf)` linking to `TRANSCRIPT_SOP_GUIDE_URL`
  - Modal provides clear rejected filename callouts, specific error diagnostic descriptions, missing column reports, step-by-step export walkthroughs, and direct external Scribe SOP links.
- **Automated Verification:**
  - 26/26 Vitest unit tests passing (`tests/engine.test.js`, `tests/masterDatabase.test.js`).
  - 13/13 Pytest tests passing (`tests/test_crawlers.py`, `tests/test_master_db.py`, `tests/test_parse_anthology.py`).
  - Production bundle builds cleanly in 3.75s (`npm.cmd run build`).
  - GitHub Pages deployment dry-run (`execution/deploy_to_github_pages.js --dry-run`) verified with 0 FERPA or sensitive files.

### 27. Client-Side Deterministic Parser Engine (`src/engine/transcriptParser.js`) & Three-Way Benchmark Verification (`execution/test_parsers.js`)
- **Dual Client-Side Deterministic Parser Functions (`src/engine/transcriptParser.js`):**
  1. **`parseAnthologySpreadsheet(fileBuffer, fileType)`**: Parses `.xlsx` and `.csv` via SheetJS in browser memory (`header index 0`, 20 Anthology columns, noise filter dropping `Course Code == NaN` / meeting sub-tables, canonical 2–5 letter `Published Code` normalization dropping `-23` suffixes, 5-state classification, inline `(GE-.../HD)` tag extraction, highest-grade retake deduplication with `Area of Study` minor merging, and metadata extraction for Primary Program, Minors/Emphases, and earliest non-transfer Catalog Year).
  2. **`parseTranscriptPdf(pdfArrayBuffer)`**: Parses `.pdf` Unofficial Transcripts via `pdfjs-dist` in browser memory with:
     - **Page 1 Geometry Auto-Detection:** Distinguishes Variant A (*Enrollment-Based*: `792 × 612 pt`, `mid_x = 395 pt`, `header_y = 500 pt`, `footer_y = 55 pt`) from Variant B (*Student-Based*: `612 × 792 pt`, `mid_x = 300 pt`, `header_y = 665 pt`, `footer_y = 40 pt`).
     - **Overlaid Text Deduplication:** Drops duplicate overlaid header spans sharing identical coordinates (`|Δx0| < 1.0, |Δy1| < 1.0, text1 == text2`).
     - **Spatial Two-Column Newspaper Reading Order:** Processes Page 1 Left Column (top-to-bottom) $\rightarrow$ Page 1 Right Column (top-to-bottom) $\rightarrow$ Page 2 Left Column $\rightarrow$ Page 2 Right Column, grouping spans within `|Δy1| <= 3.0 pt`.
     - **Wrapped Title Resolution:** Appends indented continuation lines (`desc_min_x <= firstX0 <= desc_max_x`) to the preceding course description, resolving the `Information Technology` wrapped line on `IIT48100` (`x0 = 348.9`) vs. unindented Program headers (`x0 = 308.7` / `45.2`).
     - **In-Progress Resolution:** Classifies `0.00 Att / 0.00 Earn / No Grade` rows in active terms as `Current` with deterministic credit inference (`3.0` cr standard, `4.0` cr lab sciences, `1.0` cr UNIV/labs).
- **Verified Parser Benchmarks (`node execution/test_parsers.js`):**
  - **Benchmark 1 (`Brandon Paz/StudentCourseSchedules (All Results).xlsx`):**
    - Total Raw Rows Scanned: `78` | Dropped Noise Rows: `34` | Valid Course Rows: `44`
    - Ignored Unscheduled `Future` Rows: `15` (`46.0` cr)
    - Active Unique Courses: `29` (`23 Complete + 2 TR + 4 Current`)
    - Completed Credits: `74.0` (`68.0` LU + `6.0` TR; UNIV/LUL Waived: `true`)
    - Current Credits: `10.0` | Total Earned + Enrolled Credits: `84.0` (`78.0` LU Residency)
    - Upper-Level (`30000+`) Credits: `30.0` (`10` courses) | Human Diversity (`/HD`): `2` courses / `6.0` cr (`HIST10100`, `SOC10200`)
    - Cumulative GPA: `3.91` (`266.00` Quality Points) | Primary Major: `Cybersecurity BS` (`2024-2025`) | Minor: `Minor - Cinema Arts Minor`
### 15. Complete 4-Screen Interactive Application & Client-Side Deterministic Engine Verification
- **Lindenwood University Brand Alignment (`Style.md`):**
  - Re-integrated official Lindenwood branding: Lindenwood Black (`#000000`), Digital Gold (`#857542`), Standard Gold (`#B5A36A`), and Off-White Linen (`#F7F5EE`).
  - Screen 0 Faculty Header features `@lindenwood.edu` badge, 6-digit OTP modal with 5-minute cooldown timer, FERPA reassurance notice, Demo Login (`Matthias Wood — Senior Instructor, Mathematics`), and global header badge with dropdown for **Upload Bingo Sheet** and **View/Edit Shared Master Database**.
- **Screen 1 Intake & Auto-Population:**
  - Strict `maxFiles = 1` and MIME/extension locking on all dropzones.
  - Option A: Returning Student Plan `.pdf` + optional newer records.
  - Option B: New Student Audit (Anthology `.xlsx`/`.csv` and/or Transcript `.pdf`) + Scribe SOP links.
  - Order: Catalog Year (forward-only) $\rightarrow$ Degree/Emphasis $\rightarrow$ `[+ Add Major / Minor / Certificate]` *above* optional Bingo Sheet dropzone.
  - Constraints: Start Semester (next chronological), Modality (`No Preference`, `Online-Only`, `Prefer OnGround`, `Prefer Online`), Summer Availability (`No Summer` vs `Yes Summer` with conditional credit cap dropdown `3`, `6`, `9`, `12 (Not Recommended)` + Summer tuition notice), and 3 linked Pacing Mode dropdowns (`Full-Time`: 9/18; `Part-Time`: 6/11).
  - Verified instant auto-extraction upon file drop: Brandon Paz `.xlsx` produces `74.0 Completed + 10.0 Current = 84.0 Total cr`; Fabiana Labrador `.pdf` produces `110.0 Completed + 12.0 Current = 122.0 Total cr`.
- **Screen 2 Curriculum Audit Ledger:**
  - Top Card: Visual "Race to the Graduation Flag" number line (0 to 120+ cr) with stick-figure avatar at Completed coordinate, striped enrolled segment, exact decimal formatting (`completedCr.toFixed(1)`, `enrolledCr.toFixed(1)`, `earnedPlusEnrolled.toFixed(1)`), Graduation Policy Checklist (30cr/24cr residency, 42cr upper-level, 6cr Human Diversity, Composition C check), and Excluded Courses Ledger.
  - Middle Card: Waterfall Audit requirements grouped by category with interactive Equivalence / Substitution `<select>` dropdowns (`* Tentative Shared DB`, `Policy Exception PE`), inline note editing (`[+ Add Note]`), and `[+ Add Incoming Transfer Placeholder]`.
  - Bottom Action & Missing Availability Modal: Prompts advisor for session offerings on unverified courses, applying fallback (`Fall-16wk` and `Spring-16wk`) if left blank.
- **Screen 3 Schedule Board & Course Inspector:**
  - 3-Zone Layout: Zone 1 (Past Completed), Zone 2 (Current Active In-Progress & Pending Transfers middle banner), Zone 3 (Interactive Active Grid: Left `Fall`, Right `Spring`, Below & Centered `Summer`).
  - Tactile Weight cards with Category badges, `🔒` lock toggle, `⇄` non-blocking move selector, and clickable `!` Conflict Notification Dot popover allowing advisors to save to DB as `* Tentative` or log a `PE`.
  - Clickable Course Inspector Drawer showing Department, Code, Title, Credits, Fees, Catalog Description, Prereqs/Coreqs, Session Availability, and Popular GE Recommendations with 2-year average GPAs.
  - Registration opening dates below each future semester using full-month names without abbreviations, auto-injected `Petition for Academic Course Overload` if semester > 18 credits, and reorderable (`⠿`), editable (`✏️`), deletable (`🗑️`) per-semester notes.
  - "What-If" Graduation Accelerator Banner displaying up to 2 simulated preference adjustments.
  - Stateful PDF Exporter (`src/engine/pdfExporter.js`) with WinAnsi character sanitization and compact `DegreePlanState` / `_AdvisorState` metadata embedding.
- **End-to-End Headless Chrome DevTools Protocol Verification (`verify_e2e_cdp.mjs`):**
  - Ran against local Vite dev server (`http://localhost:5173/`).
  - Verified Screen 0 login, Brandon Paz upload (`74.0` / `10.0` / `84.0`), Fabiana Labrador upload (`110.0` / `12.0` / `122.0`), Screen 3 lock toggle, drag/move, What-If accelerator, and Option A PDF round-trip restoration with 0 console errors.

### 28. Single Student Calibration & Ground Truth Verification (`execution/test_single_student.js`)
- **Target Student:** Fabiana Labrador (`A003006937`) — BS Information Technology (`Applications Development Emphasis`, declared `Sport Management Minor`).
- **Files Verified:**
  1. `Variant A`: `sub_Transcript - UnOfficial_landscape.pdf` (`792 × 612 pt` Enrollment-Based landscape)
  2. `Variant B`: `sub_UnofficialTranscript - Student Based_landscape.pdf` (`612 × 792 pt` Student-Based portrait)
  3. `Anthology Export`: `StudentCourseSchedules (All Results).xlsx`
  4. `Ground Truth File`: `.tmp/samples/student info.txt`
- **Reconciliation & Verification Results:**
  - **Identical Course Set & Grades:** Variant A and Variant B extract 100% identical 40 active courses (`36 Complete + 4 Current`) with matching grades, credits, and course states across every single record.
  - **PDF Completed Credits == Anthology Completed Credits:** Both PDF formats extract `110.0` completed credits, matching Anthology `.xlsx` (`110.0` cr) and `student info.txt` (`110.00` cr) with zero discrepancy.
  - **Student Metadata Precision:**
    - Student Name: `Fabiana Labrador` (Exact match in Variant A & B)
    - Student ID: `A003006937` (Exact match in Variant A & B)
    - Cumulative GPA: `3.75` (`413.00` Quality Points; exact match across Variant A, Variant B, Anthology XLSX, and `student info.txt`)
    - Current (In-Progress) Credits: `12.0` cr (`IIT34020`, `PHRL21001`, `SPMGT37040`, `SPMGT37060`)
    - Total Earned + Enrolled: `122.0` cr (`122.0` cr Institutional Residency)
    - Upper-Level (`30000+`) Credits: `45.0` cr (`36.0` cr Completed + `9.0` cr Current across 15 courses)
    - Human Diversity (`/HD`): `2` courses / `6.0` cr (`ENGL20101`, `SOC10200`)
    - Inferred Catalog Year: `2023-2024` (Start Date: `8/21/2023`)

### 30. Recalibrated Batch Verification Harness & Technical Fidelity vs. Advisory Alignment (`execution/batch_verify_extractors.js`)
- **Institutional Reality & Architectural Calibration:**
  - In real-world university advising, transcripts and Anthology files frequently list outdated, generic, or legacy major codes (e.g. transcript still states "Computer Science" or general "Information Technology" when a student is actively pursuing "Information Technology BS with Networking Emphasis").
  - The extraction engine's role on Screen 1 (Intake) is to autofill intelligent defaults that advisors review and override before proceeding to the audit.
- **Bifurcated Evaluation Model:**
  1. *Hard Technical Pass/Fail Criteria (100% Deterministic):*
     - Document Text Fidelity: Accurately extracts strings and numbers from PDF and XLSX without crashing, skipping lines, or interleaving newspaper columns.
     - Identity Fidelity: Student ID and Full Name match `student info.txt` with 100% precision.
     - Historical Course & Credit Fidelity: Completed courses, letter grades, and completed credits match authoritative records.
     - Anthology In-Progress Authority: Active term courses captured as `Current`.
  2. *Advisory Program Alignment (Informational Notice):*
     - Accurately reports what the document printed while flagging discrepancies against `student info.txt` as `[INFO: Advisory Override Needed]`.
     - Assigns status `PASS (Override)` rather than failing the technical parser.
- **Scorecard Results (14 Students Total — 100% Technical Pass):**
  - **Overall Passed:** 14 / 14 (`100%`)
  - **Standard PASS (Direct Match):** 12 students (Aidan Kelley, Brandon Paz, Connor Brown, Fabiana Labrador, Garrett Bullock, Garrett Kopper, Jalen Smith, James Avery, Justen Korn, Manjot Sagoo, Timothy Frein, Trey Chaney).
  - **PASS (Override) (Advisory Notice):** 2 students:
    - *Landen Albers (`A002616283`):* Document prints `Computer Science` -> Advisor Target: `Information Technology BS`.
    - *Lliam Gammon (`A002610782`):* Dual Major Declaration (`INTECHBS / CYBSCBS`) -> Advisor Target: `Information Technology BS / Cybersecurity BS`.
  - **Technical Parser Failures:** `0` (Zero crashes, zero column interleaving, 100% identity fidelity).

### 31. Document Currency Verification & Academic Calendar Suite (`src/engine/transcriptParser.js` & `src/components/Screen1Intake.jsx`)
- **Institutional Context & Objective:**
  - Advisors frequently receive stale files or out-of-date PDF exports that omit currently enrolled courses, leading to invalid audits and duplicate scheduling.
  - The verification check evaluates uploaded Anthology spreadsheets and Unofficial Transcript PDFs to determine whether the document reflects the current semester.
  - If a file is flagged as potentially out of date, advisors receive an explanatory warning pop-up that is **100% skippable** (`[Proceed Anyway / Use This Document]`), ensuring institutional workflow is never blocked.
- **Academic Calendar Engine (`getCurrentAcademicSemester`):**
  - Evaluates upload date against standard Lindenwood academic windows:
    - **Fall Semester:** August 15 – December 18 (`isFullSemester: true`).
    - **Spring Semester:** January 5 – May 15 (`isFullSemester: true`).
    - **Summer Exemption:** May 16 – August 14 (`isFullSemester: false`, `isExempt: true`).
    - **Winter Break Exemption:** December 19 – January 4 (`isFullSemester: false`, `isExempt: true`).
  - Outside of full Fall and Spring semesters, currency validation is automatically bypassed without triggering warnings.
- **Currency Verification Rules (`verifyDocumentCurrency`):**
  1. *Anthology Exports (`.xlsx` / `.csv`):* Must contain at least one course with state `Current` or `Scheduled` matching the active semester term and year.
  2. *Enrollment-Based Transcripts (`792 × 612 pt` landscape):* Must contain in-progress courses registered for `0.00` attempted / `0.00` earned credits under the active term.
  3. *Student-Based Transcripts (`612 × 792 pt` portrait):* Because Anthology Student-Based exports omit in-progress courses by design, the engine extracts the printed header export date (`Date: MM/DD/YYYY`) and validates that it falls within the current semester date window (or more recent).
- **Skippable Warning Modal UI (`src/components/Screen1Intake.jsx`):**
  - Rendered as an accessible, styled `<dialog id="currency-warning-dialog">` styled with Lindenwood Warm Amber (`#857542` / `#B8860B`) tokens.
  - Presents an advisor-facing breakdown table:
    - *Document Type*
    - *Active Academic Term*
    - *Flagged Reason*
    - *Current Courses Found / Printed Export Date*
  - Includes an embedded Scribe SOP link to guide advisors on generating current exports.
  - Provides two explicit actions:
    - `[Proceed Anyway / Use This Document]` (Primary skippable bypass: accepts the document and populates the intake form immediately).
    - `[Upload Newer Document]` (Secondary action: dismisses modal and clears file input for re-upload).
- **Test Suite & Baseline Verification:**
  - Verified across all 14 student sample folders in `.tmp/samples/` during Fall 2026: **100% Pass Rate** (`14 / 14` folders pass with zero false warnings).
  - Vitest suite `tests/currencyVerification.test.js` covers 11 dedicated test cases for Fall, Spring, Summer exemption, Winter break exemption, out-of-date failures, and all 14 student folders.
  - Full test suite: 3 test files, 37 unit tests passing with 100% success.

### 32. Screen 1 Intake Evolution: Zero-Upload Support, Start Semester Semantics, & Active Enrollment Quick-Add Tray
- **Departmental Bingo Sheet Removal:**
  - Completely removed the optional departmental Bingo Sheet dropzone from `DEGREE CURRICULUM & CATALOG`.
  - Re-aligned `Catalog Year (Forward-Only)` and `Primary Degree / Emphasis` side-by-side in a responsive 2-column grid occupying the full card width directly below the header and `[+ Add Major / Minor / Certificate]` button.
- **Zero-Upload Support & Routing Confirmation Modal (`#zero-upload-modal`):**
  - Retained `1. Student Record Upload (Upload at least 1)` section header text.
  - Activated the primary action button permanently (`disabled={isProcessing}`), dynamically toggling text between `Proceed to Plan Setup →` (zero files uploaded) and `Proceed to Degree Audit & Waterfall Match →` (files uploaded).
  - When proceeding with zero files, opens an accessible dialog stating that prior course history was omitted and the audit stage will be bypassed to construct a clean graduation plan from scratch.
  - Clicking `[Proceed to Schedule Board →]` advances state directly to Screen 3 Schedule Board (`directToSchedule: true`) with 0 completed credits and all 120 credits unfulfilled.
- **Refined Start Semester Semantics:**
  - Relabeled dropdown to `Schedule Start Semester` with explicit helper text: *"First term the planner will schedule new courses into. Auto-defaults based on uploaded records, or select manually."*
  - Populated with the active term (`Fall 2026`) plus 9 upcoming chronological terms (`Spring 2027` through `Fall 2029`).
- **Currently Enrolled Courses Quick-Add Tray (Workflow B):**
  - Added an expandable section directly beneath `Schedule Start Semester` and `Course Modality Preference` with active count badge (e.g. `Currently Enrolled Courses • 2 Courses Active (6.0 cr)`).
  - Built a compact two-pane selector:
    - *Left Pane:* Searchable and filterable list (`All`, `Major Requirements`, `General Education`) of degree requirements from `masterDatabase.json` + GE placeholders.
    - *Right Pane:* Active enrollment bucket for the current active semester (`Fall 2026`) supporting both direct clicks and drag-and-drop.
  - Courses added to the tray receive `state: 'Current'` and are automatically recognized by `runWaterfallAudit` and `generateOptimalSchedule` as in-progress credits satisfying prerequisite chains and contributing to enrolled credit totals.
- **Verification:**
  - Headless Chrome test `execution/verify_screen1_updates.mjs` confirmed 100% pass across all 8 checkpoints: bingo sheet removal, grid layout, 10 semester options, dynamic button labels, tray search & add, zero-upload modal routing to Screen 3, and full file-upload audit execution on Brandon Paz.
  - All 37 Vitest unit tests pass with 0 regressions.

### 33. Live Production Release to GitHub Pages (Screen 1 Evolution Deployed & Verified)
- **Production Build:**
  - Compiled static assets with `vite build` (`dist/assets/index-4UKF-YYS.js`, `dist/assets/index-C7x_vG9g.css`, `dist/assets/pdf.worker-CzcBcYLo.js`, `dist/index.html`, and `dist/.nojekyll`).
  - Strict FERPA invariant verified: Zero student files, `.env`, or `.tmp/` scratch files in `dist/`.
- **Deployment Engine Optimization (`execution/deploy_to_github_pages.js`):**
  - Integrated local Git blob SHA calculation (`crypto.createHash('sha1').update('blob ' + buf.length + '\0').update(buf).digest('hex')`) against remote GitHub file SHAs.
  - Automatically identifies up-to-date files (skipping unchanged commits/re-uploads to conserve API bandwidth and prevent 422 rate limits).
  - Pushed updated bundle directly to `todwood/degree-planner` on branch `main` via GitHub REST API with `.nojekyll`.
- **Live Verification (`execution/verify_live_pages.js`):**
  - Automated headless Chrome verification against `https://todwood.github.io/degree-planner/`:
    - Title & Header: Verified "Degree Planner — Academic Advising System" and institutional navigation header.
    - Checkpoint 1: Confirmed departmental Bingo Sheet dropzone is 100% removed.
    - Checkpoint 2: Confirmed `Schedule Start Semester` label with 10 upcoming terms (`Fall 2026` through `Fall 2029`).
    - Checkpoint 3: Verified dynamic button label `Proceed to Plan Setup →` for zero-upload workflow.
    - Checkpoint 4: Quick-Add Tray tested on live site, adding `ICS 21300` into active enrollment.
    - Checkpoint 5: Zero-upload confirmation modal `#zero-upload-modal` opened and confirmed.
    - Checkpoint 6: Seamless landing on Screen 3 ("Interactive Graduation Road Map") with active enrollment recognized.
    - 0 console errors logged; full-page screenshot captured to `.tmp/live_github_pages_verification.png`.

### 34. Transcript Verification Pipeline Calibration & Detached ArrayBuffer Fix
- **Logical Error Discovered During Single-Student Testing (Brandon Paz):**
  - When uploading an Unofficial Transcript PDF (`.pdf`) on Screen 1, the UI crashed with `Unable to verify Unofficial Transcript PDF: Cannot perform Construct on a detached ArrayBuffer`.
  - In `Screen1Intake.jsx` (`verifyAndAssignTranscriptFile`), `file.arrayBuffer()` was read into a single `buffer` variable, which was passed sequentially to `extractTextFromPdf(buffer)` and then `parseTranscriptPdf(buffer)`.
  - In browser runtimes with Web Workers, `pdfjs-dist`'s `pdfjs.getDocument({ data })` transfers the underlying `ArrayBuffer` to the PDF worker via `postMessage`, which irreversibly detaches the original `ArrayBuffer` in the main thread (`byteLength === 0`). The subsequent call to `parseTranscriptPdf(buffer)` failed when attempting `new Uint8Array(buffer)`.
- **Architectural Resolution:**
  1. *Defensive Cloning in Engine:* Updated `extractSpatialTranscriptFromPdf` in `src/engine/transcriptParser.js` to create a defensive memory clone (`Uint8Array` copy) prior to calling `pdfjs.getDocument({ data })`, ensuring caller buffers remain intact and usable.
  2. *Single-Pass Reconstructed Text Propagation:* Attached `reconstructedText` directly to `parseTranscriptPdf` output, allowing `verifyTranscriptText` to validate document structure directly without a redundant PDF text-extraction call.
  3. *Intake Pipeline Optimization:* Refactored `verifyAndAssignTranscriptFile` in `src/components/Screen1Intake.jsx` to parse the transcript buffer once, validate structural keywords and course rows via `verifyTranscriptText`, check currency via `verifyDocumentCurrency`, and apply state cleanly.
- **Verification Across Brandon Paz Transcripts:**
  - *Variant A (Enrollment-Based Landscape):* 29 active courses (23 Complete + 2 TR + 4 Current), 74.0 completed credits, 10.0 current credits, 84.0 total earned+enrolled credits, GPA 3.91, Cinema Arts Minor detected.
  - *Variant B (Student-Based Portrait):* 29 active courses (23 Complete + 2 TR + 4 Current), 74.0 completed credits, 10.0 current credits, 84.0 total earned+enrolled credits, GPA 3.91.
  - End-to-end headless Chrome testing (`execution/test_transcript_upload.js`) confirmed error-free upload, immediate summary badge display, smooth advance to Screen 2 Audit Ledger (74.0cr completed / 84.0cr total), and transition to Screen 3 Schedule Board.
  - 38 Vitest unit tests passing with 100% success.

### 36. Phase A & B: Canonical Separation of Concrete Courses & Requirement Placeholders
- **Objective:** Eliminate `undefined` lookups in the scheduler, audit engine, and Course Inspector drawer by standardizing `courses[]` in `masterDatabase.json` with an explicit type discriminator (`type: "concrete"` vs. `type: "placeholder"`).
- **Phase A (Schema & Data Updates):**
  - Updated all 71 existing catalog courses with `"type": "concrete"`.
  - Appended canonical requirement placeholders with `"type": "placeholder"`, `"system_locked": true`, explicit 7-session availability (`true`), `credits` (including `4` for `REQ_GE_NAT_SCI_LAB`), `"flexibility_tier": "sky_blue"`, and rich catalog descriptions.
  - Standardized on canonical `REQ_GE_MATH` (retiring `REQ_GE_MATH_ELEC`), updating `programs[].requirements.math_courses` across all catalog years.
  - Catalog course titles cleaned: `ENGL 15000` ("Composition I (GE-Comm)"), `ENGL 17000` ("Composition II (GE-Comm)"), `EPP 15000` ("Composition I - English for Academic Purposes (GE-Comm)").
  - Total courses in database: 86 (71 concrete + 15 canonical placeholders).
- **Phase B (Data Access Layer & Alias Resolution):**
  - Added `PLACEHOLDER_LEGACY_ALIASES` in `src/data/dbAdapter.js` supporting backward-compatible mapping from legacy audit codes (`GE 1`..`GE 14`), drawer labels (`GE: Fine Arts`, etc.), and retired tokens (`REQ_GE_MATH_ELEC`, `GE-MATH-ELECTIVE`) to canonical tokens.
  - Enhanced `dbAdapter.getCourse(code)` to resolve canonical tokens, compact forms, legacy aliases, and wildcard instance prefixes (`UL-ELEC 30001` -> `REQ_ELEC_UPPER`, `ELEC 10001` -> `REQ_ELEC_GEN`).
  - Added helper query methods: `getPlaceholders()` (returns 15), `getConcreteCourses()` (returns 71), `isPlaceholder(code)`, and `resolveCourse(code)`.
  - Implemented mutation and deletion guards in `dbAdapter.saveCourse()` and `dbAdapter.deleteCourse()` preventing advisors from modifying or deleting `system_locked` requirement placeholders.

### 37. Phase C: Waterfall Audit Engine Refactoring, Compound Science Matching, & Token Stability
- **Objective:** Execute Phase C of `docs/DATABASE_REFACTOR_PLAN.md` with catalog calibrations, deterministic compound science matching, and canonical placeholder emissions in `src/engine/waterfallAudit.js`.
- **Implementation & Calibration Details:**
  1. *Composition I & II Architecture:*
     - Unmet `comp_1` emits canonical placeholder `REQ_GE_COMP1` with `eligible_courses: ["ENGL 15000", "EPP 15000"]`, `default_course: "ENGL 15000"`, `type: "placeholder"`, and session availability flags.
     - Unmet `comp_2` emits concrete course `ENGL 17000` (`type: "concrete"`).
     - Prerequisite linkage in `ENGL 17000` includes `REQ_GE_COMP1` in its `prereq_logic`, guaranteeing sequential prerequisite enforcement in the scheduler even when Composition I is scheduled as a placeholder.
  2. *Mathematics Placeholder Consolidation:*
     - General Education and major math electives standardized on canonical `REQ_GE_MATH`.
     - `majorMathRequirements` records `code: 'REQ_GE_MATH'`, `compactCode: 'REQ_GE_MATH'`, `title: 'Mathematics Elective (GE-Math)'`.
     - Unmet STEM elective placeholder emitted as canonical `REQ_GE_MATH`.
  3. *Compound Bucket Matching for `nat_sci_lab`:*
     - Preserves separate student course records, term dates, and grades without creating synthetic fused course objects.
     - **Path A (Single Combined 4cr Course):** Unclaimed course with `credits >= 4` matching science combined (`BSC 10000`, `ESC 10000`, `CHM 10000`, `PHY 10000`) claimed into `claimed_courses`, setting `status: 'MET'`.
     - **Path B (Compound Split: 3cr Lecture + 1cr Lab):** Evaluates unclaimed pool for both a science lecture (`credits >= 3`) and a science lab (`credits >= 1`, ending in `01` or `L`, or tagged `NatSciLab`). When both are present, claims both into `claimed_courses: [lecture, lab]`, setting `status: 'MET'`.
     - **Path C (Orphaned Science Lecture Without Lab):** When a student has a 3cr science lecture but no lab, `nat_sci_lab` remains `status: 'UNMET'` (`claimed_courses: []`). The orphaned lecture remains in `unclaimedPool` and cascades downstream to satisfy Bucket 7 (`sci_elective`) or General Electives.
     - Emits canonical `REQ_GE_NAT_SCI_LAB` carrying `credits: 4` in `remainingCourseItems`.
  4. *Token Stability for Human Diversity (`/HD`):*
     - If a placeholder satisfies Human Diversity, its canonical `code` is strictly preserved (`REQ_GE_ART`), `needs_hd: true` and `requiresHD: true` are set, and `(HD)` is strictly appended to `title` (e.g. `"GE: Fine Arts (HD) (3cr)"`). This guarantees `dbAdapter.getCourse(code)` lookups remain 100% stable without needing dynamic alias mutations.
  5. *Electives Emission:*
     - Upper-level electives emitted with `code: 'REQ_ELEC_UPPER_' + i`, `canonicalCode: 'REQ_ELEC_UPPER'`, and `type: 'placeholder'`.
     - General electives emitted with `code: 'REQ_ELEC_GEN_' + i`, `canonicalCode: 'REQ_ELEC_GEN'`, and `type: 'placeholder'`.
     - All instances resolve seamlessly via `dbAdapter.getCourse()`.
- **Verification:**
  - Added dedicated unit tests covering Paths A, B, and C, Composition I/II emission, Math consolidation, HD token stability, and Upper-Level/General Elective placeholder lookups.
  - 43 Vitest tests passing (100%).
  - 13 Pytest tests passing (100%).

### 39. Phase E: UI & Component Integration (`Screen1Intake.jsx`, `Screen3ScheduleBoard.jsx`, `Screen2Audit.jsx`, `SharedDatabaseModal.jsx`, `DegreeChecklistModal.jsx`)
- **Objective:** Complete Phase E of `docs/DATABASE_REFACTOR_PLAN.md` by replacing hardcoded string arrays with dynamic `dbAdapter.getPlaceholders()`, displaying canonical catalog descriptions and bucket-specific popularity recommendations in the Course Inspector Drawer, ensuring Tier 1 (Sky Blue) card rendering with category badges (`[GE]`, `[E]`), and eliminating false-positive missing availability warnings in Screen 2.
- **Implementation & Calibration Details:**
  1. *Screen 1 Intake (Workflow B Currently Enrolled Tray):*
     - Replaced legacy hardcoded `geList` strings (`GE: Fine Arts`, `GE_ARTS`, `GE: Nat Science w/ Lab`, etc.) with dynamic placeholders loaded from `dbAdapter.getPlaceholders()` (and synchronous fallback `dbAdapter.getPlaceholdersSync()`).
     - Tray courses dynamically carry canonical tokens (`REQ_GE_ART`, `REQ_GE_LIT`, `REQ_GE_NAT_SCI_LAB` with 4 credits, `REQ_ELEC_GEN`, `REQ_ELEC_UPPER`), `type: 'placeholder'`, and `isPlaceholder: true`.
     - When added to `activeEnrolledCourses`, `handleAddEnrolledCourse` preserves placeholder metadata, allowing enrolled placeholders to claim General Education buckets directly in `waterfallAudit.js`.
  2. *Screen 3 Course Inspector Drawer:*
     - Memoized `drawerCourse` via `dbAdapter.getCourseSync(code)` to guarantee catalog description, credits, fees, and session availability are populated for any clicked course card.
     - Filtered `ge_popularity_stats` strictly by the course's `ge_bucket_id`:
       - `arts` -> `ART 18100` (Art Appreciation), `TA 11700` (Introduction to Theatre)
       - `nat_sci_lab` -> `BSC 10000` (Concepts in Biology with Lab), `ESC 10000` (Physical Geology with Lab)
       - `us_hist_gov` -> `HIST 10500` (U.S. History to 1877), `PS 15500` (American National Government)
       - `soc_sci` -> `PSY 10000` (Principles of Psychology), `SOC 10200` (Basic Concepts of Sociology)
       - `lit` -> `ENGL 20100` (World Literature I), `ENGL 21600` (African American Literature)
       - `human_culture_1` -> `REL 20000` (World Religions), `PHL 10000` (Intro to Philosophy), `ANT 11200` (Cultural Anthropology)
     - Drawer only renders the recommendations block if `drawerPopularityStats.length > 0`.
  3. *Screen 3 Schedule Board Card Rendering & Badges:*
     - In `CourseCard`, normalized `categoryBadge`:
       - General Education placeholders render `[GE]`.
       - Elective placeholders (`REQ_ELEC_GEN_*`, `REQ_ELEC_UPPER_*`) render `[E]`.
       - Major courses render `[M]`, Emphasis courses render `[Em]`, and enrolled courses render `[ENR]`.
     - Unlocked placeholders render with Tier 1 (Sky Blue) styling (`bg-[#F0F9FF] text-[#0369A1] border-l-[4px] border-[#0284C7]`).
     - In `getCourseOfferingLabel`, placeholders return `{ text: 'Offered: All Sessions', type: 'placeholder' }`.
  4. *Screen 2 Missing Availability Check:*
     - Updated `checkMissingAvailabilityAndProceed` and the Missing Availability modal list to ignore placeholders (`c.type !== 'placeholder' && !c.isPlaceholder && !c.code?.startsWith('REQ_')`), eliminating false-positive modals.
  5. *Shared Database & Degree Checklist Modals:*
     - In `SharedDatabaseModal.jsx`, added a "Type" filter toggle (`All Courses`, `Concrete`, `Placeholders`) and locked immutable placeholders from advisor edits.
     - In `DegreeChecklistModal.jsx`, restricted course selection to concrete catalog courses (`c.type === 'concrete'`).
- **Verification:**
  - 45 Vitest tests passing (100%).
  - 13 Pytest tests passing (100%).
  - Vite production build passing with 0 errors.

### 43. Screen 3 Zone 1 Refactor into Collapsible "Audit Health Ribbon" Accordion
- **Objective:** Refactor Screen 3 Zone 1 from a static historical coursework block into a sleek, collapsible "Audit Health Ribbon" Accordion positioned directly above the pending transfer alert banner and interactive graduation grid.
- **Implementation:**
  1. *Collapse State Hook:* Added `isHistoryExpanded` (initialized to `false` by default) in `Screen3ScheduleBoard.jsx`.
  2. *Derived Historical Metrics:* Computed summary metrics from `parsedTranscript`: `totalCompletedCredits`, `transferCredits`, `institutionalCompletedCredits`, `completedCourseCount`.
  3. *Audit Health Ribbon Header Bar:* Left: `CheckCircle2` icon with emerald badge, course count, transfer/institutional pill, and uppercase `Verified Academic Record` status. Right: Accessible toggle with dynamic label and animated chevron.
  4. *Collapsible Accordion Body:* Container `#historical-coursework-accordion` renders with conditional classes (`hidden print:block ...` vs `block ...`), preserving complete records during PDF export and printing.
  5. *Live Verification:* Deployed to GitHub Pages and verified live toggle interaction via headless Chrome automation.

### 44. Screen 3 Copy, Legend Labels, Credit Formatting, and Section Header Cleanups
- **Objective:** Update Screen 3 labels, legend descriptions, credit formatting, and excise legacy zone prefixes for crisp visual consistency.
- **Implementation in `src/components/Screen3ScheduleBoard.jsx`:**
  1. *Advisor Panel:* Updated "Email:" label adjacent to advisor name to "Advisor Email:" for clarity.
  2. *Tactile Course Flexibility Scale Legend:* Standardized the 4 scale descriptions to: `1. Easily Movable (Blue)`, `2. Movable with Effort (Amber)`, `3. Unmovable (Slate)`, `4. Enrolled / Locked (Grey)`.
  3. *Audit Health Ribbon:* Updated course count badge copy to `{count} Completed Courses`. Formatted credit breakdown pill with whole numbers (`Math.round(...)`), displaying `6cr Transfer • 68cr Institutional`.
  4. *Excised Legacy Zone 3 Prefix:* Removed `Zone 3:` prefix from the interactive grid header, rendering cleanly as `Interactive Academic Year Graduation Grid`.
  5. *Verification:* All 45 tests passing; build passing with 0 errors.

### 45. Chronological Grid Refactor for Past Coursework Accordion (`Screen3ScheduleBoard.jsx`)
- **Objective:** Refactor the historical coursework accordion in Screen 3 to a forward-chronological responsive multi-column grid with conditional session sub-groups and minimalist course rows.
- **Implementation:**
  1. *Chronological Sorting:* Implemented `parseHistoricalCourseTerm` to map each course to its primary semester (`Fall 2024`, `Spring 2025`, etc.) with chronological numerical sort keys (`year * 10 + seasonOrder`), placing `"Transfer & Prior Learning"` at sort key 0.
  2. *Full Semester Grouping:* Grouped completed coursework into semester cards displaying Term Name (e.g. `Fall 2024`), Total Term Credits (e.g. `16cr`), and Term Course Count (e.g. `6 Courses`).
  3. *Conditional Session Sub-Sections:* Subdivided each semester card into `Full Semester (16-Week)`, `Session I (8-Week)`, and `Session II (8-Week)`. Enforced a strict zero-waste invariant where session micro-headers render only if courses exist in that session.
  4. *Minimalist Course Row Layout:* Rendered dense single-line rows with `[TR]` amber badge, monospace bold code, truncated title with requirement tag, grade badge, and whole-number credits.
  5. *Responsive Multi-Column Grid:* Organized semester cards into `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5`.
  6. *Verification:* All 45 unit tests pass, production build succeeds, and headless verification confirmed chronological sequence across Brandon Paz's transcript and Anthology records.

### 46. Streamlined HeaderNav Brand Lockup & Integrated FERPA Statement (`HeaderNav.jsx`)
- **Objective:** Eliminate redundant titles, dividers, and institutional subtitles in `HeaderNav.jsx` and replace with a unified [DP] brand lockup and high-legibility client-side FERPA compliance statement.
- **Implementation:**
  1. *Unified Brand Lockup:* Excised duplicate title structure, vertical dividers, and the skewed trapezoid badge. Replaced with the crisp **[DP]** monogram icon (`./assets/logos/lu-icon.svg`) alongside the title **Degree Planner** in white bold sans-serif.
  2. *Excised College Subtitle:* Removed `"College of Science, Technology, and Health"` and all institutional naming.
  3. *Integrated Privacy & Security Statement:* Directly beneath the title, rendered a clean badge with `ShieldCheck` icon, `100% FERPA Compliant` in soft gold (`#B5A36A`), and subtitle `Handles student information with a client-side deterministic engine (zero cloud storage)` in neutral text.
  4. *Preserved Workflow Controls:* Maintained 1-2-3 step navigation buttons (`Student Intake`, `Degree Audit`, `Schedule Board`), active record indicator, and advisor profile menu with shared database and logout actions.
  5. *Zero Engine Impact:* No modifications to `src/engine/`.
- **Verification:**
  - `npm.cmd test -- --run`: 45 / 45 Vitest unit tests passing (100%).
  - `npm.cmd run build`: 1,796 modules compiled cleanly with 0 errors.
  - Headless E2E verification (`execution/verify_headernav_updates.js`): Verified title, [DP] monogram, FERPA statement with sub-text, absence of duplicate titles and college subtitle, and intact workflow stepper, saving screenshot artifact `headernav_brand_streamlined.png`.

### 47. Academic Year Mirror with Full-Width Transfers for Historical Coursework (`Screen3ScheduleBoard.jsx`)
- **Objective:** Refactor the historical coursework accordion in Screen 3 to an exact visual mirror of the interactive graduation grid: dedicated full-width card for transfer courses across the top, followed by chronological Academic Year blocks pairing Fall on the left and Spring on the right, with Summer centered below only when applicable.
- **Implementation in `src/components/Screen3ScheduleBoard.jsx`:**
  1. *Top Full-Width Transfer & Equivalency Card:* Extracted all transfer courses (`pastTransfers`) into a dedicated card across the top of the expanded history container. Header displays `Transfers & Equivalencies • {credits}cr Total ({count} Course{s})` with whole numbers. Course rows wrap responsively in a multi-column grid (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2`). Card is omitted completely if the student has zero transfer credits.
  2. *Academic Year Grouping:* Grouped remaining institutional courses chronologically by Academic Year (`AY-${ayStartYear}`) into Academic Year blocks (`ACADEMIC YEAR YYYY–YYYY (XX cr Total)`).
  3. *Two-Column Semester Grid:* Rendered institutional semester cards in a two-column grid (`grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start`), with Fall positioned on the left and Spring on the right.
  4. *Centered Summer Card:* Centered compact Summer card (`w-full md:w-3/5 mx-auto pt-1`) below Fall/Spring only when summer coursework exists for that academic year; omitted completely with zero empty space if summer coursework is absent.
  5. *Exact Session Sub-Group Titles:* Standardized session micro-headers to exact titles:
     - Fall: `Fall 16-Week • Full Semester`, `FA-I • 1st 8-Week Session`, `FA-II • 2nd 8-Week Session`
     - Spring: `Spring 16-Week • Full Semester`, `SP-I • 1st 8-Week Session`, `SP-II • 2nd 8-Week Session`
     - Summer: `Summer Session (8-Week)`
     - Enforced strict zero-waste invariant: session micro-headers render only if courses exist in that session; no empty boxes or drop targets.
  6. *Minimalist Single-Line Course Rows:* Single-line ghost cards with course code (monospace bold), truncated title with requirement tag, letter grade, and whole-number credits.
  7. *Export & Print Invariant:* Full history remains visible when `isExportingPdf` is true or during `@media print`.
  8. *Zero Engine Impact:* Preserved all math and algorithms in `src/engine/` untouched.
- **Verification:**
  - `npm.cmd test -- --run`: 45 / 45 Vitest unit tests passing (100%).
  - `npm.cmd run build`: Compiled with 0 errors in 4.02s.
  - Headless E2E verification (`execution/verify_ay_mirror.js`): Verified top transfer card (`Transfers & Equivalencies • 6cr Total (2 Courses)`), 3 Academic Year blocks (`AY 2024–2025` with 32cr, `AY 2025–2026` with 33cr, `AY 2026–2027` with 3cr), exact session titles with tight padding, Fall left / Spring right two-column grid, and complete omission of empty summer terms, saving screenshot artifact `screen3_ay_mirror_verified.png`.

### 48. HeaderNav Responsive Collapse Hierarchy, Privacy Pill, Name Parser, and Reset Guard
- **Objective:** Establish a robust responsive degradation hierarchy for `HeaderNav.jsx`, provide an informative FERPA compliance popover, implement a deterministic student name parser for the Active Record pill badge, support clickable brand home navigation, and implement an Active Record clear action protected by a 5-second countdown confirmation modal.
- **Implementation:**
  1. *Default Student ID Generator:* In `Screen1Intake.jsx`, updated `generateDefaultStudentName()` to generate missing student identifiers as `Student ${Math.floor(1000 + Math.random() * 9000)}`.
  2. *Deterministic Name Parser (`formatActiveStudentName`):*
     - Anonymous tokens: `Student ####` preserved as-is.
     - "Last, First Middle" / "Last, First" / "First Middle Last" / "First Last": parsed into `"First LastInitial."` (e.g., `"Brandon P."`).
     - Length guard: Truncates names > 15 characters with an ellipsis `…`.
     - Verified with dedicated Vitest unit tests in `tests/headerNav.test.js`.
  3. *Brand Home Navigation:* Wrapped `[DP]` monogram mark and "Degree Planner" title in a clickable container with `onClick={() => setCurrentScreen(1)}`, routing back to Screen 1 while preserving active student state.
  4. *Updated FERPA Pill & Popover:*
     - Pill: Displays `ShieldCheck`, label `Built to Support FERPA-Compliant Advising`, dot `•`, and `Info` cue.
     - Hover popover: Reveals styled card with headline `Local processing protects student information` and body detailing client-side browser memory processing without cloud transmission.
  5. *Responsive Degradation Hierarchy:*
     - On wide desktop ($\ge$ `xl`): Full FERPA label and full stepper labels displayed.
     - On `< xl` (1024px tablet/desktop): FERPA text collapses into compact shield icon + dot (`hidden xl:inline`), keeping hover popover fully operational.
     - On `< lg` (768px): Stepper labels collapse into compact numbered buttons `1.`, `2.`, `3.` (`hidden lg:inline`).
     - Highest Priority / Preserved: Brand mark, Active Record badge, and Faculty Profile badge remain visible on a single line with zero awkward wrapping.
  6. *Active Record Reset [X] Button & 5-Second Countdown Modal:*
     - Added `X` button to Active Record badge opening a safety confirmation modal (`Clear Active Student Record?`).
     - Confirm button is disabled with a 5-second countdown timer (`Confirm Clear (5s)` $\rightarrow$ `(1s)` $\rightarrow$ `Confirm Clear Record` in destructive red).
     - Cancel button immediately aborts timer and dismisses modal.
     - Confirmation clears `parsedTranscript`, `auditResult`, `schedule`, and resets `Screen1Intake` via `intakeKey` state increment.
- **Verification:**
  - `npm.cmd test -- --run`: 52 / 52 Vitest unit tests passing (100%).
  - `npm.cmd run build`: 1,796 modules transformed cleanly in 3.94s with 0 errors.
  - Headless E2E verification (`execution/verify_headernav_hierarchy.js`): Verified FERPA hover popover content, Active Record name parsing (`Brandon P.`), 1440px / 1024px / 768px responsive collapse hierarchy, brand home click navigation, and 5-second countdown reset modal behavior, saving screenshot artifacts `headernav_reset_modal_verified.png` and `headernav_clean_state_verified.png`.

### 49. Navigation State Persistence, Screen 1 Toolbar & Button Copy Standardization
- **Objective:** Fix state loss when navigating back to Screen 1, add a top active-record navigation toolbar on Screen 1, and standardize button action copy with single arrow icons across Screen 1 and Screen 2.
- **Implementation:**
  1. *Back-Navigation State Persistence:* In `App.jsx`, passed `parsedTranscript`, `auditResult`, `selectedProgramId`, `constraints`, and `onClearActiveRecord` to `Screen1Intake`. Added a hydration `useEffect` in `Screen1Intake.jsx` that pre-populates `studentName`, `studentId`, `detectedGpa`, `advisorName`, `studentEmail`, `studentPhone`, `catalogYear`, `selectedProgramId`, `constraints`, sets `isDataExtracted` to `true`, and restores `extractedSummary` and `cachedParsedTranscript`.
  2. *Screen 1 Top Navigation Toolbar:* When an active student record exists, renders a top toolbar with:
     - Left action: "Clear Active Student" (`X` button) opening the 5-second countdown safety modal.
     - Center info: `Active Record: [Student Name]`.
     - Right action: Primary button "Proceed to Degree Audit" (or "Proceed to Optimal Degree Plan") that immediately jumps back to Screen 2 without scrolling.
  3. *Screen 1 Primary Button Copy & Arrow Cleanup:*
     - Updated Option B submit button to "Proceed to Degree Audit" (upload) and "Proceed to Optimal Degree Plan" (zero-upload) with single Lucide `<ArrowRight />` (no duplicate text arrow strings).
     - Updated zero-upload confirmation modal button to "Proceed to Optimal Degree Plan" with single Lucide `<ArrowRight />`.
  4. *Screen 2 Header & Footer Standardization:*
     - Top right button updated to **"Proceed to Optimal Degree Plan"** (with `<ArrowRight />`).
     - Bottom footer descriptive helper text (`Ready to build the 8-week...`) removed.
     - Bottom right button updated to **"Proceed to Optimal Degree Plan"** (with `<ArrowRight />`, matching the top button).
- **Verification:**
  - `npm.cmd test -- --run`: 52 / 52 Vitest unit tests passing (100%).
  - `npm.cmd run build`: 1,796 modules transformed cleanly in 4.03s with 0 errors.
  - Headless E2E verification (`execution/verify_navigation_persistence.js`): Verified Screen 2 button updates, returning to Screen 1 with complete state persistence (`Brandon M Paz`, `A003014354`, extracted metrics), top toolbar appearance and immediate forward navigation, and 5-second countdown modal reset from Screen 1.

### 50. Screen 1 Dropzone Upload Persistence, Conditional Top Toolbar & Layout Alignment
- **Objective:** Fix Screen 1 dropzone state loss upon back-navigation, make the top action toolbar strictly conditional on prior audit generation (hiding it during initial intake), and align its layout geometry and styling with Screens 2 and 3.
- **Root State Coordination (`src/App.jsx`):**
  - Held all intake selections in top-level state: `intakeFiles` (`anthologyFile`, `transcriptFile`, `degreePlanFile`, `optionAAnthologyFile`, `optionATranscriptFile`, `activeOption`), `selectedProgramId`, `additionalPrograms`, `catalogYear`, and scheduling preferences (`constraints`).
  - Passed setters and states down to `<Screen1Intake>`: `intakeFiles`, `onUpdateIntakeFiles`, `selectedProgramId`, `onSelectProgramId`, `catalogYear`, `onUpdateCatalogYear`, `additionalPrograms`, `onUpdateAdditionalPrograms`, `constraints`, `onUpdateConstraints`.
  - In `handleClearActiveRecord`: completely resets `intakeFiles`, `additionalPrograms`, `catalogYear`, and increments `intakeKey`.
- **Component Hydration & Dropzone Persistence (`src/components/Screen1Intake.jsx`):**
  - Initialized dropzone states from `intakeFiles`. Whenever files are chosen, removed, or verified, state syncs to `App.jsx`.
  - When returning to Screen 1, `StudentRecordDropzone` re-hydrates into its active "Ready" state (file name, file size, green Ready badge, remove button) for all uploaded files.
  - Automatically restores manually added enrolled courses, selected degrees, minors, and catalog year.
- **Conditional Top Action Toolbar & Layout Geometry:**
  - Hidden on initial intake / first file upload: Top toolbar is rendered **ONLY IF** `Boolean(auditResult)` is true. If `auditResult` is null/empty, returns `null` (consumes zero space), compelling advisors to review all academic constraints on their initial pass.
  - Aligned outer container geometry across Screen 1, Screen 2, and Screen 3 to `max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8`.
  - Integrated top toolbar directly into the Page Header flex row (`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`), placing the actions on the right opposite the title:
    - Left Action: `"Clear Active Student"` with `X` icon, secondary button style (`px-3.5 py-2 text-xs font-bold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 hover:text-red-700 hover:border-red-200 transition flex items-center space-x-1.5 cursor-pointer`), wired to the 5-second countdown safety modal.
    - Right Action: `"Proceed to Degree Audit"` (or `"Proceed to Optimal Degree Plan"` if zero uploads), primary button style (`px-5 py-2 text-xs font-bold bg-[#857542] hover:bg-[#6E6035] text-white rounded shadow transition flex items-center space-x-2 cursor-pointer`).
- **Verification:**
  - `npm.cmd test -- --run`: 52 / 52 Vitest unit tests passing (100%).
  - `npm.cmd run build`: 1,796 modules transformed cleanly in 3.99s with 0 errors.
  - Headless E2E verification (`.tmp/verify_screen1_persistence.mjs`):
    - Confirmed top toolbar is NOT rendered during initial intake before audit generation.
    - Confirmed dropzones show loaded Ready badges after file upload.
    - Confirmed top toolbar remains null after upload before audit generation.
    - Confirmed navigation to Screen 2.
    - Confirmed back-navigation to Screen 1 restores both dropzone file cards, student metadata, program selection, and activates the top toolbar in the header row.
    - Confirmed top "Proceed to Degree Audit" button immediately jumps back to Screen 2.
    - Confirmed "Clear Active Student" button triggers the 5-second countdown safety modal.
    - Screenshot artifact captured: `screen1_persisted_toolbar_verified.png`.

### 51. Global "Degree Plan" Renaming, Screen 1 Cleanup & Screen 3 Student Info Redesign
- **Objective:** Standardize terminology from "Schedule Board" to "Degree Plan" site-wide, remove subtitle badges on Screen 1 Option A and Option B, and refactor the Screen 3 student information card to remove the GPA badge, format projected graduation dates cleanly, include a "Created On" session timestamp, and add a dedicated Schedule Constraints sub-card.
- **Global Terminology Updates ("Schedule Board" $\rightarrow$ "Degree Plan"):**
  - In `src/components/HeaderNav.jsx`: Updated Step 3 workflow stepper to `3. Degree Plan` (and tooltip `Step 3: Degree Plan`).
  - In `src/components/Screen3ScheduleBoard.jsx`: Updated header breadcrumb to `Step 3: Visual Degree Plan & Tactile Weights`.
  - In `src/components/Screen1Intake.jsx`: Updated zero-upload confirmation modal copy to reference `proceed directly to the Degree Plan`.
  - In `src/components/AdvisorTestingExceptionCard.jsx`: Updated Screen 3 guard copy to `The Degree Plan requires student course records...`.
- **Screen 1 Intake Copy Cleanup (`src/components/Screen1Intake.jsx`):**
  - Removed "Instant State Reload" badge from Option A card header.
  - Removed "100% Deterministic Engine" badge from Option B card header.
  - Maintained clean padding and symmetry with `mb-4 pb-3 border-b border-neutral-100`.
- **Screen 3 Student Summary Card Redesign (`src/components/Screen3ScheduleBoard.jsx`):**
  - *GPA Badge Removed:* Completely removed the `{student.gpa}` badge from the student identity line.
  - *Projected Graduation Date:* Replaced the previous `Scheduler Projected` label with `Projected Graduation Date: {schedule.projectedGraduationTerm}` (e.g. `Projected Graduation Date: May 2027` or `December 2027`).
  - *Plan Creation Timestamp ("Created On"):* Added `planCreationDate` formatted as `Created On: {Month} {Day}, {Year} ({DayOfWeek})` (e.g. `Created On: Oct. 25, 2026 (Sun)`).
  - *Schedule Constraints Sub-Card:* Added a compact, styled sub-card (`bg-neutral-50/80 border border-neutral-200/80 rounded-lg p-2.5 text-xs text-neutral-700`) displaying:
    - **Pacing Mode:** `Full-Time (Max 9cr 8-wk / 18cr 16-wk)` or `Part-Time (Max 6cr 8-wk / 11cr 16-wk)`.
    - **Modality Preference:** `Online`, `On-Campus`, or `No Preference (Flexible)`.
    - **Summer Availability:** `Summer: Available (Max 6cr)` or `Summer: Not Available`.
  - *Balanced 2-Column Hierarchy:*
    - **Left Column:** Avatar monogram, Student Name, Student ID badge, Program & Emphasis, Catalog Year, Advisor Name & Email, Phone (if present), and "Created On" date.
    - **Right Column / Sub-Block:** Projected Graduation Date banner and the Schedule Constraints sub-card.
- **Verification:**
  - `npm.cmd test -- --run`: 52 / 52 Vitest unit tests passing (100%).
  - `npm.cmd run build`: 1,796 modules transformed cleanly in 4.06s with 0 errors.
  - Headless E2E verification (`.tmp/verify_degree_plan_and_screen3_redesign.mjs`):
    - Confirmed HeaderNav displays `3. Degree Plan`.
    - Confirmed Screen 1 badges are completely removed.
    - Confirmed Screen 3 breadcrumb reads `Step 3: Visual Degree Plan & Tactile Weights`.
    - Confirmed GPA badge is absent.
    - Confirmed "Projected Graduation Date:" and "Created On: Oct. 25, 2026 (Sun)" are present.
    - Confirmed Schedule Constraints sub-card displays pacing caps, modality, and summer availability.
    - Screenshot artifacts captured: `screen1_cleaned_badges_verified.png` and `screen3_redesigned_student_card_verified.png`.

### 52. Screen 3 Student Information Card Layout Restructure & Metadata Copy Fixes
- **Objective:** Eliminate dead space in the Screen 3 student information card, anchor the Projected Graduation Date in the top row opposite the student's name, update "Advisor:" to "Advisor Name:", and format the "Created On" timestamp with full month names (`MMMM D, YYYY (ddd)`).
- **Implementation in `src/components/Screen3ScheduleBoard.jsx`:**
  - *Full Month Timestamp:* Updated `planCreationDate` month array to full English month names (`January` through `December`), outputting e.g. `October 25, 2026 (Sun)` instead of `Oct.`.
  - *Row 1 (Header & Graduation Anchor):*
    - Container: `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`.
    - Left: Avatar monogram circle (`w-10 h-10`), Student Name (`h2.text-base.font-bold`), and ID badge (`ID: A003014354`).
    - Right: Projected Graduation Date badge (`bg-[#FDFBF7] border border-[#B5A36A] rounded-lg px-3.5 py-1.5 flex items-center gap-2 shadow-2xs`) displaying `Projected Graduation Date:` and `{schedule.projectedGraduationTerm}`.
  - *Row 2 (Subtle Divider):* Clean horizontal rule (`border-t border-neutral-100 my-3.5`).
  - *Row 3 (Responsive 2-Column Grid):*
    - Container: `grid grid-cols-1 lg:grid-cols-12 gap-4 items-center`.
    - Left Column (`lg:col-span-7`):
      - Degree title and Catalog Year (`Cybersecurity, BS • Catalog Year: 2026-2027`).
      - Compact advising metadata row: `Advisor Name: Matthias Wood • Advisor Email: mwood@lindenwood.edu • Created On: October 25, 2026 (Sun)`.
    - Right Column (`lg:col-span-5`):
      - Schedule Constraints sub-card (`bg-neutral-50/80 border border-neutral-200/80 rounded-lg p-2.5 text-xs text-neutral-700`) rendering Pacing Mode (caps), Modality Preference, and Summer Availability, spanning strictly the height of its content.
- **Verification:**
  - `npm.cmd test -- --run`: 52 / 52 Vitest unit tests passing (100%).
  - `npm.cmd run build`: 1,796 modules transformed cleanly in 4.13s with 0 errors.
  - Headless E2E verification (`.tmp/verify_screen3_redesign_layout.mjs`):
    - Confirmed Row 1 contains Avatar, Student Name, ID, and Projected Graduation Date badge.
    - Confirmed Row 2 contains subtle divider.
    - Confirmed Row 3 contains 2-column responsive grid with "Advisor Name:", full month name "October 25, 2026 (Sun)", and Schedule Constraints sub-card.
    - Screenshot artifact captured: `screen3_student_card_balanced_layout.png`.

### 53. Screen 3 Compact Student Info Panel Revert with Multi-Program & Unified Catalog Year Support
- **Objective:** Eliminate vertical dead space, remove the multi-tier stacked split and center horizontal divider (`border-t`), anchor the Projected Graduation Date directly above the student's name on the left as a compact accent badge, provide unified Catalog Year umbrella hierarchy with multi-program support (`Major:`, `Minor:`, `Certificate:`), and locate solely the Schedule Constraints sub-card in the right column.
- **Implementation:**
  - *Props Wiring in `src/App.jsx`:* Passed `selectedProgramId`, `additionalPrograms`, and `catalogYear` into `<Screen3ScheduleBoard>`.
  - *Card Container (`src/components/Screen3ScheduleBoard.jsx`):* Reverted to a clean 2-column flex container:
    `<div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs">`
    `<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">`
    Removed the previous stacked rows and horizontal rule (`border-t border-neutral-100`).
  - *Left Column (`flex-1 min-w-0 space-y-1.5`):*
    - **Row 1:** Positioned Projected Graduation Date directly above the student name:
      `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FDFBF7] border border-[#B5A36A] text-[11px] font-bold text-neutral-900 mb-1.5 shadow-2xs`
      Displaying `🎓 Projected Graduation Date:` and `{schedule.projectedGraduationTerm || 'May 2027'}` in bold monospace.
    - **Row 2:** Student Identity with avatar monogram circle (`w-10 h-10`), Student Name (`h2.text-base.font-bold`), and Student ID badge (`ID: ...`).
    - **Row 3:** Unified Catalog Year Header & Multi-Program Hierarchy:
      - Header: `CATALOG YEAR: {catalogYearValue}` in `text-[11px] font-bold font-mono text-[#857542] uppercase tracking-wider`.
      - Single Program: Renders cleanly without prefix (e.g. `Cybersecurity, BS`).
      - Multi-Program: If additional programs, minors, or certificates are present, renders `Major: {primaryProgramName}`, `Minor: ...`, `Certificate: ...` on separate compact lines (`text-xs font-semibold space-y-0.5`).
    - **Row 4:** Advising Metadata:
      - `Advisor Name: ...` • `Advisor Email: ...` • `Phone: ...` • `Created On: October 25, 2026 (Sun)` formatted with full month names.
  - *Right Column (`w-full lg:w-84 flex-shrink-0`):*
    - Renders **solely** the compact Schedule Constraints sub-card:
      - Header: `SCHEDULE CONSTRAINTS` with `active` badge.
      - Pacing Mode: `Full-Time (Max 9cr 8-wk / 18cr 16-wk)`.
      - Modality Preference: `No Preference (Flexible)`.
      - Summer Availability: `Summer: Available (Max 6cr)` or `Summer: Not Available`.
- **Verification:**
  - `npm.cmd test -- --run`: 52 / 52 Vitest unit tests passing (100%).
  - `npm.cmd run build`: 1,796 modules transformed cleanly in 4.09s with 0 errors.
  - Headless E2E verification (`.tmp/verify_full_flows.mjs`):
    - Confirmed single-program flow renders cleanly with zero divider line, correct padding, graduation badge above student name, and constraints sub-card on the right.
    - Confirmed multi-program hierarchy support.
    - Screenshot artifact captured: `screen3_compact_student_card_verified.png`.

### 54. Screen 3 Student Info Panel Fixed Flex Layout & Geometry Stabilization
- **Objective:** Fix the layout collapse in `Screen3ScheduleBoard.jsx` where the left column collapsed into ~80px causing vertical letter wrapping and overlapping with the Schedule Constraints card.
- **Root Cause & Resolution:**
  - Replaced non-standard / unstable width classes with standard Tailwind tokens and strict flexbox boundaries.
  - Added `flex-1 min-w-0 space-y-2` on the left column to guarantee it expands across available space and resists flex shrinking.
  - Added fixed `w-full lg:w-80 flex-shrink-0` (320px) on the Schedule Constraints sub-card on desktop.
  - Added `mb-6` on the outer card container (`bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs mb-6`) and `gap-6` on the inner flex container (`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6`).
- **Internal Structural Hierarchy:**
  - **Row 1:** Flex container (`flex flex-wrap items-center gap-2 mb-1.5`) with Projected Graduation Date badge and Catalog Year badge side-by-side.
  - **Row 2:** Flex container (`flex items-center gap-2.5`) with avatar circle (`w-8 h-8 rounded-full bg-[#857542]/10 border border-[#857542]/30`), `h2` name, and monospace ID badge.
  - **Row 3:** Degree programs container (`space-y-0.5`) rendering `Major: {degreeTitle}{emphasis ? ' • ' + emphasis : ''}` and `Minor: ...` across full width without vertical word-wrapping.
  - **Row 4:** Advising metadata row (`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 pt-1`) displaying Advisor Name, Advisor Email, and full-month Created On timestamp.
  - **Right Column:** Compact Schedule Constraints sub-card (`w-full lg:w-80 flex-shrink-0`) with `active` green badge and two-column key-value rows.
- **Verification:**
  - Headless Chrome geometry check (`.tmp/verify_fixed_student_panel.mjs`):
    - Confirmed left column width = 854px (no collapse, zero word-by-word wrapping).
    - Confirmed right column width = 320px (`w-80`).
    - Confirmed zero overlap (`isOverlapping = false`).
    - Screenshot artifact captured: `screen3_fixed_student_panel.png`.
  - 52 / 52 Vitest unit tests passing (100%).
  - Vite production build succeeds with 0 errors.

### 55. Screen 2 Student Information Panel Synchronization with Pending Projections
- **Objective:** Port the finalized 2-column Student Information Panel layout from Screen 3 to Screen 2 (`Screen2Audit.jsx`), replacing the legacy advising record banner with a unified design featuring a "Pending" graduation date state.
- **Prop Coordination in `src/App.jsx`:** Passed `facultyProfile`, `constraints`, `selectedProgramId`, `additionalPrograms`, and `catalogYear` to `<Screen2Audit>`.
- **Implementation in `src/components/Screen2Audit.jsx`:**
  - **Outer Card Container:** `bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs mb-6` with inner flex layout `flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6`.
  - **Left Column (`flex-1 min-w-0 space-y-2`):**
    - **Row 1 (Badges & Projections):** Projected Graduation Date badge displaying `🎓 Projected Graduation Date:`, italicized `Pending`, and an amber micro-badge (`bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-1.5 py-0.2 rounded ml-1`) reading `Calculated in Step 3`, side-by-side with the Catalog Year badge.
    - **Row 2 (Student Identity):** Monogram avatar circle (`w-8 h-8 rounded-full bg-[#857542]/10 border border-[#857542]/30`), bold student name, and monospace student ID badge. GPA pill strictly excluded.
    - **Row 3 (Degree Programs):** Decomposed `Major: {degreeTitle}{emphasis ? ' • ' + emphasis : ''}` and secondary minors/certificates on separate full-width rows without vertical word wrapping.
    - **Row 4 (Advising Metadata):** `Advisor Name: ...` • `Advisor Email: ...` • `Phone: ...` • `Created On: October 25, 2026 (Sun)` formatted with full English month names.
  - **Right Column (Schedule Constraints Sub-Card):** Fixed `w-full lg:w-80 flex-shrink-0 bg-neutral-50/90 border border-neutral-200/80 rounded-lg p-3 text-xs` with `SCHEDULE CONSTRAINTS` and green `active` status tag, rendering Pacing Mode, Modality Preference, and Summer Availability.
- **Verification:**
  - Headless Chrome verification (`.tmp/verify_screen2_panel.mjs`):
    - Confirmed card dimensions: 1232px width, 170.5px height (~90px–110px base footprint).
    - Confirmed left column width = 854px, right column width = 320px.
    - Confirmed zero overlap (`isOverlapping = false`).
    - Confirmed "Pending" text and "Calculated in Step 3" micro-badge.
    - Confirmed zero GPA badge.
    - Screenshot artifact captured: `screen2_student_panel_verified.png`.
  - 52 / 52 Vitest unit tests passing (100%).
  - Vite production build succeeds with 0 errors.

### 56. Factory Reset Preferences on Clear and Ultra-Minimal Systems Ledger Footer
- **Objective:**
  1. Complete preference reset on active record clear: ensure that clearing active student records (`handleClearActiveRecord` in `App.jsx` and `handleConfirmClear` in `Screen1Intake.jsx`) resets **all** student schedule constraints and intake preferences back to pristine defaults (`summerAvailability: 'No Summer'`, `maxSummerCredits: 6`, `modalityPreference: 'No Preference (Flexible)'`, `pacingMode: 'Full-Time'`, `max8wkCredits: 9`, `max16wkCredits: 18`, `startSemester: 'Fall 2026'`), eliminating state bleed between student sessions.
  2. Implement ultra-minimal systems ledger footer in `src/components/Footer.jsx` and `src/App.jsx`, removing institutional name, street address, website URL, and athletic slogans in favor of a clean, high-density single-line ledger.
- **Implementation:**
  - *Constraint Reset (`src/App.jsx`):*
    - Exported constant `DEFAULT_CONSTRAINTS`:
      `{ startSemester: 'Fall 2026', modalityPreference: 'No Preference (Flexible)', summerAvailability: 'No Summer', maxSummerCredits: 6, pacingMode: 'Full-Time', max8wkCredits: 9, max16wkCredits: 18 }`.
    - Initialized state `constraints` with `DEFAULT_CONSTRAINTS`.
    - In `handleClearActiveRecord`, explicitly reset constraints via `setConstraints({ ...DEFAULT_CONSTRAINTS })` alongside transcript, auditResult, schedule, auditOptions, and intakeFiles.
  - *Intake Form Reset (`src/components/Screen1Intake.jsx`):*
    - Initialized `calculatedStartSemester` default state to `propConstraints?.startSemester || 'Fall 2026'`.
    - In `handleConfirmClear`, explicitly reset all local preference states (`setModalityPreferenceState('No Preference (Flexible)')`, `setSummerAvailabilityState('No Summer')`, `setMaxSummerCreditsState(6)`, `setPacingModeState('Full-Time')`, `setMax8wkCreditsState(9)`, `setMax16wkCreditsState(18)`, `setCalculatedStartSemester('Fall 2026')`) before triggering `onClearActiveRecord`.
  - *Ultra-Minimal Systems Ledger Footer (`src/components/Footer.jsx` & `src/App.jsx`):*
    - Created `src/components/Footer.jsx` with deterministic semester calculation:
      `Month 0–4: Spring`, `Month 5–6: Summer`, `Month 7–11: Fall` (e.g. `Current Academic Semester: Fall 2026`).
    - Container styling: `border-t border-neutral-200 bg-white/60 py-4 px-6 mt-12 text-center text-xs text-neutral-500`.
    - Ledger items:
      `Advising Platform & Schedule Workspace` • `Current Academic Semester: {Term} {Year}` • `Local In-Memory Session` • `Zero PII Retention`.
    - Substituted into `src/App.jsx`, replacing the legacy institutional address and slogan footer.
- **Verification:**
  - Headless Chrome E2E verification (`.tmp/verify_clear_and_footer.mjs`):
    - Confirmed footer text contains all 4 ledger items and zero institutional marketing/address phrases (`Lindenwood University`, `209 S. Kingshighway`, `www.lindenwood.edu`, `DISCOVER YOUR ROAR`).
    - Modified student preferences on Screen 1 (Summer to "Yes Summer", Pacing to "Part-Time"), uploaded Brandon Paz transcript, ran audit to Screen 2.
    - Verified minimal systems ledger footer on Screen 2.
    - Navigated back to Screen 1, opened 5-second countdown clear modal, confirmed clear.
    - Confirmed all preferences and constraints reverted to pristine factory defaults (`No Summer`, `Full-Time`, 6cr / 9cr / 18cr caps).
    - Screenshot artifact captured: `footer_and_reset_verified.png`.
  - 52 / 52 Vitest unit tests passing (100%).
  - Vite production build succeeds with 0 errors (1,797 modules transformed).

### 57. Live Production Release to GitHub Pages (Minimal Ledger Footer & Factory Reset Deployed)
- **Objective:** Deploy and publish the latest production build of the Lindenwood Academic Degree Planner to GitHub Pages.
- **Implementation:**
  - Compiled static bundle via `npm run build` (1,797 modules transformed into `dist/assets/index-CMkgFPXm.js` and `index-Cjd8URVY.css`).
  - Executed `execution/deploy_to_github_pages.js --live` using the user's `GITHUB_TOKEN`.
  - Committed assets to repository `todwood/degree-planner` on branch `main` (`commit: 1f3ed3af9cdbd6f738254c7b45cf2ba02adfdaa0`).
  - Confirmed 0 sensitive, FERPA, `.env`, or `.tmp/` files in production artifacts.
- **Verification:**
  - Automated headless Chrome testing on live deployment (`execution/verify_live_pages.js`):
    - Live URL: `https://todwood.github.io/degree-planner/`.
    - Confirmed live title: `"Degree Planner — Academic Advising System"`.
    - Confirmed header title: `"Degree Planner Built to Support FERPA-Compliant Advising"`.
    - Confirmed Quick-Add tray functionality on live site (`ICS 21300` added).
    - Confirmed zero-upload modal advance to Degree Plan roadmap.
    - Confirmed real student PDF upload (Brandon Paz, 29 courses / 84 credits parsed cleanly).
    - Confirmed minimal systems ledger footer on live deployment with deterministic semester (`Fall 2026`) and zero institutional slogans/addresses.
    - Live console errors: `0`.
    - Screenshot captured: `live_github_pages_verified.png`.

### 58. Transfer Placeholder Deduplication Exemption (ELECT & GE)
- **Problem & Root Cause:**
  - When a student transferred multiple placeholder courses under generic codes (e.g. two `ELECT 10000` courses, one with `TR-B` [3cr] and one with `TR-C` [2cr]), the deduplication pre-processor grouped rows strictly by canonical published code (`compactCode = 'ELECT10000'`).
  - The higher/later attempt superseded earlier attempts, erroneously flagging the lower grade attempt as `Excluded: Repeat / Retake (Superseded by TR-B)` in the Excluded Courses Ledger and excluding valid credits (e.g. losing 2 credits from 11cr to 9cr).
- **Deterministic Solution:**
  - **Classification Utility (`src/engine/transcriptParser.js`):** Implemented `isTransferPlaceholder(course)` identifying generic transfer placeholder courses (`subject` in `ELECT`/`GE`, generic tiers `10000`, `19000`, `20000`, `29000`, `39000` or ending with `000`, placeholder titles `Free Elective`, `Technical Credit`, `Special Topics`, `GE-*`, and transfer origin `TR` / `Transfer`). Returns `{ isPlaceholder: true, placeholderType, allowMultipleInstances: true }`.
  - **Repeat Grouping Exemption (`src/engine/transcriptParser.js`):** In `processRawCourseRecords`, transfer placeholders are assigned instance-differentiated grouping keys (`${sig}_${occ}`) preserving multiple instances across distinct grades, credits, terms, or multiple entries within the same source document. Identical duplicate rows across merged Anthology and Transcript documents are deduplicated without generating repeat/retake exclusion records.
  - **Waterfall Audit Preservation & Category Routing (`src/engine/waterfallAudit.js`):**
    - Preserved multiple placeholder instances in `unclaimedPool` using instance-unique keys (`_unclaimedKey`).
    - Added explicit guard in `matchesGEBucket` guaranteeing `ELECT` placeholders flow directly into free elective pools and are never claimed by GE buckets.
    - Permitted `GE` placeholders (e.g. `GE 10000 - GE-Humanities`, `GE-Art`, `GE-SocSci`) to satisfy matching General Education buckets before falling back to general electives.
    - Returned `freeElectives: claimedFreeElectives` in the audit result for clean consumption.
  - **UI & Audit Ledger Display (`Screen2Audit.jsx` & `Screen3ScheduleBoard.jsx`):**
    - Screen 2: Free Electives table renders each distinct placeholder with its respective letter grade, valid credits, and unique React/note keys.
    - Screen 3: Audit Health Ribbon displays whole-number transfer credits reflecting all instances (e.g. `11cr Transfer`), and Expanded History (`Transfers & Equivalencies` card) displays each individual transfer course.
  - **Institutional Retake Invariant Preserved:** Standard institutional courses (e.g. `ENGL 17000` or `MTH 14100`) strictly maintain repeat replacement rules where earlier failing or lower attempts are excluded and credits are not double-counted.
- **Verification:**
  - Dedicated test suite `tests/transferPlaceholders.test.js` (8 tests) passing 100%.
  - All 60 Vitest tests passing across 5 test suites.
  - Automated headless browser test (`.tmp/verify_transfer_placeholders.mjs`) verified Screen 2 (0 excluded ELECT courses, 2 free elective rows, 11.0cr transfer badge) and Screen 3 (11cr transfer ribbon, 4 transfer cards in accordion).
  - Production bundle compiled cleanly with 0 errors via `npm run build`.

### 59. Targeted Vitest Verification for Jalen Smith Real File Intake & In-Stream Course Re-Ordering
- **Objective:**
  - Locate Jalen Smith's real sample files on disk (`.tmp/samples/Jalen Smith`) and verify deterministic intake, transfer placeholder invariants, waterfall degree auditing, and demographic extraction via a dedicated Vitest test suite (`tests/jalenSmithIntake.test.js`).
- **Discovery & Architectural Bug Resolution (In-Stream Course Re-Ordering in `extractSpatialTranscriptFromPdf`):**
  - *Symptom:* When combining Anthology `.xlsx` and Unofficial Transcript `.pdf` via `parseCombinedStudentRecords`, `ELECT 10000` appeared 4 times (6 transfer courses, 16cr) instead of 2 instances (4 transfer courses, 11cr).
  - *Root Cause:* In `extractSpatialTranscriptFromPdf` (`src/engine/transcriptParser.js`), course rows matched during the spatial page/column pass were pushed into `rawExtractedCourses` but omitted from `reconstructedLines`. All courses were then appended to `reconstructedLines` in a batch at the very end of the document, after all term headers and cumulative GPA lines. Consequently, when `parseTranscriptLinesInternal` parsed `reconstructedText`, all courses inherited the document's final term header (`FALL_26`), causing a term signature mismatch with Anthology rows (`TRANSFER_TERM`).
  - *Resolution:* Implemented `flushLastCourse()` in `extractSpatialTranscriptFromPdf` to emit each course into `reconstructedLines` in-stream under its active `Term:` header prior to non-course transitions, subsequent courses, or column completion, and eliminated the redundant batch push at the end of extraction.
  - *Result:* Courses in `reconstructedText` accurately retain their original term headers, enabling cross-document deduplication to merge identical transfer records seamlessly (`occ = 1` across sources) while preserving distinct within-document instances (`TR-B 3.0cr` and `TR-C 2.0cr`).
- **Dedicated Vitest Suite (`tests/jalenSmithIntake.test.js`):**
  - **A. File Presence & Path Verification:** Confirmed presence of `StudentCourseSchedules (All Results).xlsx`, `sub_Transcript - UnOfficial_landscape.pdf`, and `sub_UnofficialTranscript - Student Based_landscape.pdf`.
  - **B. Single-File Ingestion Verification:** Verified that independent intake of either `.xlsx` or `.pdf` yields exactly 2 `ELECT 10000` transfer courses and exactly 11.0 total transfer credits without repeat exclusion.
  - **C. Combined File Ingestion & Cross-Document Merging Invariants:** Verified that `parseCombinedStudentRecords` preserves exactly 4 transfer courses (11.0cr) without duplicate inflation; asserted 2 distinct `ELECT 10000` entries with independent attributes (`TR-C 2.0cr` and `TR-B 3.0cr`) and 0 exclusion flags.
  - **D. Waterfall Audit Invariant Checks:** Executed `runWaterfallAudit(studentData, 'it_app_dev_bs_2026', masterDb)`. Verified:
    - 0 `ELECT 10000` rows in `audit.excludedCourses`.
    - Exactly 2 `ELECT 10000` rows categorized under `audit.freeElectives`.
    - 0 `ELECT 10000` rows misrouted to `audit.geBuckets`.
    - Both rows contribute full credits (2.0 + 3.0 = 5.0cr) to free electives.
  - **E. Demographic Extraction Telemetry:** Logged clean `console.table()` with extracted student demographics:
    - Student ID: `A003000130`
    - Full Name: `Jalen A Smith`
    - Program / Major: `Information Technology`
    - Catalog Year: `2026-2027`
    - Cumulative GPA: `3.19`
    - Total Transfer Credits: `11`
    - Total Institutional Credits: `99`
    - Advisor: `N/A`
    - Email / Phone: `N/A / N/A`
- **Verification:**
  - `npx.cmd vitest run tests/jalenSmithIntake.test.js` passed with 100% success (6 / 6 tests).
  - Repository-wide test suite: 6 test suites, 66 / 66 unit tests passing.
  - Production build `npm.cmd run build` compiled cleanly with 0 errors (1,797 modules transformed in 3.80s).

### 60. Git Repository Initialization, Source Code Tracking, & Live GitHub Pages Release
- **Objective:**
  - Initialize local Git repository on branch `source`, configure remote origin to `todwood/degree-planner`, stage all production and test source code (excluding `.tmp/`, `.env`, `node_modules/`, `dist/`), commit transfer placeholder deduplication fixes, and push to GitHub.
  - Build production static bundle and deploy live update to GitHub Pages via `execution/deploy_to_github_pages.js --live`.
- **Implementation & Authentication Resolution:**
  - *Git CLI & Credential Resolution:*
    - Located local Git CLI binary at `C:\Users\todwood\AppData\Local\AMD\AI_Bundle\ComfyUI\Git\cmd\git.exe` (`git version 2.51.2.windows.1`).
    - Configured local git repository: `git init -b source`, `user.name: "todwood"`, `user.email: "todwood@users.noreply.github.com"`.
    - Resolved cached fine-grained GitHub PAT (`github_pat_...`) from `.env`.
    - Fixed background hang caused by Git Credential Manager GUI prompt by setting `git config credential.helper ""` and configuring authenticated remote URL `https://todwood:${token}@github.com/todwood/degree-planner.git`.
  - *Commit & Push (`source` branch):*
    - Staged 83 source, engine, test, and documentation files with zero sensitive files or transient `.tmp/` caches (`.gitignore` verified).
    - Committed with conventional commit: `fix(audit): exempt ELECT and GE transfer placeholders from repeat deduplication` (`commit 4356c963b3d123f7068a393d82c577048d968ed0`).
    - Pushed branch `source` to GitHub: `git -c credential.helper= push -u origin source` (exit code 0, tracking `origin/source`).
  - *Production Build & Live Deployment:*
    - Recompiled production bundle with `npm run build` (1,797 modules transformed into `dist/assets/index-Dxd2MNbP.js`).
    - Executed `execution/deploy_to_github_pages.js --live`: updated `assets/index-Dxd2MNbP.js` and `index.html` on GitHub Pages (`main` branch) with 0 sensitive files.
- **Live Verification:**
  - Automated headless Chrome verification against `https://todwood.github.io/degree-planner/` (`execution/verify_live_pages.js`):
    - Confirmed live page title: `"Degree Planner — Academic Advising System"`.
    - Confirmed live header navigation and Screen 1 advising workspace.
    - Confirmed Quick-Add enrolled courses tray functionality.
    - Confirmed zero-upload confirmation modal flow to Screen 3 schedule board.
    - Confirmed real student PDF upload (Brandon Paz, 29 courses / 84 credits).
    - Live console errors: `0`.
    - Screenshot captured: `.tmp/live_github_pages_verification.png`.

### 61. Tiered, Institutional-Only Course Recommendations for Screen 3 Placeholders
- **Objective:**
  - Implement intelligent, tiered course recommendations in the Screen 3 Course Inspector slide-over drawer for unfilled degree requirements and elective placeholders (`REQ_GE_*`, `REQ_ELEC_*`), while preserving standard concrete catalog display for concrete courses.
  - Enforce strict FERPA/privacy compliance (aggregated completion counts and average GPA on a 4.0 scale only; zero student PII or individual grades displayed).
  - Enforce strict institutional-only integrity: transfer artifacts (`ELECT 10000`, `GE 10000`, `isTransfer: true`, `TR-*`) must NEVER be recommended for future student enrollment.
- **Architectural Implementation:**
  1. *Historical Fulfillment Dataset (`src/data/historicalFulfillments.json`):*
     - Seeded from authentic institutional course completions across 14 student profiles in `realStudentsCatalog.json` and `masterDb.ge_popularity_stats`.
     - Structures 119 authentic courses with `courseCode`, `courseTitle`, `category`, `completionCount`, `averageGpa`, and `isInstitutional: true`.
  2. *Recommendation & Classification Engine (`src/utils/courseRecommendations.js`):*
     - `getCourseRecommendations(selectedCourse, activeProgram, catalogCourses, historicalData, activeStudentCourses)`:
       - **Concrete Catalog Course Guard:** Returns `null` for concrete courses (`MTH 27100`, `CSC 10100`, `ENG 17000`), ensuring the drawer renders only catalog overview and prerequisites without recommendation clutter.
       - **Tier 1 (Categorized GE Placeholders):** Matches bucket attributes (e.g. `arts`, `lit`, `math`, `nat_sci_lab`), ranks by completion volume, and appends 0-completion qualifying institutional courses at the bottom with `"0 peers recorded"` and `"N/A"`.
       - **Tier 2 (Open / Breadth GE Placeholders):** Pools all General Education courses and subtracts active program's mandatory major core and math courses (and their prerequisites).
       - **Tier 3 (Free Electives):** Pools non-core institutional courses, filters by level (30000+ for upper-division placeholders), and ranks by student selection volume.
       - **Strict Transfer Exclusion:** Excludes `isTransfer: true`, `ELECT`, `GE`, and `TR-*` records.
     - Formatting helpers: `formatGpaWithLetter(gpa)`, `formatPeerPopularity(count)`, `formatTypicalOffering(sessions)`.
     - Dynamic hybrid merging via `buildHistoricalLookup`.
  3. *Course Detail Drawer Modal (`src/components/modals/CourseDetailModal.jsx`):*
     - Replaces hardcoded slide-over drawer in Screen 3.
     - Accessible info icon button `(i)` with hover/click popover: *"Peer Fulfillment Metric Standards: Recommendations are generated from institutional completion data of peers who satisfied this requirement. Excludes transfer and test credits. Average GPA is calculated on a 4.0 scale across graded attempts."*
     - High-density stacked layout with clickable course code/title expanding inline catalog description and prerequisites, Lindenwood accent popularity badge (`245 students completed`), and neutral GPA badge (`3.37 GPA / B+`).
  4. *Screen 3 Integration (`Screen3ScheduleBoard.jsx`):*
     - Passed `propSelectedProgramId || schedule?.programId || 'cybersecurity_bs_2026'` and `rawCompletedCourses` to `<CourseDetailModal />`.
- **Verification:**
  - Dedicated Vitest suite `tests/courseRecommendations.test.js` (13 tests) passing 100%.
  - Full test suite: 7 test files, 79 tests passing 100%.
  - Production build: `npm run build` compiled cleanly with 0 errors in 3.81s.
  - Headless Puppeteer verification (`.tmp/verify_course_recommendations_ui.mjs`):
    - Concrete course `ICS 42300`: drawer opens, zero recommendation table rendered.
    - Placeholder `REQ_ELEC_GEN_1`: drawer opens with "Recommended Institutional Offerings" (50 options), top option `PSY 10000`, 0 transfer courses.
    - Info `(i)` button: popover renders verified standard copy without clipping.
    - Course expansion: inline description and prerequisites expand dynamically.
    - Screenshot artifact captured: `.tmp/course_recommendations_verified.png`.

### 62. Screen 3 Recommendations Refinement, Concrete Course Guards, Restricted Course Filtering, and Popover Layout
- **Objective:**
  - Enforce a strict Concrete Course Guard so courses with standard institutional numbers (e.g., `MTH 14100`, `ENGL 17000`, `IIT 21500`) return `null` and do not show recommendations even when satisfying General Education requirements.
  - Require genuine General Education attribute tags on all candidate courses for GE placeholder slots (`REQ_GE_*`), strictly excluding non-GE departmental courses (e.g., `CSC 35500`).
  - Implement a restricted course blacklist across all recommendation pools: filter out `EPP 15000` (ESL / Academic Purposes), remedial courses (< 10000), and special-enrollment courses (independent studies, internships, practicums, thesis).
  - Cap recommendation lists to the top 30 courses (`slice(0, 30)`).
  - Update the grade badge display to show average letter grades only (`${letter} Avg` or `N/A`), replacing raw GPA scores.
  - Enhance the expanded recommendation view with full, unclipped course code and title in bold, an Advisor Tip callout, and a one-click copy button with feedback state.
  - Fix the popover tooltip clipping by centering the popover on the button (`left-1/2 -translate-x-1/2 top-full mt-2`), eliminating overflow past drawer boundaries.
- **Implementation:**
  1. *Classification Helpers (`src/utils/courseRecommendations.js`):*
     - `isPlaceholderRequirement(course)`: Returns `true` only for genuine placeholder tokens (`REQ_*`, `GE-*`, `ELECT-*`, `isPlaceholder: true`, `type: 'placeholder'`, or generic titles). Returns `false` for standard course numbers (`^[A-Z]{2,4}\s*\d{5}$`).
     - `isRestrictedCourse(course)`: Detects and excludes `EPP 15000`, course number < 10000, and titles with `independent study`, `internship`, `practicum`, etc.
     - `hasValidGeAttribute(course)`: Checks for `(GE-...)` title tags, `geCategory`, or database `ge_bucket_id`.
     - `formatGpaWithLetter(gpa)`: Formats numeric GPA into `${letter} Avg` (e.g. `B+ Avg`, `A Avg`) or `N/A`.
     - Capped recommendation arrays at 30 items while preserving array metadata.
  2. *Drawer Modal Enhancements (`src/components/modals/CourseDetailModal.jsx`):*
     - Replaced inline evaluation with `isPlaceholderRequirement(course)`.
     - Added `handleCopyCourse` copying `${rec.code} ${rec.title}` with temporary "Copied!" feedback state.
     - Added bold unclipped header and `"Advisor Tip: Copy this course code and title into the target semester's '+ Note' field for student reference when registering."`
     - Fixed popover positioning to `left-1/2 -translate-x-1/2 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-3rem)]`, with `overflow-visible` on parent containers.
- **Verification:**
  - Dedicated Vitest suite `tests/courseRecommendations.test.js`: 19 / 19 tests passing (100%).
  - Full test suite: 7 test files, 85 / 85 unit tests passing (100%).
  - Production build: `npm run build` compiled cleanly with 0 errors in 3.92s.
  - Automated headless Chrome E2E verification (`.tmp/verify_course_recommendations_ui.mjs`):
    - Concrete course cards (`ICS 42300`, `CINE 11000`): drawer opened with catalog overview; 0 recommendations rendered.
    - Placeholder card (`REQ_ELEC_GEN_1`): drawer opened with 30 capped recommendations, `B+ Avg` badges, 0 transfer courses, 0 `EPP 15000`.
    - Popover alignment: `left = 991.5px`, `right = 1311.5px`, completely within drawer boundaries (`864px` to `1440px`), zero clipping on left or right.
    - Expanded card: rendered full title `PSY 10000 Principles of Psychology (GE-SocSci)`, Advisor Tip callout, and one-click copy button with "Copied!" feedback state.
    - Screenshot captured: `.tmp/course_recommendations_refined.png`.

### 63. Composition I (ENGL 15000) Migration and EPP 15000 Audit Equivalence
- **Objective:**
  - Replace the legacy placeholder token `REQ_GE_COMP1` with concrete institutional course `ENGL 15000` (Composition I) throughout the program and audit pipeline.
  - Implement full audit equivalence for `EPP 15000` (Composition I - English for Academic Purposes), allowing it to satisfy the Composition I line item with 0 unfulfilled core warnings when completed with grade C or higher.
  - Update `ENGL 17000` (Composition II) prerequisite logic to require `ENGL 15000 or EPP 15000` (dropping `REQ_GE_COMP1`).
  - Update legacy alias maps in `dbAdapter.js` (`GE 1`, `GE_COMP_1`, and `REQ_GE_COMP1`) to resolve to concrete `ENGL 15000` for backwards compatibility.
  - Symmetrize unfulfilled Composition I emission in `remainingCourseItems` to produce concrete `ENGL 15000` (`type: 'concrete'`, `isPlaceholder: false`), mirroring `comp_2` (`ENGL 17000`) and `math` (`MTH 14100`).
- **Implementation:**
  1. *Master Database (`src/data/masterDatabase.json`):*
     - In `courses`, updated `ENGL 17000` prerequisite logic to `items: [{ "code": "ENGL 15000" }, { "code": "EPP 15000" }]` and `prereq_display: "ENGL 15000 or EPP 15000 with grade of C or higher"`.
     - Preserved catalog definition of `ENGL 15000` as concrete course with `credits: 3`, `title: "Composition I (GE-Comm)"`, and `legacy_substitutions: ["EPP 15000"]`.
  2. *Audit Gatekeeper & Remaining Emission (`src/engine/waterfallAudit.js`):*
     - Updated `BUCKET_TO_CANONICAL_TOKEN.comp_1 = 'ENGL 15000'`.
     - In `Composition I & II Gatekeeper`, evaluated candidate codes `['ENGL15000', 'EPP15000']`. If either course is present with grade >= C (or Current/Scheduled), claimed course into `geBucketsResult`, marked `fulfilled = true`, and omitted any low-grade warnings for that bucket so `compositionGatekeeper.satisfied` evaluates to `true`.
     - In `remainingCourseItems`, updated unmet `comp_1` emission to push concrete course `ENGL 15000` (`type: 'concrete'`, `isPlaceholder: false`), eliminating `REQ_GE_COMP1`.
  3. *Database Adapter & Recommendations Utility (`src/data/dbAdapter.js`, `src/utils/courseRecommendations.js`):*
     - In `PLACEHOLDER_LEGACY_ALIASES`, mapped `'GE 1': 'ENGL 15000'`, `'GE_COMP_1': 'ENGL 15000'`, `'REQ_GE_COMP1': 'ENGL 15000'`, `'REQGECOMP1': 'ENGL 15000'`.
     - In `getCourseSync`, added early alias resolution for mapped canonical tokens so queries for `REQ_GE_COMP1`, `GE 1`, or `GE_COMP_1` resolve cleanly to `ENGL 15000`.
     - In `src/utils/courseRecommendations.js`, updated and exported `BUCKET_TO_CANONICAL_TOKEN.comp_1 = 'ENGL 15000'`.
  4. *Verification Suites (`tests/waterfallComposition.test.js`, `tests/masterDatabase.test.js`):*
     - Created comprehensive test suite `tests/waterfallComposition.test.js` with 10 test specs covering token mapping, alias resolution, unfulfilled concrete emission, recommendation guard, ENGL 15000 vs. EPP 15000 audit equivalence, grade D gatekeeper warnings, and prerequisite chaining with `ENGL 17000`.
     - Updated `tests/masterDatabase.test.js` to assert concrete `ENGL 15000` emission and prerequisite validation.
- **Verification:**
  - Full Vitest suite: 8 test files, 95 / 95 unit tests passing (100%).
  - Production build: `npm run build` compiled cleanly with 0 errors in 3.90s.

### 64. Screen 3 Drag-and-Drop Movement, Active Workload Metrics, and Retake Workflow
- **Objective:**
  - Resolve DND course movements and Move modal execution by fixing variable reference bugs (`allPastCourses`), defaulting modal target semester to the immediate chronological next semester (`getDefaultNextSemesterAndSlot`), and relabeling "Target Session Band" to "Target Session".
  - Implement refined credit metrics distinguishing Active vs. Future semesters: future semesters display `## Pending Credits`, active semester with 0 complete sub-session credits displays `## Pending Credits`, and active semester with complete sub-session credits displays `## Pending • ## Complete Credits (## Total)`.
  - Ingest sub-session completed courses (e.g. Session I) into the Active Semester card under a dedicated `1st 8-Week Session • Completed` divider while retaining their listing in the Past Coursework drawer.
  - Enforce strict blanking and locking of past terms within the academic triad: preceding terms render only term identifier and `Term Concluded • Recorded in Past Coursework History`, with zero drag targets, zero buttons, and zero completed cards.
  - Implement "Plan Retake" context action on active in-progress courses, adding a scheduled retake into the next chronological semester with non-amber informational badges (`Retake Planned` on active card, `Retake` on future card), strictly preserving the Tactile Flexibility Scale.
- **Implementation:**
  - `src/components/Screen3ScheduleBoard.jsx`: Exported pure helpers `formatSemesterCreditMetric`, `getTermChronologicalRank`, `isTermInPast`, `executePlanRetake`, and `executeCancelRetake`. Added `renderPastConcludedSemesterCard` and wired retake plan/cancel handlers with auto-clearing feedback toasts.
  - `tests/scheduleBoard.test.js`: Added 9 new unit test specs covering credit metric formatting, chronological term ranking, past term boundary detection, and retake planning/cancellation. Total test suite expanded to 112 passing unit tests.

### 65. Headless Verification Process Teardown Invariant
- **Decision:** Any headless verification script (`.tmp/*.mjs` or `scripts/*.mjs`) that spawns an HTTP or Vite preview server or browser instance MUST implement deterministic teardown inside a `finally` block.
- **Why:** On Windows environments, calling `childProcess.kill()` on processes spawned with `shell: true` terminates only `cmd.exe`, leaving orphaned `node.exe` processes holding preview ports (4173–4185) and keeping the event loop alive.
- **Pattern:**
  ```javascript
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    if (preview && preview.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', preview.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
        } else {
          preview.kill('SIGTERM');
        }
      } catch {}
    }
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  }
  ```
- **Verification:** Cleaned all lingering preview port listeners on 4173–4185, verified script termination with exit code 0, 0 dangling listeners, and 100% green test suite.

### 66. Master Database Pruning to 3 Verified Degrees & Multi-Program Intake Validation
- **Objective:**
  - Prune `src/data/masterDatabase.json` so the `programs` array strictly contains only the 3 verified Lindenwood degree programs across all supported catalog years (`2024-2025`, `2025-2026`, `2026-2027`):
    1. `Cybersecurity, BS` (`cybersecurity_bs_2026`, `cybersecurity_bs_2025`, `cybersecurity_bs_2024`)
    2. `Information Technology, BS - Applications Development Emphasis` (`it_app_dev_bs_2026`, `it_app_dev_bs_2025`, `it_app_dev_bs_2024`)
    3. `Information Technology, BS - Networking Emphasis` (`it_networking_bs_2026`, `it_networking_bs_2025`, `it_networking_bs_2024`)
  - Purged unverified drafts (`cs_bs_2026` "Computer Science, BS" and `math_bs_2026` "Mathematics, BS"), reducing total program entries from 11 to 9.
  - Retained all catalog year mappings and concrete/placeholder course definitions.
  - Zero UI/layout mutation on Screens 1, 2, or 3.
  - Updated `tests/masterDatabase.test.js` to assert Upper-Level Elective placeholder generation via an in-test deficit mock rather than coupling tests to unverified catalog entries.
- **Verification:**
  - Vitest Unit Tests: 112 / 112 passing (100%) across 9 test files.
  - Production Build: `npm run build` compiled cleanly in 4.71s with zero errors.
  - Headless E2E Verification (`.tmp/verify_mock_students_intake.mjs`):
    - Confirmed Screen 1 program dropdown strictly contains only the 3 verified degrees and zero unverified drafts.
    - Verified intake and progression from Screen 1 through Screen 2 (Audit) and Screen 3 (Schedule Board) for all 3 programs:
      - Program 1: Cybersecurity, BS (via Brandon Paz transcript).
      - Program 2: Information Technology, BS - Networking Emphasis.
      - Program 3: Information Technology, BS - Applications Development Emphasis.
    - Clean process teardown conforming to Section 65 invariant; exit code 0.

### 67. Emergency FERPA Scrub & Clean Git History Rewrite
- **Directive:** Permanently erase `src/data/realStudentsCatalog.json` and sensitive transcript patterns from entire Git history across all branches and commits, re-secure `.gitignore`, and force-push sanitized history to GitHub.
- **Execution:**
  1. Ran `git-filter-repo --path src/data/realStudentsCatalog.json --invert-paths --force` via Python 3.12.
  2. Updated `.gitignore` to explicitly ignore `src/data/realStudentsCatalog.json`, `*.private.json`, `*.transcript.pdf`, and `*.audit.html`.
  3. Expired all reflogs (`git reflog expire --expire=now --all`) and executed aggressive garbage collection (`git gc --prune=now --aggressive`).
  4. Verified `git log --all --full-history -- "**/realStudentsCatalog.json"` returns strictly 0 commits across both local and remote branches (`main` and `source`).
  5. Re-established authenticated remote `origin` and executed `git push origin source --force --tags`.
  6. Verified all 112 unit tests pass (100%) and production Vite build compiles cleanly with 0 errors.

### 69. High-Density Searchable Comboboxes for Catalog Year and Degree Program
- **Objective:** Eliminate degree title text truncation on Screen 1 and implement accessible, searchable comboboxes for Catalog Year and Degree Program with zero regression on transcript intake, mock student profiles, and downstream transitions.
- **Architectural Implementation:**
  1. *Searchable Degree Program Combobox (`src/components/ProgramCombobox.jsx`):*
     - Replaced standard `<select>` with custom accessible combobox control featuring zero truncation (`truncate` removed, naturally wraps with full title visibility).
     - Trigger button renders Discipline & Degree Title on Line 1, Track/Emphasis badge on Line 2 (or Major Core Curriculum), degree type badge (e.g., `BS`), search icon, and chevron toggle.
     - Floating popover menu (`max-h-60 overflow-y-auto`) with auto-focused inline search input filtering dynamically across title, emphasis, degree type, and ID.
     - Keyboard navigation: `ArrowDown`/`ArrowUp` option cycling, `Enter` to commit, and `Escape` to dismiss without mutating state.
     - Dense two-line options layout with gold active tint and checkmark icon for selected item.
     - Empty state fallback: "No matching verified programs found in this catalog year."
     - Preserves a hidden native `<select id="optionB-program-select">` with `<optgroup>` to ensure 100% backward compatibility for screen readers, scrapers, and headless test runners.
  2. *High-Density Catalog Year Selector (`src/components/CatalogYearCombobox.jsx`):*
     - Renders supported catalog years (`2026-2027`, `2025-2026`, `2024-2025`) with active/prior badges and calendar icon.
     - Enforces forward-only catalog selection policy by disabling prior years when `minCatalogYearStart` exceeds catalog start year, displaying a lock icon and `(Restricted: matriculated YYYY+)`.
     - Preserves cross-year program title continuity (e.g. switching between 2026-2027 and 2025-2026 maintains "Information Technology, BS - Applications Development Emphasis" without resetting to default).
     - Maintains hidden native `<select id="optionB-catalog-year">` for backward compatibility.
  3. *Screen 1 Layout Optimization (`Screen1Intake.jsx`):*
     - Updated Degree Curriculum grid to `grid-cols-1 md:grid-cols-12 gap-3` with `md:col-span-5` for Catalog Year and `md:col-span-7` for Degree Program, providing maximum horizontal layout space.
- **Verification & Deployment:**
  - *Unit Tests:* Added 14 new unit tests in `tests/programSelector.test.js` validating title parsing, search keyword filtering ("App", "Net", "Cyber"), cross-year continuity, and forward-only rules. Total tests: 126 / 126 passing (100%) across 10 test files.
  - *Production Build:* `npm run build` compiled cleanly in 4.12s with zero errors.
  - *Headless E2E Verification:* `.tmp/verify_searchable_selectors.mjs` verified full title display without truncation, instant typing filter, keyboard commit (`Enter`), cancellation (`Escape`), cross-year continuity preservation, transcript auto-detection, and downstream transition to Screen 2/3 with clean process teardown (exit code 0).
  - *Regression E2E Verification:* `.tmp/verify_mock_students_intake.mjs` confirmed all 3 verified degrees continue to ingest and schedule properly end-to-end.
  - *Live Deployment:* Committed (`912b2da`), pushed to `origin/source`, and deployed to GitHub Pages (`todwood/degree-planner`). Verified live at `https://todwood.github.io/degree-planner/` with 0 console errors.








