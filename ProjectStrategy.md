# Lindenwood University Deterministic Degree Planner — Master Product Specification & Phased Roadmap (`ProjectStrategy.md`)

---

## 1. System Architecture & Technology Stack

### 1.1 Split-Data FERPA Architecture
1. **Client-Side Browser Memory (100% of Student PII & Records):**
   - All student files—Anthology Course Exports (`.csv`, `.xlsx`), Unofficial Transcripts (`.pdf`), and Returning Student Degree Plans (`.pdf` with embedded state metadata)—are parsed strictly in local browser memory using:
     - **SheetJS (`xlsx`):** Client-side `.csv` and `.xlsx` parsing.
     - **Mozilla `pdfjs-dist`:** Client-side `.pdf` text-layer extraction.
     - **`pdf-lib` + `jspdf` + `jspdf-autotable`:** Client-side generation of the colorful Student Degree Plan `.pdf` and injection/extraction of the serialized JSON state inside the PDF's custom XMP/Info metadata dictionary (`LindenwoodDegreePlanState`).
   - **Zero Server Transmission of Student Data:** No student name, ID, email, grade, or course history is ever sent to Supabase, GitHub, or any remote server.
2. **Shared Cloud Database (Public Curriculum, Crowdsourced Offerings, & Faculty Profiles Only):**
   - Powered by **Supabase (PostgreSQL + Auth + Row-Level Security)** with a **Local JSON/IndexedDB Fallback Adapter (`src/services/dbAdapter.ts`)** for offline development and testing.
   - Stores only non-FERPA institutional data:
     - Faculty profiles (`@lindenwood.edu` email, scraped first/last name, position/title, department, headshot URL).
     - Catalog years, degrees, emphases, minors, and certificates.
     - Master course catalog (code, title, credits, description, fees, prerequisites, corequisites, 8-week session availability, modality, and verification status: `Verified`, `Tentative (*)`, or `Blank_Unverified`).
     - Anonymous 2-year GE course popularity counts and rolling GPA aggregates per GE category.
3. **Deterministic Python Scraper & Seed Layer (`execution/*.py`):**
   - `execution/scrape_lindenwood_style.py` — Extracts live CSS variables and typography from `www.lindenwood.edu` and `catalogs.lindenwood.edu` to cross-check against `Style.md`.
   - `execution/lookup_faculty_profile.py` — Queries the public Lindenwood Faculty/Staff directory by `@lindenwood.edu` username/email to extract First Name, Last Name, Position/Title, Department, and Profile Photo URL.
   - `execution/crawl_catalog.py` — Crawls `catalogs.lindenwood.edu` (Modern Campus Catalog / Acalog DOM) on demand for degree checklists (including GE requirements) and official course descriptions, credit hours, prerequisites, corequisites, and course fees.
   - `execution/scrape_academic_calendar.py` — Scrapes Lindenwood's Academic Calendar for semester registration opening dates by class standing (Senior, Junior, Sophomore, Freshman) and session start/end dates.
4. **Static Web Hosting & CI/CD Deployment:**
   - Hosted on **GitHub Pages** (static Vite production build).
   - Automated deployment and live site verification configured via the user's GitHub API token stored in `.env` (`GITHUB_TOKEN`).

---

## 2. Database, Authentication, & Access Control Specification

### 2.1 Authentication & Email Deliverability Stack
1. **Supabase Auth (6-Digit Email OTP — Zero Links Rule):**
   - Configured to send only a **6-digit numeric verification code** (`{{ .Token }}`) with **zero clickable links** to `@lindenwood.edu` addresses.
   - Email template body: *"Your Lindenwood Degree Planner 6-digit verification code is: **{{ .Token }}**. Copy and paste this code into the login window. This code expires in 10 minutes."*
2. **Resend Custom SMTP Integration:**
   - Connected to Supabase Auth SMTP settings so 6-digit codes bypass university Exchange quarantine filters.
3. **Domain Restriction (`@lindenwood.edu` Only):**
   - Frontend split input accepts only the username prefix (e.g., `mwood`) and appends `@lindenwood.edu` automatically.
   - PostgreSQL `BEFORE INSERT` trigger on `auth.users` enforces `^[a-zA-Z0-9._%+-]+@lindenwood\.edu$`.
4. **Strict 5-Minute Anti-Spam Cooldown (Per Username & Per IP):**
   - Table `public.otp_rate_limits` tracks `username_prefix`, `ip_hash`, and `last_requested_at`.
   - Pre-flight RPC `can_request_otp(username_prefix)` blocks repeat requests within **300 seconds (5 minutes)** and returns the remaining cooldown seconds for the UI countdown timer.
