# SOP: Extraction Rules for Anthology Course Schedule Records

**File Path:** `directives/ExtractAnthologyFile.md`  
**Target:** Anthology "Student Course Schedules (All Results)" exports (`.xlsx` and `.csv`).  
**Execution Engine:** Deterministic client-side parser (`src/engine/transcriptParser.js`) and local calibration script (`execution/parse_anthology.py`).

---

## 1. Document Format & Header Layout

### 1.1 Sheet & Header Row Location
- **Worksheet Name (`.xlsx`):** `Sheet1` (always read index `0` if sheet name varies).
- **Header Row Index:** Row `0` (the very first row contains the 20 standard Anthology column headers).
- **Total Columns:** `20` columns:
  `['Course Code', 'Course Name', 'Published Code', 'Section', 'Term', 'Course Status', 'Letter Grade', 'Start Date', 'Instructor', 'Credits', 'Hours', 'Campus', 'Enroll Status Credits', 'Enroll Status Hours', 'Area of Study', 'Payment Period', 'Delivery Method', 'Points', 'SPE Progression', 'Enrollment']`

### 1.2 Student & Program Metadata Location
- **Student PII Absent by Design:** Standard Anthology "Student Course Schedules (All Results)" exports do **not** contain Student Name, Student ID, Student Email, or Advisor Name in the spreadsheet cells. The UI must leave those PDF export header fields blank/editable unless populated from a paired Unofficial Transcript PDF or entered by the advisor.
- **Primary Degree / Major (`Enrollment` column — Index 19):**
  - Formatted as `<ProgramCode>/<Program Title>/<Status>` (e.g., `CYBSCBS/Cybersecurity BS/ATT`).
  - Extract the middle segment (`Cybersecurity BS`) to auto-select the student's Primary Major dropdown.
- **Secondary Major / Minor / Certificate (`Area of Study` column — Index 14):**
  - Populated on specific rows tagged to a secondary credential (e.g., `Minor - Cinema Arts Minor`).
  - Scan all non-null unique values in `Area of Study` to automatically flag or add declared Minors/Certificates.
- **Catalog Year Inference:**
  - Determine the student's default Catalog Year from the **earliest chronological non-transfer Lindenwood `Start Date` or `Term`** (e.g., earliest term `FALL_I_24_8W` / `FALL_24_16W` starting `2024-08-26` maps to Catalog Year `2024-2025`).
  - Also note version suffixes on `Course Code` (e.g., `ICS42100-23`, where `-23` denotes a course template from the Fall 2023+ curriculum revision).

### 1.3 Critical Noise Filter: Interleaved On-Ground Meeting Sub-Tables
- Whenever a student enrolls in an **On Ground** course, Anthology injects a multi-row meeting schedule sub-table directly beneath that course row (accounting for nearly 45% of all rows in typical exports).
- **How Noise Rows Appear:**
  - Sub-header row: `Course Code` is `NaN`/empty, `Course Name` = `"Day"`, `Published Code` = `"Room"`, `Section` = `"Building"`, `Term` = `"Location"`, `Course Status` = `"Time"`.
  - Meeting rows: `Course Code` is `NaN`/empty, `Course Name` = `"Monday"` / `"Tuesday"` / etc., `Published Code` = `"Young Hall 204"` (room name), `Section` = `"Young Hall"`, `Term` = `"St. Charles - Home Campus"`, `Course Status` = `"10:00:00 AM - 10:50:00 AM"`.
- **Mandatory Row-Level Noise Filter (Execute First):**
  - **DROP** any row where `Course Code` is null, empty, or whitespace (`NaN`).
  - **DROP** any row where `Course Name` equals `"Day"` or a weekday name, or where `Published Code` equals `"Room"`.
  - Only rows where `Published Code` matches the canonical course pattern `^[A-Z]{2,4}\s*\d{4,5}$` proceed to extraction.

---

## 2. Column & Field Mapping (What to Extract vs. What to Ignore)

### 2.1 Columns to EXTRACT (10 Essential Columns)

