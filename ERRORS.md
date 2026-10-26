# Failure & Troubleshooting Log (`ERRORS.md`)

## Incident Log

### Issue 1: Windows PowerShell Script Execution Policy Blocking `npm`
- **Symptom:** Executing `npm --version` fails with `PSSecurityException`: `File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system`.
- **Root Cause:** Windows Client default execution policy restricts unsigned PowerShell script files (`.ps1`).
- **Resolution:** Invoke `npm.cmd` directly (e.g., `npm.cmd install`, `npm.cmd run build`) or call `node` commands, which execute standard Windows batch/executable binaries without PowerShell script signing checks.

### Issue 2: Direct `python` command alias on Windows
- **Symptom:** Running `python` opens the Microsoft Store redirect alias when Python is installed through standard installer without store association.
- **Root Cause:** Windows app execution alias for `python.exe`.
- **Resolution:** Use `py` (Windows Python Launcher) or target the virtual environment binary directly at `.\.venv\Scripts\python.exe`.

### Issue 3: Windows AppLocker Blocking `.venv\Scripts\pip.exe`
- **Symptom:** Executing `.\.venv\Scripts\pip.exe` fails with `Program 'pip.exe' failed to run: An Application Control policy has blocked this file`.
- **Root Cause:** Windows Application Control (AppLocker) blocks standalone `.exe` binaries created inside local user directory virtualenvs.
- **Resolution:** Invoke pip through the Python executable: `.\.venv\Scripts\python.exe -m pip install <package>`, which executes legitimately through the allowed Python binary.

### Issue 4: Node v24 Native ESM JSON Import Attribute Requirement
- **Symptom:** Running JS engine modules directly under Node v24 (`node --input-type=module`) throws `TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]: Module ".../masterDatabase.json" needs an import attribute of "type: json"`.
- **Root Cause:** Node v24 strictly requires `with { type: 'json' }` on static ESM JSON imports, whereas Vite bundles JSON transparently.
- **Resolution:** Append `with { type: 'json' }` to all static `.json` imports (`dbAdapter.js`, `waterfallAudit.js`, `scheduler.js`), which is compatible with both Node v24 native ESM and Vite 5+.

### Issue 5: Preventing D-Grade Composition I/II from Flowing into GE Elective Overflow
- **Symptom:** A student with a `D` in `ENGL 15000` or `ENGL 17000` is rejected by `comp_1`/`comp_2` (Grade >= C gatekeeper), leaving the course in the unclaimed pool where `ge_elective_1` (`ENGL` department `<30000` matcher) could claim it.
- **Root Cause:** Generic department matching on `ge_elective_1` / `ge_elective_2` did not explicitly exclude `ENGL 15000`, `EPP 15000`, and `ENGL 17000`.
- **Resolution:** Explicitly exclude `ENGL15000`, `EPP15000`, and `ENGL17000` from `ge_elective_1` and `ge_elective_2` so any `D` grade in Composition I/II flows strictly to `claimedFreeElectives` (counting toward the 120-credit total while leaving Composition unfulfilled).

### Issue 6: Tailwind CSS v4 PostCSS Plugin Transition
- **Symptom:** Running `npm.cmd run build` fails or warns because Tailwind v4 removed the standard `tailwindcss` PostCSS plugin in favor of `@tailwindcss/postcss`.
- **Root Cause:** Default `npm install -D tailwindcss` installed v4, which deprecates `@tailwind base; @tailwind components; @tailwind utilities;` and requires `@import "tailwindcss";`.
- **Resolution:** Pin `tailwindcss@^3.4.17` for deterministic Vite 5 + PostCSS compatibility, ensure `import './styles/theme.css';` is present in `src/main.jsx`, and maintain clean production CSS bundle generation (`dist/assets/index-*.css`).

### Issue 7: Missing Favicon 404 in Browser Client
- **Symptom:** Browser console logs `HTTP 404 (Not Found)` requesting `/favicon.ico`.
- **Root Cause:** Standard browser request for `/favicon.ico` when not explicitly defined in `index.html`.
- **Resolution:** Copied `public/assets/logos/lu-icon.svg` to `public/favicon.ico` and added `<link rel="icon" type="image/svg+xml" href="/assets/logos/lu-icon.svg" />` to `index.html`.

### Issue 8: CSS `text-transform: uppercase` Altering Headless `innerText` Assertions
- **Symptom:** Headless browser test checking `document.body.innerText.includes('Lindenwood Course Inspector')` failed even though the drawer component rendered in the DOM.
- **Root Cause:** The drawer title had CSS class `uppercase`, causing Chrome's `innerText` engine to return `LINDENWOOD COURSE INSPECTOR`.
- **Resolution:** Check drawer visibility using `page.content()` or `.toUpperCase().includes(...)` to be immune to CSS visual text transformations.