5. **Persistent Browser Session:**
   - `@supabase/supabase-js` configured with `persistSession: true`, `autoRefreshToken: true`, and `storageKey: 'lu_degree_planner_auth'` so verified faculty bypass Screen 0 on future visits from the same browser.

### 2.2 Master Database Schema (`supabase/migrations/001_initial_schema.sql`)
1. **`faculty_profiles`:** `email` (PK), `username_prefix`, `first_name`, `last_name`, `position_title`, `department`, `photo_url`, `updated_at`.
2. **`otp_rate_limits`:** `username_prefix`, `ip_hash`, `last_requested_at`.
3. **`catalog_years`:** `id` (`'2024-2025'`, `'2025-2026'`, `'2026-2027'`), `acalog_catoid` (e.g., `7` for 2024–2025, `10` for 2025–2026, `12` for 2026–2027), `numeric_start_year` (enforcing forward-only catalog year switching).
4. **`programs`:** `id`, `catalog_year_id`, `acalog_poid`, `name`, `program_type` (`Major`, `Emphasis`, `Minor`, `Certificate`), `total_program_credits`, `requirements_json`, `notes`.
5. **`courses`:**
   - `code` (canonical normalized key, e.g., `'ICS 21300'`), `department`, `number`, `title`, `credits`, `description`, `fee_info`.
   - `offered_sessions`: Array of valid sessions (`'FA-I'`, `'FA-II'`, `'Fall-16wk'`, `'SP-I'`, `'SP-II'`, `'Spring-16wk'`, `'SU'`, `'FA-Odd'`, `'FA-Even'`, `'SP-Odd'`, `'SP-Even'`).
   - `modalities`: Array (`'Online'`, `'OnGround'`, `'Hybrid'`, `'Email2OL'`).
   - `prereq_logic`: Structured boolean AST supporting `AND`, `OR`, `ONE_OF`, `PLACEMENT`, and `LAST_FULL_SEMESTER`.
   - `coreq_codes`: Array of corequisite course codes.
   - `legacy_substitutions`: Array of equivalent course codes.
   - `verification_status`: `'Verified'` | `'Tentative'` | `'Blank_Unverified'`.
   - `submitted_by`: `@lindenwood.edu` email of first submitter (for Two-Key Peer Verification).
   - `pe_notes`: Array of Policy Exception notes logged by advisors.
6. **`ge_popularity_stats`:** `ge_bucket_id`, `course_code`, `course_title`, `completion_count_2yr`, `average_grade_points`.

### 2.3 Crowdsourced Two-Key Verification Rules
- **`Verified` Immediately:** Seeded courses from departmental planning matrices and offerings harvested from student transcripts completed at Lindenwood within the **most recent 2 calendar years**.
- **`Tentative (*)`:** Single-advisor manual edits to course offerings, prerequisites, or course equivalences. Displays `* Tentative` until a **second distinct `@lindenwood.edu` user** confirms or submits the identical rule, which automatically promotes `verification_status` to `'Verified'`.
- **`Blank_Unverified`:** Courses added without known session availability. Triggers the Missing Availability prompt on Screen 2 and defaults to `Fall-16wk` and `Spring-16wk` in the scheduler until verified.

---

## 3. Official Curriculum Specifications (2026–2027 Catalog `catoid=12` & Matrices)

### 3.1 Bachelor's Degree Policy Thresholds (`Academic Requirements` `navoid=319`)
1. **Total Credits Threshold:** Minimum **120 credit hours** (excluding preparatory coursework numbered `01000`–`09999`; `MTH 11000` and all passing `10000+` courses count).
2. **Upper-Level Credits Threshold:** Minimum **42 credit hours** earned in courses numbered **`30000` or higher**.
3. **Institutional Residency Thresholds:**
   - **30-Credit Residency:** Minimum 30 credit hours completed in residence at Lindenwood University.
   - **Final 24-Credit Residency:** The last 24 credit hours leading to the degree must be completed at Lindenwood University.
   - **Major / Emphasis / Minor / Certificate Residency:** The greater of **18 credit hours or 40%** of the courses required for a major, and at least **40%** of the courses required for a minor, certificate, emphasis, or track must be taken in residence at Lindenwood University.