| Column Name | Col Index | Purpose & Deterministic Extraction Rule |
| :--- | :---: | :--- |
| **`Published Code`** | `2` | **Primary Canonical Course Key.** Unlike `Course Code`, `Published Code` strips internal curriculum suffixes (e.g., `Course Code` is `ICS42100-23`, while `Published Code` is `ICS42100`). Normalize by uppercase + stripping all spaces/hyphens (`ICS 42100` $\rightarrow$ `ICS42100`). |
| **`Course Code`** | `0` | **Row Validity & Catalog Version Key.** Used first to filter out `NaN` meeting-schedule rows, and secondarily to detect catalog-template suffixes (`-23`). |
| **`Course Name`** | `1` | **Course Title & Inline GE/HD Tag Source.** Anthology embeds General Education and Human Diversity tags directly inside parentheses at the end of `Course Name`: e.g., `College Algebra (GE-Math)`, `Criminology (GE-SocSci)`, `Introduction to Film (GE-HC:Arts)`, `Basic Concepts of Sociology (GE-SocSci/HD)`, `Concepts in Biology (GE-NatSciLec/Lab)`, `American Government: The Nation (GE-HC:USHisGov)`, `World History: Empires and Exchanges since 1500 (GE-HC:WHis/HD)`. |
| **`Term`** | `4` | **Academic Term & Session Duration.** Encodes Season, Session (`I` or `II`), 2-digit Year, and Duration (`8W` or `16W`):<br>• `FALL_I_26_8W` $\rightarrow$ Fall 2026, Session I (8-week)<br>• `FALL_II_26_8W` $\rightarrow$ Fall 2026, Session II (8-week)<br>• `FALL_26_16W` $\rightarrow$ Fall 2026, Full Semester (16-week)<br>• `SPRING_I_26_8W` $\rightarrow$ Spring 2026, Session I (8-week)<br>• `SPRING_II_26_8W` $\rightarrow$ Spring 2026, Session II (8-week)<br>• `SPRING_26_16W` $\rightarrow$ Spring 2026, Full Semester (16-week)<br>• `SUMMER_26_8W` / `SU_26_8W` $\rightarrow$ Summer 2026 (8-week)<br>• `TRANSFER_TERM` $\rightarrow$ External transfer credit<br>• `NaN` (Blank) $\rightarrow$ Unscheduled degree-audit placeholder when `Course Status == "Future"`. |
| **`Course Status`** | `5` | **Enrollment State.** Values include `Complete`, `Current`, `Scheduled` (or `Registered`), `Future`, `Withdrawn`, `Dropped`, `Dropped-W`. |
| **`Letter Grade`** | `6` | **Official Grade.** Values include `A`, `B`, `C`, `D`, `F`, `W`, `WF`, `AF`, `TR-P`, `P`, `CR`, `INC`, or `NaN` (for `Current`/`Future` rows). |
| **`Start Date`** | `7` | **Chronological Anchor (`YYYY-MM-DD`).** Used to sort courses chronologically, verify the last 24 residency credits, and check the **2-year recency window** when passively harvesting verified course offerings into the Shared Master Database. |
| **`Credits`** | `9` | **Credit Hours (`float`).** Standard values: `1.0`, `3.0`, `4.0`, `5.0`. Use `Credits` as the single source of credit truth. |
| **`Delivery Method`** | `16` | **Modality.** Values: `Online`, `On Ground`, `Hybrid` (or `NaN` on transfer/future rows). Used alongside `Term` to passively harvest verified course modalities from the past 2 years. |
| **`Area of Study` & `Enrollment`** | `14`, `19` | **Program Metadata.** Auto-detects Primary Major (`Enrollment`) and declared Minors (`Area of Study`). |