### Issue 9: GitHub Pages Legacy Jekyll Build Error on Vite SPAs
- **Symptom:** GitHub Pages API reports `status: 'errored'` and fails to serve updated SPA content.
- **Root Cause:** By default, GitHub Pages runs a Jekyll pre-processor on repository root branches, which errors out on modern minified JS and SPA directories.
- **Resolution:** Commit a `.nojekyll` empty file to the root of the publishing branch, instructing GitHub Pages to bypass Jekyll entirely and serve static SPA files directly.

### Issue 10: Subpath Root Asset Resolution on GitHub Pages
- **Symptom:** Images using absolute paths (e.g., `src="/assets/logos/..."`) throw HTTP 404 on `username.github.io/repo-name/` because the browser resolves against the root domain `username.github.io/assets/...`.
- **Root Cause:** Hardcoded leading slash in JSX `src` attributes bypasses Vite's `base: './'` relative resolution.
- **Resolution:** Convert root-relative `src="/assets/..."` to relative `src="./assets/..."` across all components so assets resolve correctly under any repository subpath.

### Issue 11: Missing `parseTermInfo` Import in Scheduler Causing Silent Screen 2 Navigation Hang
- **Symptom:** On Screen 2 (Curriculum Audit Ledger), clicking "Generate Optimal Graduation Plan" did not transition to Screen 3, and clicking "3. Schedule Board" in the header nav displayed "Please complete student record intake first".
- **Root Cause:** When student records had enrolled courses (e.g., active Fall 2026 courses), `scheduler.js` attempted to call `parseTermInfo(c.term)`. Because `parseTermInfo` was not imported from `src/engine/transcriptParser.js`, an uncaught `ReferenceError: parseTermInfo is not defined` crashed the function silently, preventing `setCurrentScreen(3)` from running and leaving `schedule` null.
- **Resolution:**
  1. Added `import { normalizeCourseCode, parseTermInfo } from './transcriptParser.js';` to `scheduler.js`.
  2. Wrapped `handleProceedToSchedule` with try/catch logging in `App.jsx`.
  3. Pre-generated `schedule` in `handleIntakeComplete` so Screen 3 is available immediately without relying solely on Screen 2 button transitions.
  4. Added `AdvisorTestingExceptionCard` to gracefully handle direct Screen 2/3 navigation before student records are loaded.

### Issue 12: Blank `Term` on Unscheduled `Future` Rows Misclassified as `TR` in `transcriptParser.js`
- **Symptom:** In Anthology exports, remaining degree-audit placeholder courses at the bottom of the sheet have `Course Status = "Future"` and `Term = ""` (blank/`NaN`). Previously, `parseTermInfo("")` treated any empty string as `isTransfer: true`, causing `classifyCourseRow` to classify unscheduled `Future` audit rows as `TR` (Transfer credits) instead of excluding them.
- **Root Cause:** `if (!str || /^(TR|TRANSFER|EXT)/i.test(str))` conflated blank terms with `TRANSFER_TERM`.
- **Resolution:** Separated blank term handling (`isBlank: true, isTransfer: false`) from transfer term matching in `parseTermInfo()`, and placed the Section 3.5.1 check (`status === 'FUTURE' && !rawTermStr` $\rightarrow$ `Excluded` with `isUnscheduledFuture: true`) at the top of `classifyCourseRow()`.

### Issue 13: Honors Letter Grades (`AH`, `BH`, `CH`, `DH`) Unrecognized in Anthology Exports
- **Symptom:** Honors course sections in real student Anthology exports (e.g., `Lliam Gammon` with `letterGrade = "AH"`) were flagged as unrecognized grades.
- **Root Cause:** Grade lookup tables only listed standard `A`, `B`, `C`, `D` and plus/minus variants without Honors `H` suffixes.
- **Resolution:** Added `AH`, `BH`, `CH`, and `DH` to `PASSING_COMPLETED_GRADES`, `GRADE_PRIORITY` / `GRADE_RANK`, `GRADE_POINTS`, and Composition `C`-or-higher checks in both `execution/parse_anthology.py` and `src/engine/transcriptParser.js`.

### Issue 14: 5-Letter Department Code (`SPMGT`) Dropped by `{2,4}` Course Code Regex
- **Symptom:** In `Fabiana Labrador`'s Anthology `.xlsx` and Unofficial Transcript PDFs, `Sport Management Minor` courses (`SPMGT27020`, `SPMGT37040`, `SPMGT37060`) were dropped as non-course noise, causing active courses to read `37` instead of `40`.
- **Root Cause:** `PUBLISHED_CODE_PATTERN` in `src/engine/transcriptParser.js` and `execution/parse_anthology.py` restricted the alphabetic department prefix to `{2,4}` characters.
- **Resolution:** Updated `PUBLISHED_CODE_PATTERN` and PDF course line matchers to `[A-Z]{2,5}\s*\d{4,5}[A-Z]?` across `src/engine/transcriptParser.js` and `execution/parse_anthology.py`.