4. **Minimum GPA Thresholds:** Minimum `2.0` cumulative Lindenwood GPA and `2.0` GPA in major/minor/emphasis/certificate coursework.
5. **Composition Grade Gatekeeper:** Grades of **`C` or higher** required in **`ENGL 15000` / `EPP 15000`** and **`ENGL 17000`** (whether taken at Lindenwood or transferred). A grade of `D` counts toward the 120-credit total, but leaves the Composition bucket **Unfulfilled**.
6. **First-Year Seminar (`UNIV 10100` / `UNIV 10101/10102` / `LUL`):** Waived/Complete automatically if `Total Transfer (TR) Credits > 0` (catalog notes traditional transfers with $\ge 24$ credits are exempt; departmental advising rule waives `UNIV/LUL` when `TR > 0`).
7. **Missouri CORE 42 Waiver:** Transfer students who have completed the Missouri CORE 42 curriculum waive remaining general education courses except those required for the major (`MTH 14100`), provided they have completed at least **6 credit hours (2 courses) of Human Diversity (`/HD`)**.

### 3.2 The 42-Credit (14-Bucket) Waterfall General Education Specification
Courses are claimed in strict priority order. Once claimed by a bucket, a course is removed from the unclaimed GE pool:
1. **Composition I (3cr):** `ENGL 15000` or `EPP 15000` (Grade $\ge \text{C}$).
2. **Composition II (3cr):** `ENGL 17000` (Grade $\ge \text{C}$).
3. **Math (3cr):** `MTH 14100` Basic Statistics (`GE-Math` — dual-satisfies GE Math and Major Math requirement; 3 credits summed once).
4. **U.S. Government or History (3cr):** `GE-Human Culture: U.S. History/Government` (Title contains `'USHisGov'` or `'GE-Civ'`).
5. **Social Science (3cr):** `GE-Social Science` (Title contains `'SocSci'`).
6. **Natural Science with Lab (3–4cr):** `GE-Natural Science with Lab` (1 course with `'NatSciLec/Lab'` OR 2 courses: `'NatSciLec'` + `'NatSciLab'`).
7. **Social or Natural Science Elective (3cr):** Additional unclaimed course matching `'SocSci'` or `'NatSci'`.
8. **Social Science, Natural Science, or Math Elective (3cr):** Satisfied by the second Major Math requirement (`Any GE-Math course`, 3cr) required by all three CS/IT programs (or `'SocSci'`/`'NatSci'` for non-IT programs).
9. **Arts (3cr):** `GE-Human Culture: Arts` (Title contains `':Art'`).
10. **Literature (3cr):** `GE-Human Culture: Literature` (Title contains `':Lit'`).
11. **Human Culture Elective I — Non-Literature, Non-Arts (3cr):** Title contains `'GE-HC'` (World History, Foreign Language, Foreign Culture, Religion, Philosophy, U.S. Hist/Gov) **excluding** `':Art'` and `':Lit'`.
12. **Human Culture Elective II (3cr):** Any remaining unclaimed course containing `'GE-HC'`.
13. **GE Elective I (3cr):** Any remaining unclaimed course containing `'(GE'`.
14. **GE Elective II (3cr):** Any remaining unclaimed course containing `'(GE'`.
- **Human Diversity (`/HD`) Overlay (2 Courses / 6 Credits):** Scanned across all completed/claimed courses for `'/HD'` in the title. If $<2$ `/HD` courses are present, append **`(HD)`** to missing GE placeholders.