### 2.2 Columns to IGNORE (10 Non-Essential Columns)
Do **not** ingest or pass these columns into the audit or scheduling state:
1. **`Section` (Col 3):** Contains section numbers (`OL21`, `11`) and building names on noise rows. (`Delivery Method` and `Term` already provide exact modality and session data.)
2. **`Instructor` (Col 8):** Faculty name—not used for degree auditing or scheduling.
3. **`Hours` (Col 10):** Clock hours (always `0.0` for credit-bearing courses).
4. **`Campus` (Col 11):** Always `MAIN Campus` or `NaN`.
5. **`Enroll Status Credits` (Col 12):** Redundant duplicate of `Credits` (even populated on unscheduled `Future` rows).
6. **`Enroll Status Hours` (Col 13):** Always `0.0`.
7. **`Payment Period` (Col 15):** Financial aid field (always `NaN`).
8. **`Points` (Col 17):** Per-credit GPA quality points (`4.0`, `3.0`, `0.0`). `Letter Grade` is used directly for grade rules.
9. **`SPE Progression` (Col 18):** Always `NaN`.

### 2.3 Course Level & Preparatory Filter
- Extract the 5-digit integer from `Published Code` (e.g., `ICS42100` $\rightarrow$ `42100`, `MTH11000` $\rightarrow$ `11000`).
- **Sub-10000 Rule:** Any course numbered `01000–09999` is preparatory and **excluded** from the 120-credit graduation total.
- **10000+ Rule:** All passing courses numbered `>= 10000` (including `MTH11000`, `UNIV10100`, `UNIV18205`) **count** toward the 120-credit total.
- **Upper-Level (`30000+`) Rule:** All passing/current courses numbered `>= 30000` count toward the **42-credit Upper-Level threshold**.

---

## 3. Grade Normalization & Classification

Every valid course row must be classified into one of **five deterministic states** based on `Course Status`, `Term`, and `Letter Grade`:

### 3.1 State 1: `Completed` (Lindenwood Earned Credits)
- **Trigger:** `Course Status == "Complete"` AND `Term != "TRANSFER_TERM"` AND `Letter Grade` is in `['A', 'B', 'C', 'D', 'P', 'CR']`.
- **Audit Treatment:**
  - Counts toward **Completed Credits** (the stick-figure position on Screen 2), **Lindenwood 30-Credit Residency**, **Final 24-Credit Residency**, and **Priority Registration Class Standing**.
  - Satisfies prerequisites, GE buckets, and Major requirements—**EXCEPT** `ENGL15000`, `EPP15000`, and `ENGL17000`, where a grade of **`D`** counts toward the 120-credit total and general electives, but **does NOT fulfill the Composition I / II bucket** (which strictly requires `C` or higher).

### 3.2 State 2: `Transfer (TR)` (External Earned Credits)
- **Trigger:** `Term == "TRANSFER_TERM"` OR `Letter Grade` starts with `"TR"` (e.g., `TR-P`, `TR`, `TR-A`, `TR-B`, `TR-C`) OR `Course Status == "TR"`.
- **Audit Treatment:**
  - Counts toward **Completed Credits** (120-credit total) and **Priority Registration Class Standing**.
  - Does **NOT** count toward the **30-Credit Lindenwood Residency** or **Final 24-Credit Residency** thresholds.
  - Does **NOT** trigger passive 2-year Shared Master Database offering/modality updates.
  - **Automatic UNIV/LUL Waiver:** If `Sum(Transfer Credits) > 0`, automatically mark `UNIV 10100 / 10101 / 10102` (First-Year Seminar) as **Waived/Complete**.

### 3.3 State 3: `Current` (In-Progress Active Term Credits)
- **Trigger:** `Course Status == "Current"` (or `Letter Grade` is `NaN`/`IP` with an active current-semester `Term` such as `FALL_II_26_8W` or `FALL_26_16W`).
- **Audit Treatment:**
  - Counts toward **Enrolled Credits** (the solid extension bar extending past the stick figure on Screen 2).
  - Treated as **valid for satisfying prerequisites** for subsequent semesters (and `Session I` `Current` courses satisfy `Session II` prerequisites within the same semester).
  - Counts toward **Priority Registration Class Standing** *only if* that 8-week session concludes prior to the registration opening date (e.g., `FALL_I` completed credits count for Spring priority registration).