### Issue 15: Running `Cum GPA:` in Student-Based Transcript PDF Locking onto First Term GPA
- **Symptom:** In Variant B (`Student-Based` Unofficial Transcript PDF), `metadata.student_gpa` extracted `3.31` (Fall 2023's cumulative GPA) instead of the final cumulative GPA `3.75`.
- **Root Cause:** Unlike Enrollment-Based PDFs (which print the final `Student GPA: 3.750000` in the Page 1 Header), Student-Based PDFs print a running `Cum GPA:` row at the end of every semester block in chronological order. Guarding the match with `metadata.student_gpa === null` locked onto the first semester.
- **Resolution:** Updated `extractSpatialTranscriptFromPdf` in `src/engine/transcriptParser.js` so `Cum GPA:` in Student-Based transcripts and the final `Undergraduat(e)` summary row update `metadata.student_gpa` to the latest chronological cumulative GPA (`3.75`).

### Issue 16: Browser PDF.js Worker Configuration & PDF-Lib WinAnsi Stack Overflow
- **Symptom 1:** Uploading an Unofficial Transcript PDF in the browser threw `Error: Setting up fake worker failed: "No 'GlobalWorkerOptions.workerSrc' specified."`.
- **Root Cause:** In Node.js (Vitest), `pdfjs-dist` defaults to the file system `require('./pdf.worker.js')`, but Vite in browser requires an explicit worker URL.
- **Resolution:** In `src/main.jsx`, configured `pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl` using Vite's `?url` import query (`import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.js?url'`).
- **Symptom 2:** Generating Degree Plan PDF threw `Error: WinAnsi cannot encode "📅" (0x1f4c5)`.
- **Root Cause:** `StandardFonts.Helvetica` in `pdf-lib` uses WinAnsi encoding which does not support Unicode emojis or extended characters.
- **Resolution:** Added `safeText()` in `src/engine/pdfExporter.js` to strip emojis and sanitize dashes/bullets into WinAnsi-safe ASCII characters.
- **Symptom 3:** Reloading an exported Degree Plan PDF in Option A threw `RangeError: Maximum call stack size exceeded` in `PDFDocument.load()`.
- **Root Cause:** `pdf-lib` decodes keywords via `String.fromCharCode(...charCodes)`. When multiple copies of a ~35KB base64 serialized state were embedded into `setKeywords()`, the keyword array length exceeded V8's 65,535 argument limit.
- **Resolution:** Embedded the serialized state base64 payload solely in `setSubject(DegreePlanState:${b64})` with lightweight markers in `setKeywords(['LindenwoodDegreePlanState', '_AdvisorState'])`, and stripped verbose redundant catalog descriptions from the embedded state so payload size remains under ~20KB.

### Issue 17: Detached ArrayBuffer in Browser Web Worker on Transcript Uploads
- **Symptom:** Uploading an Unofficial Transcript PDF (`.pdf`) on Screen 1 failed with `Record Intake Error Unable to verify Unofficial Transcript PDF: Cannot perform Construct on a detached ArrayBuffer`.
- **Root Cause:** When `verifyAndAssignTranscriptFile` in `Screen1Intake.jsx` read `file.arrayBuffer()` into a single `buffer` variable, it passed `buffer` sequentially to `extractTextFromPdf(buffer)` and then `parseTranscriptPdf(buffer)`. In browser environments using Web Workers (`pdfjs-dist`), `pdfjs.getDocument({ data })` transfers the underlying `ArrayBuffer` to the PDF worker via `postMessage`, permanently detaching the original ArrayBuffer (`byteLength === 0`). The subsequent attempt to instantiate `new Uint8Array(buffer)` threw a fatal `TypeError: Cannot perform Construct on a detached ArrayBuffer`.
- **Resolution:**
  1. In `src/engine/transcriptParser.js` (`extractSpatialTranscriptFromPdf`), implemented a defensive memory clone (`Uint8Array` copy) before passing data to `pdfjs.getDocument`, guaranteeing that callers' original `ArrayBuffers` are never detached by worker transfers.
  2. In `src/engine/transcriptParser.js` (`parseTranscriptPdf`), attached the spatial extractor's `reconstructedText` directly to the returned parsed result (`res.reconstructedText = reconstructedText;`), eliminating redundant PDF parsing.
  3. In `src/components/Screen1Intake.jsx` (`verifyAndAssignTranscriptFile`), streamlined the verification pipeline to call `parseTranscriptPdf(buffer)` once, use its `reconstructedText` for `verifyTranscriptText`, run `verifyDocumentCurrency`, and apply the parsed transcript into state cleanly.
  4. Verified across Brandon Paz's Unofficial Transcripts (both Enrollment-Based and Student-Based variants) in Vitest and headless Chrome automation, with 100% successful extraction and 0 errors.