### 3.3 Seeded Program 1: `Cybersecurity, BS` (`poid=2148` — 66 Program Credits)
- **Major Coursework (60 Credits — 20 Courses, 3cr each):**
  - `ICS 21300` — Foundations of Information Technology (`any` session, Online)
  - `ICS 21400` — Foundations of Networking (`any` session, Online, Coreq: `ICS 21300`)
  - `ICS 31000` — Foundations of Cybersecurity (`any` session, Online, Prereq: `ICS 21300 AND ICS 21400`)
  - `ICS 32700` — Network and Cloud Security (`FA-II, SP-II`, Online, Prereq: `ICS 21400 AND ICS 31000 AND IIT 22000 AND MTH 14100`)
  - `ICS 32800` — Digital Forensics and Cyber Investigation (`SP-I, SU`, Online, Prereq: `ICS 32700`)
  - `ICS 41200` — Linux Server Installation & Configuration (`SP-I`, Online, Prereq: `ICS 21300 AND MTH 14100 AND (IIT 22000 OR CSC 35500)`)
  - `ICS 41500` — Cloud Computing Essentials and Best Practices (`SP-I`, Online, Prereq: `IIT 22000 AND ICS 21300 AND MTH 14100`; Legacy substitute: `ICS 41100`)
  - `ICS 41700` — Hybrid Cloud Architecture and Management (`SP-II`, Online, Prereq: `ICS 41500`; Legacy substitute: `ICS 41400`)
  - `ICS 42100` — Ethical Hacking (`FA-I`, Online, Prereq: `ICS 32700 OR CSC 45500`)
  - `ICS 42300` — Advanced Penetration Testing (`FA-II`, Online, Prereq: `ICS 42100`)
  - `ICS 42400` — Cybersecurity Analysis (`FA-II`, Online, Prereq: `ICS 42100`)
  - `ICS 43200` — Secure Software Development (`SP-I, SU`, Online, Prereq: `ICS 31000 AND MTH 14100 AND (IIT 21500 OR CSC 10011 OR CSC 24400)`)
  - `ICS 43300` — Web Based Application Security (`FA-I, SP-II`, Online, Prereq: `ICS 32700 AND (IIT 21500 OR CSC 10011)`)
  - `ICS 48900` — Cybersecurity Capstone (`FA-I, SP-I`, Online, Prereq: `LAST_FULL_SEMESTER` / Senior Status $90+$ credits)
  - `IIT 21500` — Programming Logic and Design (`FA-II, SP-I, SU`, Online, Prereq: `ICS 21300 AND (MTH 11000 OR MTH 14100+ OR Math_Placement)`)
  - `IIT 22000` — Hardware and Operating Systems (`FA-I, FA-II, SP-I, SP-II`, Online, Prereq: `ICS 21300`)
  - `IIT 33400` — Ethical Issues in Cybersecurity (`FA-I, SP-II`, Online, Prereq: `ICS 31000 AND MTH 14100`)
  - `IIT 33500` — Blockchain Technology for Business (`FA-I, SP-I, SU`, Online, Prereq: `IIT 21500 OR CSC 10011`)
  - `IIT 35100` — Database Analysis and Design Concepts (`FA-II, SP-II`, Online, Prereq: `IIT 21500 OR CSC 10011`)
  - `IIT 48100` — Project Management in Information Technology (`FA-II, SP-I, SU`, Online, Prereq: `ICS 21300`)
- **General Education Mathematics Coursework (6 Credits — Dual-Counted in GE):**
  - `MTH 14100` — Basic Statistics (3cr)
  - `Any GE-Math course` (3cr)

### 3.4 Seeded Program 2: `Information Technology, BS — Applications Development Emphasis` (`poid=2151` — 66 Program Credits)
- **Major Coursework (24 Credits — 8 Courses, 3cr each):**
  - `ICS 21300`, `ICS 21400`, `ICS 31000`, `IIT 21500`, `IIT 22000`, `IIT 33500`, `IIT 35100`, `IIT 48100`.
- **Emphasis Coursework (36 Credits — 12 Courses, 3cr each):**
  - `ICS 43200` — Secure Software Development (`SP-I, SU`, Online, Prereq: `ICS 31000 AND MTH 14100 AND (IIT 21500 OR CSC 10011 OR CSC 24400)`)
  - `IIT 31400` — Agile Software Development (`FA-II`, Online, Prereq: `ICS 21300`)
  - `IIT 34020` — Mobile Applications Programming (`FA-II` only, Online, Prereq: `IIT 47900`)
  - `IIT 34050` — C# Programming (`SP-II`, Online, Prereq: `IIT 31400 AND MTH 14100`)
  - `IIT 37700` — Fundamentals of HTML (`SP-I`, Online, Prereq: `(IIT 21500 OR CSC 10011) AND MTH 14100`)
  - `IIT 37800` — Applications in Web Development (`SP-II`, Online, Prereq: `IIT 47700`)
  - `IIT 41000` — Systems Analysis and Design (`SP-I`, Online, Prereq: `ICS 21300 AND MTH 14100`)
  - `IIT 45200` — Database Application Implementation (**`SU` only**, Online, Prereq: `IIT 35100 AND MTH 14100`)
  - `IIT 47700` — Fundamentals of User Interface Design (`FA-I`, Online, Prereq: `IIT 34050 AND IIT 37700 AND MTH 14100`)
  - `IIT 47800` — Applications in Object-Oriented Web Development (`SP-II`, Online, Prereq: `IIT 47700`)
  - `IIT 47900` — Applications in Multi-Tiered Web Programming (`FA-I`, Online, Prereq: `IIT 47800` OR Coreq: `IIT 47700`)
  - `IIT 48900` — Information Technology Capstone (`FA-II, SP-II`, Online, Prereq: `LAST_FULL_SEMESTER` / Senior Status $90+$ credits)