### 3.4 State 4: `Scheduled` (Registered Future Anchor Credits)
- **Trigger:** `Course Status` is `"Scheduled"` or `"Registered"` (or `"Future"` **ONLY IF** `Term` is **not null** and specifies a concrete upcoming term like `SPRING_I_27_8W`).
- **Audit Treatment:**
  - Counts toward **Enrolled Credits** and is locked (`🔒`) as a fixed anchor in that future semester on Screen 3 while still verifying its prerequisites.

### 3.5 State 5: `Excluded` (Unearned, Failed, Withdrawn, or Unscheduled Audit Rows)
- **Trigger:** Any row matching **any** of the following:
  1. **Unscheduled Anthology Audit Rows:** `Course Status == "Future"` AND `Term` is `NaN`/blank. *(In Anthology exports, remaining degree-audit courses are exported at the bottom of the sheet with `Course Status = "Future"` and `Term = NaN`. These are NOT scheduled enrollments and MUST be excluded from credit sums.)*
  2. **Failing / Non-Passing / Withdrawn Grades:** `Letter Grade` in `['F', 'W', 'WF', 'AF', 'INC', 'I', 'AU', 'NC']` or `Course Status` in `['Withdrawn', 'W', 'F', 'INC', 'Dropped', 'Dropped-W']`.
  3. **Preparatory Level:** `Published Code` numeric portion `< 10000`.
- **Audit Treatment:**
  - Stripped from all credit sums.
  - Failing/withdrawn/preparatory courses and deduplicated retakes are logged in the **Excluded Courses List** on Screen 2 (with their code, title, and exact reason). Unscheduled `Future` (`Term = NaN`) rows are silently ignored by the credit counter since the Waterfall Audit calculates remaining courses deterministically from the degree checklist.

---

## 4. Retake & Deduplication Rules

Students frequently have duplicate `Published Code` entries in an Anthology export due to (a) course retakes, (b) an in-progress course also appearing as an unscheduled `Future` row, or (c) Anthology duplicating a `Future` row when a course applies to both an Elective and a Minor.

### 4.1 Priority Ranking for Deduplication
Group all valid course rows by canonical `Published Code`. If a `Published Code` appears more than once, **retain ONLY ONE row** using this strict priority hierarchy:
1. **Passed `Completed` or `Transfer` attempt** with the **highest letter grade** (`A` > `B` > `C` > `TR-P`/`P`/`CR` > `D`).
2. **`Current` (In-Progress) attempt** (if the student has not yet passed the course, or is currently retaking a previously failed/low-grade attempt).
3. **`Scheduled` attempt** (with a concrete non-null `Term`).
4. **Excluded / Failed / Unscheduled `Future` (`Term = NaN`) attempts.**

### 4.2 Credit & Ledger Handling for Duplicates
- **Never Double-Count Credits:** A unique `Published Code` can contribute its `Credits` value **at most once** to the student's credit bank.
- **Ledger Reporting:** If a student has multiple historical attempts (e.g., took `MTH14100` in Fall 2024 with an `F` or `D` and retook `MTH14100` in Spring 2025 with a `B`), retain the `B` attempt in `Completed Credits` and list the earlier attempt in the **Excluded Courses List** on Screen 2 tagged as `Excluded: Repeat / Retake`.
- **Minor Tag Preservation:** If a course appears twice in Anthology because one row has `Area of Study = "Minor - Cinema Arts Minor"` and the other has `Area of Study = NaN` (as seen with `CINE11000`, `CINE13000`, `CINE34000`), merge the `Area of Study` metadata onto the single surviving row before discarding the duplicate.

---

## 5. Transfer & Special Credit Blocks

### 5.1 Direct Equivalent Transfer Courses
- When a transfer course equates to a specific Lindenwood course (e.g., Row 70: `Published Code = HIST10100`, `Course Name = World History: Empires and Exchanges since 1500 (GE-HC:WHis/HD)`, `Term = TRANSFER_TERM`, `Letter Grade = TR-P`), the parser extracts both the exact `Published Code` (`HIST10100`) and all parenthetical tags (`GE-HC:WHis` and `/HD`).