- **General Education Mathematics Coursework (6 Credits — Dual-Counted in GE):**
  - `MTH 14100` — Basic Statistics (3cr) + `Any GE-Math course` (3cr).

### 3.5 Seeded Program 3: `Information Technology, BS — Networking Emphasis` (`poid=2152` — 60 Program Credits)
- **Major Coursework (24 Credits — 8 Courses, 3cr each):**
  - `ICS 21300`, `ICS 21400`, `ICS 31000`, `IIT 21500`, `IIT 22000`, `IIT 33500`, `IIT 35100`, `IIT 48100`.
- **Emphasis Coursework (30 Credits — 10 Courses):**
  - `ICS 32300` — Cisco I-Introduction to Networks (**5cr**, `FA-I` OnGround / `Email2OL`, Prereq: `ICS 43400`)
  - `ICS 32301` — Introduction to Networks Lab (**1cr**, `FA-I` OnGround / `Email2OL`, Prereq: `ICS 43400`, Coreq: `ICS 32300`)
  - `ICS 32400` — Cisco II-Routing and Switching Essentials (**5cr**, `FA-II` OnGround / `Email2OL`, Prereq: `ICS 32300`)
  - `ICS 32401` — Routing and Switching Lab (**1cr**, `FA-II` OnGround / `Email2OL`, Prereq: `ICS 32300`, Coreq: `ICS 32400`)
  - `ICS 32500` — Cisco III-Scaling Networks (**5cr**, `SP-I` OnGround / `Email2OL`, Prereq: `ICS 32400`)
  - `ICS 32501` — Scaling Networks Lab (**1cr**, `SP-I` OnGround / `Email2OL`, Prereq: `ICS 32400`, Coreq: `ICS 32500`)
  - `ICS 43400` — Network Management (**3cr**, `SP-II`, Online, Prereq: `ICS 21400 AND MTH 14100`)
  - `IIT 36600` — Fundamentals of Data Center Virtualization (**3cr**, `FA-I`, Online, Prereq: `ICS 21400 AND MTH 14100`)
  - `IIT 36700` — Fundamentals of Cloud Computing (**3cr**, `FA-II`, Online, Prereq: `ICS 21400 AND MTH 14100`)
  - `IIT 48900` — Information Technology Capstone (**3cr**, `FA-II, SP-II`, Online, Prereq: `LAST_FULL_SEMESTER`)
  - **Cisco Concurrent Lab Exemption Rule (Catalog `poid=2152`):** Students must enroll concurrently in Cisco lecture (`5cr`) + lab (`1cr`) unless: (1) they transferred one or more Cisco courses with a `C` or better or passed a Cisco course at Lindenwood under a prior catalog, OR (2) they hold a current Cisco certification with experiential learning credit.
  - **Retired Course Note:** Legacy catalog years containing `ICS 32600` (5cr) and `ICS 32601` (1cr) flag an advisor recommendation to roll forward to the `2024-2025+` catalog or file a Policy Exception (`PE`).
- **General Education Mathematics Coursework (6 Credits — Dual-Counted in GE):**
  - `MTH 14100` — Basic Statistics (3cr) + `Any GE-Math course` (3cr).

---

## 4. Phased Build Roadmap

### Phase 0: Environment Bootstrap, Permissions, & Live Style Scraper
1. **OS & CLI Readiness:**
   - Verify PowerShell `ExecutionPolicy` (`RemoteSigned` on Windows), `git`, `python >= 3.10`, and `node >= 20`.
2. **Project Scaffolding & Ignore Files:**
   - Initialize directory tree (`directives/`, `execution/`, `src/`, `public/assets/logos/`, `.tmp/samples/`).
   - Create `.gitignore` and `.antigravityignore` excluding `node_modules/`, `dist/`, `.venv/`, `.tmp/`, and `.env`.
3. **Python `.venv` & Node Dependencies:**
   - Install Python packages (`requests`, `beautifulsoup4`, `lxml`, `playwright`, `pandas`, `openpyxl`, `pdfplumber`, `python-dotenv`, `supabase`, `pytest`) and Chromium via Playwright.
   - Initialize Vite + React + TypeScript + Tailwind CSS and install `xlsx`, `pdfjs-dist`, `pdf-lib`, `jspdf`, `jspdf-autotable`, `@dnd-kit/core`, `@dnd-kit/sortable`, `lucide-react`, `@supabase/supabase-js`, and `vitest`.
4. **Live Lindenwood Branding & Style Scraper (`execution/scrape_lindenwood_style.py`):**
   - **Style Extraction Specification:** Crawl `https://www.lindenwood.edu` and `https://catalogs.lindenwood.edu` to extract computed CSS root variables, header/footer DOM structure, button border-radius, box-shadow tokens, and loaded webfont URLs (`Obviously`, `Trade Gothic Next`, or `Arial` fallback). Merge extracted tokens with `Style.md` (enforcing `--lu-gold-standard: #B5A36A` and WCAG `--lu-gold-accessible: #857542`) to generate `src/styles/theme.css`.

---

### Phase 1: Master Database, Seeded Curriculum (3 Majors), & Screen 0 Login
1. **Database Schema & Dual Adapter (`src/services/dbAdapter.ts`):**
   - Implement Supabase PostgreSQL schema + local IndexedDB/JSON fallback adapter.
2. **Curriculum Seed Script (`execution/seed_from_matrices.py`):**
   - Parse the Excel planning matrices and the 2026–2027 catalog HTML files (`catoid=12`) into `src/data/seedDatabase.json` with `verification_status = 'Verified'`.
3. **Faculty Directory Auto-Profile Scraper (`execution/lookup_faculty_profile.py`):**
   - Query the public Lindenwood Faculty/Staff Directory by username prefix (e.g., `mwood` $\rightarrow$ `mwood@lindenwood.edu`) to extract `first_name` (`Matthias`), `last_name` (`Wood`), `position_title` (`Senior Instructor`), `department` (`Mathematics`), and `photo_url`.
4. **Screen 0 UI (`src/components/Screen0Login.tsx`):**
   - Split username input (`mwood` + `@lindenwood.edu`), 5-minute rate-limit cooldown timer, 6-digit numeric paste modal, FERPA/cookie reassurance callout box, and global navigation header with the Faculty Profile badge and dropdown menu (`Advisor Workspace`, `Upload Bingo Sheet`, `View/Edit Shared Master Database`).

---

### Phase 2: Screen 1 Intake, Single-File Dropzones, & On-Demand Catalog Crawler
1. **Strict Single-File Dropzones & Control Ordering (`src/components/Screen1Intake.tsx`):**
   - Every upload box enforces `maxFiles: 1` (`multiple={false}`) and strict file extension locks:
     - **Option A (Returning Student Reload):**
       - Box A1 (Mandatory): Previously Exported Degree Plan (`.pdf` only).
       - Box A2-1 (Optional): Anthology All-Courses Export (`.csv` or `.xlsx` only) + embedded **Scribe SOP Link**.
       - Box A2-2 (Optional): Unofficial Transcript (`.pdf` only) + embedded **Scribe SOP Link**.
     - **Option B (New Student Audit — Strict Vertical Order):**
       1. **Mandatory Student Record Upload (Must upload at least 1 of the 2 separated boxes):**
          - Box B1-1: Anthology Course Information (`.csv` or `.xlsx` only) + embedded **Scribe SOP Link**.
          - Box B1-2: Unofficial Student Transcript (`.pdf` only) + embedded **Scribe SOP Link**.
       2. **Program Selection (Strictly ABOVE the Optional Bingo Sheet Dropzone):**
          - **Catalog Year Dropdown** $\rightarrow$ **Degree / Emphasis Dropdown** $\rightarrow$ **`[+ Add Major / Minor / Certificate]` Button**.
       3. **Optional Departmental Bingo Sheet / Degree Plan Dropzone:** Accepts `.xlsx` or `.csv` only (`maxFiles: 1`).
       4. **Scheduling Constraints:**
          - **Start Semester:** Defaults to the next chronological semester after the latest active/completed term in the student file.
          - **Modality Preference:** `No Preference` (default), `Online-Only`, `Prefer OnGround`, `Prefer Online`.
          - **Summer Availability:** `No Summer` (default) or `Yes Summer` $\rightarrow$ reveals **Max Summer Credits:** `3`, `6`, `9`, `12 (Not Recommended)` + per-credit tuition note.
          - **Pacing Mode (3 Linked Dropdowns):**
            - `Full-Time` (default: `9cr / 8wk` from `[3, 6, 9, 12]`; `18cr / 16wk` from `[12, 15, 17, 18, 21, 24]`).
            - `Part-Time` (default: `6cr / 8wk` from `[3, 6]`; `11cr / 16wk` from `[1, 3, 6, 9, 11, 12]`).