### 5.2 Synthetic GE Bucket Transfer Codes (`GE11xxx`)
- When a transfer course satisfies a General Education bucket without a direct departmental course code, Anthology assigns a synthetic code starting with `GE` (e.g., Row 69: `Published Code = GE11006`, `Course Name = GE-Human Culture: Literature (GE-HC:Lit)`, `Term = TRANSFER_TERM`, `Letter Grade = TR-P`).
- The Waterfall Audit matches these synthetic `GE11xxx` courses directly to their corresponding GE bucket via the parenthetical tag in `Course Name` (e.g., `(GE-HC:Lit)` $\rightarrow$ `Literature` bucket).

### 5.3 Inline GE & Human Diversity (`/HD`) Tag Extraction Regex
- For every `Completed`, `Transfer`, `Current`, and `Scheduled` row, extract any parenthetical `(GE-...` substring from `Course Name`:
  - **Human Diversity (`/HD`) Check:** If the parenthetical tag contains `/HD` (e.g., `(GE-SocSci/HD)` on `SOC10200` or `(GE-HC:WHis/HD)` on `HIST10100`), increment the student's **Human Diversity (`/HD`) counter** by 1 course (3 credits) while simultaneously allowing the course to satisfy its primary GE bucket.
  - **Waterfall Tag Mapping:**
    - `ENGL15000` or `EPP15000` (with grade `A`, `B`, `C`, or `TR-P`) $\rightarrow$ `Composition I`
    - `ENGL17000` (with grade `A`, `B`, `C`, or `TR-P`) $\rightarrow$ `Composition II`
    - `MTH14100` $\rightarrow$ Dual-satisfies `Mathematics (GE)` and `Major Math Requirement` (`MTH 14100`)
    - Other `(GE-Math)` (e.g., `MTH15100 College Algebra (GE-Math)`) $\rightarrow$ Satisfies the 2nd Math requirement (`Any GE-Math course` / `Sci/Soc/Math Elective`)
    - `USHisGov` $\rightarrow$ `U.S. Hist/Gov`
    - `SocSci` $\rightarrow$ `Social Science` (and `Soc/Nat Sci Elective` overflow)
    - `NatSciLec/Lab` (or `NatSciLec` + `NatSciLab`) $\rightarrow$ `Natural Science with Lab` (note: 4-credit lab sciences like `BSC10000` satisfy the 3-credit bucket and contribute all 4.0 credits toward the 120-credit total)
    - `:Arts` or `:Art` $\rightarrow$ `Fine Arts`
    - `:Lit` $\rightarrow$ `Literature`
    - `GE-HC` (excluding `:Arts`/`:Art` and `:Lit`, e.g., `GE-HC:WHis`, `GE-HC:ForCul`, `GE-HC:Relig`, `GE-HC:Phil`) $\rightarrow$ `Human Culture Elective I (Non-Lit/Non-Arts)`
    - Any second `GE-HC` course (including a 2nd `:Arts` course like `CINE14000` + `AAD18101`) $\rightarrow$ `Human Culture Elective II`
    - Any remaining unclaimed `(GE-` course $\rightarrow$ `GE Elective I` and `GE Elective II`

---

## 6. Calibration Benchmark (`StudentCourseSchedules (All Results).xlsx`)

When `execution/parse_anthology.py` or `src/engine/transcriptParser.js` runs on the reference file `StudentCourseSchedules (All Results).xlsx`, it **must** produce these exact deterministic numbers:

- **Total Raw Rows Scanned:** `78`
- **Dropped On-Ground Meeting Sub-Table Noise Rows (`Course Code == NaN`):** `34`
- **Valid Course Rows Remaining:** `44`
- **Ignored Unscheduled `Future` (`Term == NaN`) Audit Rows:** `15` rows (`46.0` credits, including duplicate `CINE11000`, `CINE13000`, `CINE34000` entries)
- **Active Course Rows (`Completed` + `Transfer` + `Current`):** `29` unique courses
  - **Total Transfer (`TRANSFER_TERM` / `TR-P`) Credits:** `6.0` credits (`2` courses: `GE11006`, `HIST10100`) $\rightarrow$ *Triggers automatic `UNIV/LUL` Waiver*
  - **Total Completed Lindenwood Credits:** `68.0` credits (`23` courses across `FALL_24` through `FALL_I_26`)
  - **Total Completed Credits (Stick-Figure Position on Screen 2):** **`74.0` credits** (`6.0 TR + 68.0 LU`)
  - **Total Current (In-Progress) Credits:** **`10.0` credits** (`4` courses: `ICS42300` [3cr], `UNIV18205` [1cr], `CINE11000` [3cr], `MTH15100` [3cr])
  - **Total Earned + Enrolled Credits (End of Solid Bar on Screen 2):** **`84.0` credits** (`74.0 Completed + 10.0 Current`)
  - **Lindenwood Residency Credits (Earned + Enrolled):** **`78.0` credits** (Exceeds `30.0` credit minimum)
  - **Upper-Level (`30000+`) Credits (Earned + Enrolled):** **`30.0` credits** (`10` courses: `ICS31000`, `IIT33500`, `IIT35100`, `ICS41500`, `ICS43200`, `CINE31500`, `ICS41700`, `ICS32700`, `ICS42100`, `ICS42300` $\rightarrow$ `12.0` upper-level credits still needed to reach `42.0`)
  - **Human Diversity (`/HD`) Courses Completed:** **`2` courses / `6.0` credits** (`SOC10200` and `HIST10100` $\rightarrow$ `/HD` requirement `100%` satisfied)

---

## Learnings (2026-10-23)

- **Honors Grade Normalization (`AH`, `BH`, `CH`, `DH`):** Calibrating `execution/parse_anthology.py` across all 14 real Anthology exports in `.tmp/samples/` revealed that Honors course sections (e.g., `UNIV10100 Your Honors Story`, `ENGL15000`, `ICS32500` in `Lliam Gammon`) record grades as `AH` (`BH`, `CH`, `DH`). Added Honors grade variants to `PASSING_COMPLETED_GRADES`, `GRADE_PRIORITY`, and the Composition `C`-or-higher check in both `execution/parse_anthology.py` and `src/engine/transcriptParser.js` (`tests/test_parse_anthology.py`, `tests/engine.test.js`).
- **Blank `Term` vs. `TRANSFER_TERM` Disambiguation on Unscheduled `Future` Rows:** In Anthology exports, remaining degree-audit placeholder courses at the bottom of the sheet have `Course Status = "Future"` and `Term = NaN` (empty string). Updated `parseTermInfo()` in `src/engine/transcriptParser.js` so blank terms are marked `isBlank: true, isTransfer: false` rather than defaulting to `TR`, ensuring unscheduled `Future` rows are deterministically excluded while preserving their `Area of Study` minor tags onto surviving active attempts.
- **Zero-Dependency Python `.xlsx` Stdlib Reader:** Implemented a pure Python standard library (`zipfile` + `xml.etree.ElementTree`) `.xlsx` reader fallback alongside optional `openpyxl` in `execution/parse_anthology.py`, converting Excel serial dates (e.g., `45530` $\rightarrow$ `2024-08-26`) deterministically without requiring external binary packages.
- **Document Currency Verification & Off-Season Exemption:** Added `verifyDocumentCurrency()` and `getCurrentAcademicSemester()` in `src/engine/transcriptParser.js` to assert that uploaded Anthology spreadsheets reflect the current active semester (contain courses with state `Current` or `Scheduled` matching the active semester/year). If uploaded during Summer (May 16 – August 14) or Winter Break (December 19 – January 4), the check is automatically exempt (`isExempt: true`). If flagged as stale, a skippable advisor modal displays on Screen 1 allowing immediate override with zero workflow blocking.