2. **Client-Side Transcript & Anthology Parser (`src/engine/transcriptParser.ts`):**
   - Calibrated against local sample files in `.tmp/samples/`.
   - Normalizes course codes (`"DEPT NUMBER"`), strips schedule noise rows, filters excluded grades (`F`, `W`, `AF`, `WF`, `INC`, `Dropped`, `<10000`) into the **Excluded Courses Ledger**, deduplicates retakes (retaining only the single highest passing attempt), and categorizes valid courses into `Transfer (TR)`, `Completed`, `Current`, and `Scheduled`.
3. **Passive 2-Year Transcript Harvester:**
   - Scans `Completed` and `Current` non-`TR` Lindenwood courses from the past 2 calendar years to update course session/modality offerings in the Shared Master Database as `Verified` immediately and increment anonymous `ge_popularity_stats`.
4. **On-Demand Lindenwood Catalog Crawler (`execution/crawl_catalog.py`):**
   - Parses Acalog program pages (`preview_program.php?catoid=X&poid=Y` — `.acalog-core`, `.acalog-course`) and course popups (`preview_course.php?catoid=X&coid=Z`) to pull degree requirements (including GE) and verbatim course descriptions, credit hours, prerequisites, corequisites, and fees.

---

### Phase 3: Deterministic 42-Credit Waterfall Audit Engine & Screen 2 UI
1. **Waterfall Audit & Policy Engine (`src/engine/waterfallAudit.ts`):**
   - Executes the 14-bucket (42-credit) GE Waterfall, `/HD` 2-course check, `UNIV/LUL` transfer waiver (`TR > 0`), CORE 42 toggle, and Major/Emphasis/Multi-program matching.
   - **Math Placement Logic (`IIT 21500`):** Automatically marks the math prerequisite for `IIT 21500` satisfied if the student completed `MTH 11000`, `MTH 14100`, or any higher `MTH` course, and provides a manual *"Math Placement Met"* toggle on Screen 2 if no math course is on the transcript yet.
   - **Upper-Level (`30000+`) 42-Credit Safeguard:** Generates `Upper-Level Elective (30000+) (3cr)` placeholders for any projected deficit below 42 upper-level credits before generating general `Elective (3cr)` placeholders to reach 120 total credits.
2. **Screen 2 UI (`src/components/Screen2Audit.tsx`):**
   - **Top Card ("Race to the Graduation Flag"):** Progress bar from `0` to `120+` flag with Stick-Figure Student at `Completed Credits` and solid extension bar for `Enrolled Credits`. Includes structured checklist rows for Total Credits, Upper-Level (`30000+`) Credits, **Credits at Lindenwood vs. 30-Credit & Final 24-Credit Residency**, `/HD` & Composition `C`-or-higher checks, and a **dedicated separate row for the Excluded Courses List**.
   - **Middle Card (Requirement Matching & Advisor Controls):** Grouped by `GE`, `Major`, `Emphasis`, and `Elective`. Includes **`[+ Add Incoming Transfer Placeholder]`**, editable student course equivalence dropdowns (with option to save to Shared DB as `* Tentative` or log a `PE`), and a **`[+ Note]`** button next to every requirement.
   - **Bottom Button & Conditional Missing Availability Modal:** Clicking **`[Generate Optimal Graduation Plan]`** checks if any remaining required courses have blank availability in the Shared DB; if so, opens the Missing Availability Modal (applying the sitewide default of `Fall-16wk` and `Spring-16wk` for any course left blank).

---

### Phase 4: Deterministic 8-Week Critical-Path Scheduler & "What-If" Accelerator
1. **Critical-Path Scheduler (`src/engine/scheduler.ts`):**
   - Locks (`🔒`) `Scheduled` transcript courses as anchors.
   - Enforces prerequisites, corequisites (including Cisco 5cr lecture + 1cr lab concurrency), and **same-semester Session I $\rightarrow$ Session II chaining** (`FA-I` $\rightarrow$ `FA-II` and `SP-I` $\rightarrow$ `SP-II`).
   - Evaluates `FA-Odd` / `FA-Even` / `SP-Odd` / `SP-Even` strictly against the calendar year of the target term (e.g., `Fall 2026` = Even, `Spring 2027` = Odd).
   - Enforces the **Forced Summer Exception (`IIT 45200`)** when `No Summer` is selected, flagging it in the Smart Alert Banner with downstream prerequisite analysis.
   - Applies Capstone placement (`ICS 48900` / `IIT 48900` in `Last Full Semester` at $90+$ credits) and prioritizes Spring Capstone + Summer elective completion when it yields an earlier graduation date.
   - Balances credit loads evenly across `I 8wk` and `II 8wk` while respecting Full-Time (12cr Fall/Spring floor) or Part-Time caps.
2. **Tactile Weight Flexibility Classifier:**
   - Classifies every scheduled card into **Sky Blue / Cyan (`Easily Movable`)**, **Warm Amber / Ochre (`Movable with Effort`)**, or **Charcoal Gray / Deep Slate (`Not Really Movable`)** per `Style.md`.
3. **Background "What-If" Accelerator:**
   - Simulates enabling Summer sessions and $+3$cr session loads to surface up to **2 concise graduation acceleration suggestions**.

---

### Phase 5: Screen 3 Visual Schedule Board, Course Inspector Drawer, & Auto-Notes
1. **3-Zone Visual Schedule Board (`src/components/Screen3ScheduleBoard.tsx`):**
   - **Zone 1 (Top):** Past Completed Semesters (compact, muted gray, small non-interactive text above a solid divider line).
   - **Zone 2 (Middle Band):** Current Active Semester + **Bold/Highlighted Pending Incoming Transfers**.
   - **Zone 3 (Bottom):** Future Interactive Grid (`Fall` left, `Spring` right, `Summer` centered below).
2. **Course Cards, Conflict Notification Dot, & Clickable Inspector Drawer:**
   - Cards display Category Badge (`GE`, `M`, `m`, `Em`, `E`), Department, Code, Title, Credits, Offered sessions, Prereqs, Coreqs, `🔒` Lock toggle, and Tactile Flexibility Color.
   - Unlocking and dragging any card into a conflicting session highlights the card and displays the **Conflict Notification Dot** with hover options to **Override via Shared DB (`* Tentative`)** or **Flag for Policy Exception (`PE`)** (which inserts a `Needs PE for [Course]` note into that semester).
   - Clicking any card opens the **Course Inspector Drawer** showing verbatim Lindenwood Catalog details (`Description`, `Credits`, `Prereqs`, `Coreqs`, `Fees`), Shared DB `Offered` sessions, and (for GE placeholders) the **Most Popular Courses & Average Grades** from `ge_popularity_stats`.
3. **Registration Opening Dates & Reorderable Semester `[+ Note]` List:**
   - Displays the student's **Registration Opening Date** under each future semester based strictly on **courses completed prior to that registration window** (so `FA-I` credits count toward Spring registration).
   - Reorderable (`⠿` click-and-hold), editable (`✏️`), and deletable (`🗑️`) semester notes supporting custom notes and auto-notes:
     - **`Application for Degree Form`** (in 2nd-to-last and last semester with exact deadline: March $\rightarrow$ `January 15`, May $\rightarrow$ `February 1`, August $\rightarrow$ `June 1`, October $\rightarrow$ `September 15`, December $\rightarrow$ `September 15`).
     - **`Petition for Academic Course Overload`** + per-credit overload tuition notice (any semester $>18$ credits).
     - **Summer Per-Credit Tuition Notice** (any Summer semester with $>0$ credits).
     - **`Needs PE`** reminders.

---

### Phase 6: Stateful `.pdf`-Only Export, Round-Trip Reload, & GitHub Pages Deployment
1. **Stateful `.pdf` Exporter (`src/engine/pdfExporter.ts`):**
   - Generates the official printable Lindenwood Degree Plan `.pdf` containing Student & Advisor metadata headers (with clean blank lines if fields are missing), credit audit summary, colorful semester tables preserving Sky Blue / Warm Amber / Deep Slate badges, category icons, registration opening dates, and ordered semester notes.
   - Embeds the serialized JSON project state inside the PDF's custom `Info` / XMP metadata (`LindenwoodDegreePlanState`) for instant reload in Screen 1 (`Option A`).
2. **End-to-End Automated Test Suite & GitHub Pages Publish:**
   - Run unit and integration tests (`vitest` & `pytest`) across all audit, waterfall, prerequisite, and PDF round-trip rules.
   - Build static production bundle (`npm run build`), deploy to GitHub Pages using the configured GitHub API token, and verify live site availability.