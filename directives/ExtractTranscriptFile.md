# SOP: Extraction Rules for Unofficial Transcript Records

**File Path:** `directives/ExtractTranscriptFile.md`  
**Target:** Lindenwood University Unofficial Transcripts (`.pdf`) — both **Enrollment-Based** (`792x612` landscape) and **Student-Based** (`612x792` two-column portrait) formats.  
**Execution Engine:** Deterministic client-side PDF parser (`src/engine/transcriptParser.js` using `pdfjs-dist`) and local verification script (`execution/parse_transcript_pdf.py` using `pdfminer.six`).

---

## 1. Document Format & Header Layout

Lindenwood exports two distinct Unofficial Transcript PDF layouts from Anthology. The parser **must** auto-detect the format on Page 1 by inspecting the page bounding box `(width, height)` rather than relying on the filename:

### 1.1 Format Detection & Spatial Geometry
| Property | Variant A: Enrollment-Based Transcript | Variant B: Student-Based Transcript |
| :--- | :--- | :--- |
| **Sample File** | `sub_Transcript - UnOfficial_landscape.pdf` | `sub_UnofficialTranscript - Student Based_landscape.pdf` |
| **Page Dimensions (`width × height`)** | **`792.0 × 612.0 pt`** (`width > height`, true landscape) | **`612.0 × 792.0 pt`** (`width < height`, portrait 2-column) |
| **Header Cutoff (`header_y`)** | `y1 >= 500.0 pt` | `y1 >= 665.0 pt` |
| **Footer Cutoff (`footer_y`)** | `y1 <= 55.0 pt` | `y1 <= 40.0 pt` |
| **Column Split Midpoint (`mid_x`)** | **`x0 < 395.0 pt`** (Left) / **`x0 >= 395.0 pt`** (Right) | **`x0 < 300.0 pt`** (Left) / **`x0 >= 300.0 pt`** (Right) |
| **Left Col `Description` Indentation** | `50.0 <= x0 <= 200.0 pt` (`Code` at `x0 ≈ 9.2`) | `70.0 <= x0 <= 190.0 pt` (`Code` at `x0 ≈ 43.2`) |
| **Right Col `Description` Indentation** | `435.0 <= x0 <= 590.0 pt` (`Code` at `x0 ≈ 399.9`) | `335.0 <= x0 <= 450.0 pt` (`Code` at `x0 ≈ 306.7`) |

### 1.2 Critical Spatial Reading Order (Two-Column Newspaper Layout)
- Both transcript formats place semester blocks in two independent vertical columns per page.
- **NEVER** read across the full page width (`0` to `width`) by `y`-coordinate—doing so interleaves Left-Column terms (e.g., `FALL_23`, `SPRING_24`) with Right-Column terms (e.g., `FALL_24`, `SPRING_25`).
- **Mandatory Reading Order:**
  1. Extract individual text lines/spans (`LTTextLine` in Python or `getTextContent().items` in `pdfjs-dist`) with their `(x0, y0, x1, y1)` coordinates.
  2. **Deduplicate Overlaid Text Spans:** In the **Student-Based** format, Anthology renders `Student Name`, `Student ID`, and `DOB` **twice at the exact same `(x0, y1)` coordinates** (e.g., `Fabiana Labrador` stacked twice at `x0=89.0, y1=682.7`). Before grouping into rows, drop any duplicate span where `|Δx0| < 1.0 pt`, `|Δy1| < 1.0 pt`, and `text1 == text2`.
  3. Partition body spans (`footer_y < y1 < header_y`) by `mid_x` into **Left Column** and **Right Column**.
  4. Process sequentially: **Page 1 Left Column (top-to-bottom)** $\rightarrow$ **Page 1 Right Column (top-to-bottom)** $\rightarrow$ **Page 2 Left Column (top-to-bottom)** $\rightarrow$ **Page 2 Right Column (top-to-bottom)**.
  5. Within each column, group spans into horizontal rows using a vertical tolerance of `|Δy1| <= 3.0 pt`, then sort spans within each row left-to-right by `x0`.

### 1.3 Student, Program, & Catalog Metadata Extraction
Extract the following metadata fields (processed 100% in local browser memory for Screen 2/3 display and PDF export headers):

1. **Header Bounding Area (`y1 >= header_y` on Page 1):**
   - **`student_name`:** Regex `Student:\s*([A-Za-z\s\-']+?)(?=\s+Student ID:|$)` (e.g., `"Fabiana Labrador"`).
   - **`student_id`:** Regex `Student ID:\s*(A\d{9})` (e.g., `"A003006937"`).
   - **`dob`:** Regex `DOB:\s*(\d{2}/\d{4})` (e.g., `"08/2006"`).
   - **`original_start_date`:** Regex `Original Start Date:\s*(\d{1,2}/\d{1,2}/\d{4})` (e.g., `"8/21/2023"` — present on Enrollment-Based header; also check `Start Date:` in the Page 1 Left Column enrollment block).
   - **`transcript_date`:** Regex `Date:\s*(\d{1,2}/\d{1,2}/\d{4})` (e.g., `"10/22/2026"`).
   - **`student_gpa`:** Regex `Student GPA:\s*([\d\.]+)` (e.g., `3.75`).
2. **Body & End-of-Transcript Program Metadata:**
   - **`program` (Primary Major):**
     - *Enrollment-Based:* Line starting with `Program:` at the top of Page 1 Left Column (e.g., `Program: Information Technology`).
     - *Student-Based:* Left-aligned line (`x0 < desc_min_x`) immediately below `Term: <Season Year>` (e.g., `Information Technology`).
   - **`enrollment_number` & `status` (Enrollment-Based Only):**
     - Regex `Enrollment #:\s*(\S+)\s+Status:\s*(\S+)` (e.g., `LA23063168`, `Active`).
   - **`concentrations` (Emphases, Minors, Certificates — Enrollment-Based Page 2 Footer Block):**
     - Regex `Concentration\(s\):\s*(.+)$` $\rightarrow$ split by `;` (e.g., `["Applications Development Emphasis", "Sport Management Minor"]`). Automatically maps `"Applications Development Emphasis"` to the student's Emphasis dropdown and `"Sport Management Minor"` to `[+ Add Major / Minor / Certificate]`.
   - **`catalog_year` Inference:**
     - Derived from `original_start_date` (`8/21/2023` $\rightarrow$ `2023-2024`) or the earliest chronological non-transfer `Term:` (`FALL_23` $\rightarrow$ `2023-2024`).
   - **Fields Not Present on Unofficial Transcripts:**
     - `Student Email` and `Advisor Name / Email` are not printed on Lindenwood Unofficial Transcript PDFs. Populate `Advisor Name / Email` from the logged-in faculty profile and leave `Student Email` as an optional editable field on Screen 3 before exporting the PDF.

---

## 2. Column & Field Mapping

### 2.1 Course Table Structure Inside Each Term Block
- **Enrollment-Based Column Headers:** `Course Code | Course Description | Credits Attempted | Credits Earned | Quality Points | Grade`
- **Student-Based Column Headers:** `Course | Description | Attempt | Earned | Pts | Grade`

### 2.2 Regex Pattern for Course Rows & Wrapped Title Continuation Lines
1. **Primary Course Row Pattern:**
   - Match against the joined horizontal row string:
     ```regex
     ^([A-Z]{2,5}\s*\d{4,5})\b\s*(.*?)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})(?:\s+([A-Z\+\-\*#]+))?$
     ```
   - **Group 1 (`Published Code`):** Canonicalize by stripping spaces (`CSC 10011` $\rightarrow$ `CSC10011`, `SPMGT37040` $\rightarrow$ `SPMGT37040`). Note: Transcripts always print clean `Published Code` values without `-23` suffixes.
   - **Group 2 (`Course Name` — First Line):** e.g., `Basic Concepts of Sociology (GE-` or `Criminology (GE-SocSci)`.
   - **Group 3 (`Att` — Credits Attempted):** Float (e.g., `3.00`, `4.00`, `6.00`, or `0.00` for in-progress courses).
   - **Group 4 (`Earn` — Credits Earned):** Float (e.g., `3.00`, `4.00`, `6.00`, or `0.00`).
   - **Group 5 (`Pts` — Quality Points):** Float (e.g., `12.00`, `9.00`, `0.00`).
   - **Group 6 (`Letter Grade` — Optional):** Present for completed/graded courses (`A`, `B`, `C`, `D`, `F`, `W`, `P`, `TR-P`, etc.); **absent (`None`)** on in-progress `Current` courses.
2. **Wrapped Course Description Continuation Rule (CRITICAL):**
   - Long course descriptions wrap onto 1–2 subsequent lines below the course row (e.g., `EPP12500 Advanced Speaking and` / `Listening for Multilingual` / `Students`; `ENGL20101 Modern World Literature (GE-` / `HC:Lit/HD)`; `IIT48100 Project Management in` / `Information Technology`).
   - **Disambiguating `"Information Technology"` (Wrapped Title vs. Program Header):**
     - In the Student-Based transcript, `"Information Technology"` appears both as a **Program Sub-Header** under `Term: Spring 25` (`x0 = 308.7 pt`, aligned with the `Course` code column) AND as the **second wrapped line** of `IIT48100 Project Management in Information Technology` (`x0 = 348.9 pt`, indented to the `Description` column).
     - **Deterministic Rule:** A non-course line following an active `last_course` is appended to `last_course["Course Name"]` **if and only if** `desc_min_x <= first_span_x0 <= desc_max_x`. If `last_course["Course Name"]` ends with a hyphen `-` (such as `(GE-`), concatenate directly without a space (`(GE-` + `HC:Lit/HD)` $\rightarrow$ `(GE-HC:Lit/HD)`); otherwise join with a single space.
   - **Typo Normalization on GE Tags:** Normalize minor catalog punctuation typos in parenthetical tags, such as `GE(-HC:Phl)` or `(GE-HC: Phi)` or `(GE-HC: Phl)` $\rightarrow$ `(GE-HC:Phl)`.

### 2.3 Term / Semester Naming Conventions on Transcripts vs. Anthology `.xlsx`
- **How Terms Appear on Transcripts:**
  - *Enrollment-Based:* `Term: FALL_23           Fall 23  8/21/2023 - 12/08/2023`
  - *Student-Based:* `Term: Fall 23`
  - Normalize both via `re.search(r"Term:\s*([A-Za-z]+\s*_?\s*\d{2})", row_str)` $\rightarrow$ uppercase with underscore: `FALL_23`, `SPRING_24`, `FALL_24`, `SPRING_25`, `FALL_25`, `SPRING_26`, `SUMMER_26`, `FALL_26`.
- **Important Difference from Anthology `.xlsx` Exports:**
  - Unofficial Transcript PDFs group all courses taken in a semester under the parent term (`FALL_26`) without printing `8W` Session I (`FALL_I_26_8W`), `8W` Session II (`FALL_II_26_8W`), or `16W` (`FALL_26_16W`), and do not print `Delivery Method` (`Online` vs. `On Ground`).
  - Therefore, **do NOT overwrite** specific 8-week session offering flags or modality flags in the Shared Master Database when parsing a `.pdf` transcript (restrict passive 2-year session/modality harvesting to Anthology `.csv`/`.xlsx` exports).

---

## 3. Grade Normalization, In-Progress (`0.00`) Detection & Classification

### 3.1 Resolving `0.00` Attempted / `0.00` Earned In-Progress Courses
- In an active semester (such as `FALL_26` on a transcript printed `10/22/2026`), courses completed in Session I (`FALL_I_26_8W`, e.g., `IIT47700` and `IIT47900`) already display `3.00  3.00  12.00  A`.
- Courses still in progress in `FALL_26_16W` (`SPMGT37040`, `PHRL21001`) or `FALL_II_26_8W` (`SPMGT37060`, `IIT34020`) display **`0.00  0.00  0.00`** with **no `Letter Grade`**.
- **Deterministic Credit Inference for `Current` (`0.00 / No Grade`) Rows:**
  1. Classify any transcript course row where `Att == 0.00`, `Earn == 0.00`, and `Letter Grade is None` (or `IP`/`PR`) as **`Course Status = "Current"`**.
  2. Look up the course's `credits` in `masterDatabase.json` by `Published Code`.
  3. If the course is not in `masterDatabase.json` (e.g., a minor course like `SPMGT37040`), infer credits deterministically:
     - `1.0` credit if `Published Code` starts with `UNIV1` or ends with a 1-credit lab code (`32301`, `32401`, `32501`, `32601`).
     - `5.0` credits if `Published Code` is `ICS32300`, `ICS32400`, `ICS32500`, or `ICS32600`.
     - `4.0` credits if `Course Name` contains `NatSciLec/Lab` (e.g., `BSC10000`, `CHM10000`).
     - **`3.0` credits** for all other standard courses.

### 3.2 Grade & Status Classification Rules
1. **`Complete` (Passed Earned Credit):**
   - `Letter Grade` (after stripping retake/footnote symbols `*`, `**`, `R*`, `#`, `+`) is in `['A', 'B', 'C', 'D', 'P', 'CR']` AND `Earn > 0`.
   - **Composition `C`-or-Higher Gatekeeper:** `ENGL15000`, `EPP15000`, and `ENGL17000` require a grade of `A`, `B`, `C`, or `TR-P` to satisfy Composition I / II. A grade of `D` counts toward the 120-credit total and general electives, but leaves the Composition bucket unfulfilled.
2. **`Transfer (TR)`:**
   - Course appears under a Transfer Credit block header OR `Letter Grade` starts with `TR` (`TR`, `TR-P`, `TR-A`, `TR-B`, `TR-C`).
   - Counts toward the 120-credit total and waives `UNIV 10100/10101/10102` when `Total Transfer Credits > 0`, but does **not** count toward the 30-credit Lindenwood Residency or 24-credit Final Residency thresholds.
3. **`Current` (In-Progress Active Credit):**
   - `Att == 0.00`, `Earn == 0.00`, and `Letter Grade is None` (or `IP`/`PR`) in the current/latest term.
   - Counts toward **Enrolled Credits** (the solid extension bar on Screen 2) and satisfies prerequisites for future terms.
4. **`Scheduled` (Future Term on Transcript):**
   - Same `0.00 / No Grade` signature located under a `Term:` header chronologically *after* the current semester. Locked (`🔒`) as a future anchor on Screen 3.
5. **`Excluded` (Failed, Withdrawn, Unearned, Repeat, or Sub-10000):**
   - `Letter Grade` in `['F', 'W', 'WF', 'AF', 'INC', 'I', 'AU', 'NC']` or `Earn == 0.00` when `Letter Grade` is present.
   - Any preparatory course where the numeric part of `Published Code` is `< 10000` (`01000–09999`). Note: `10000+` courses—including `EPP10100` (3cr), `EPP10500` (6cr), `EPP11000` (3cr), `EPP12500` (3cr), `UNIV10100` (1cr), and `MTH11000` (3cr)—are valid graduation-bearing credits and **must be included** in the 120-credit sum.

---

## 4. Retake & Deduplication Rules

- **Transcript Retake Markers:** Lindenwood transcripts append `**` (`Indicates Retaken Course`) or `R*` (`Indicates Retaken Override`) to repeated course rows, and set `Credits Earned = 0.00` on superseded attempts.
- **Canonical Deduplication Rule:**
  - Group all extracted courses by canonical `Published Code`.
  - If a `Published Code` appears multiple times, retain **only the single instance** with the highest passing grade (`A` > `B` > `C` > `P`/`CR`/`TR-P` > `D` > `Current`), ensuring credits for a unique course ID are **never summed twice**.
  - Log all superseded/repeated attempts in the **Excluded Courses List** on Screen 2 with reason `Excluded: Repeat / Retake`.

---

## 5. Transfer & Special Credit Blocks

- **Transfer Institution Blocks:** On transcripts with transfer history, transfer courses appear either under a dedicated `Transfer Credits` / institution header or with `Grade = TR` / `TR-P` and `0.00` Quality Points.
- **Synthetic GE Codes (`GE11xxx`) & Equivalent Codes:**
  - Transfer courses mapped to a specific Lindenwood course (`HIST10100`, `ENGL15000`) carry that `Published Code` and inline `(GE-...` tag.
  - Transfer courses mapped to a general GE bucket carry synthetic codes (`GE11006 GE-Human Culture: Literature (GE-HC:Lit)`) and are claimed by the Waterfall Audit via their parenthetical `(GE-...` identifier phrase.
- **Experiential Learning / Industry Certifications / AP Credit:**
  - Denoted by `CR` or `P` grades with `Earned > 0.00` and `Quality Points = 0.00`. If a student has experiential learning credit or transfer credit (`>= C`) for a Cisco lecture course (`ICS32300`, `ICS32400`, `ICS32500`), automatically exempt the corresponding 1-credit concurrent lab (`ICS32301`, `ICS32401`, `ICS32501`).

---

## 6. Three-Way Verification Benchmark (Fabiana Labrador)

When the extraction engine runs on **Variant A** (`sub_Transcript - UnOfficial_landscape.pdf`), **Variant B** (`sub_UnofficialTranscript - Student Based_landscape.pdf`), and the paired **Anthology Export** (`StudentCourseSchedules (All Results)_2.xlsx`), all three files **must** reconcile to these exact deterministic numbers:

| Audit Metric | Variant A: Enrollment-Based PDF | Variant B: Student-Based PDF | Anthology `.xlsx` Export | Reconciliation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Student Name & ID** | `Fabiana Labrador` (`A003006937`) | `Fabiana Labrador` (`A003006937`) | *(Not in `.xlsx` cells)* | **Exact Match** |
| **DOB / Start Date** | `08/2006` / `8/21/2023` (`2023-2024`) | `08/2006` / `Fall 23` (`2023-2024`) | Earliest Term: `FALL_23_16W` | **Exact Match** |
| **Primary Program** | `Information Technology` | `Information Technology` | `INTECHBS/Information Technology BS` | **Exact Match** |
| **Emphasis & Minor** | `Applications Development Emphasis`; `Sport Management Minor` | *(Inferred via courses or selector)* | `Applications Development Emphasis`; `Sport Management Minor` | **Exact Match** |
| **Total Active Courses** | **`40` courses** | **`40` courses** | **`40` courses** *(after dropping 73 noise rows & 22 unscheduled `Future` rows)* | **100% Identical Set** |
| **Completed Courses & Credits** | **`36` courses / `110.0` cr** | **`36` courses / `110.0` cr** | **`36` courses / `110.0` cr** | **100% Exact Match** |
| **Current (In-Progress) Courses** | **`4` courses / `12.0` cr** (`IIT34020`, `PHRL21001`, `SPMGT37040`, `SPMGT37060`) | **`4` courses / `12.0` cr** (`IIT34020`, `PHRL21001`, `SPMGT37040`, `SPMGT37060`) | **`4` courses / `12.0` cr** (`IIT34020`, `PHRL21001`, `SPMGT37040`, `SPMGT37060`) | **100% Exact Match** |
| **Total Earned + Enrolled Credits** | **`122.0` credits** | **`122.0` credits** | **`122.0` credits** | **100% Exact Match** |
| **Lindenwood Residency Credits** | **`122.0` cr** (`110.0` Earned + `12.0` Curr) | **`122.0` cr** (`110.0` Earned + `12.0` Curr) | **`122.0` cr** (`0.0` Transfer) | **100% Exact Match** |
| **Upper-Level (`30000+`) Credits** | **`36.0` cr Earned + `9.0` cr Current = `45.0` cr** (`15` courses) | **`36.0` cr Earned + `9.0` cr Current = `45.0` cr** (`15` courses) | **`36.0` cr Earned + `9.0` cr Current = `45.0` cr** (`15` courses) | **100% Exact Match** *(Exceeds 42cr floor)* |
| **Human Diversity (`/HD`)** | **`2` courses / `6.0` cr** (`SOC10200`, `ENGL20101`) | **`2` courses / `6.0` cr** (`SOC10200`, `ENGL20101`) | **`2` courses / `6.0` cr** (`SOC10200`, `ENGL20101`) | **100% Exact Match** |
| **Cumulative GPA** | **`3.75`** (`413.00` Quality Points) | **`3.75`** (`413.00` Quality Points) | **`3.75`** | **100% Exact Match** |
| **Remaining IT-App Dev Major Courses** | `3` courses (`9.0` cr): `ICS43200`, `IIT37800`, `IIT47800`, `IIT48900` *(note: `CSC10011` + `IIT21500` completed)* | Same `4` courses (`12.0` cr): `ICS43200`, `IIT37800`, `IIT47800`, `IIT48900` | Same `4` courses (`12.0` cr): `ICS43200`, `IIT37800`, `IIT47800`, `IIT48900` | **100% Exact Match** |

---

## Learnings (2026-10-23)

- **5-Letter Department Code Support (`SPMGT`):** `Sport Management Minor` courses use the 5-letter department code `SPMGT` (`SPMGT27020`, `SPMGT37040`, `SPMGT37060`). Both `src/engine/transcriptParser.js` and `execution/parse_anthology.py` must use `[A-Z]{2,5}\s*\d{4,5}[A-Z]?` so 5-letter department codes are parsed as canonical course IDs rather than dropped by the noise filter.
- **`pdfjs-dist` Baseline Coordinate (`y0`) vs `pdfminer.six` Top Coordinate (`y1`):** In `pdfjs-dist`, `item.transform[5]` represents the text baseline `y0`. On Student-Based Page 1 (`612x792`), the top body line (`Dean's Honor Roll Fall 2024`) has `y0 = 663.0 pt, y1 = 671.9 pt`, while the lowest header line (`Student: Fabiana Labrador`) has `y0 = 676.8 pt`. Filtering header spans by `y0 >= 665.0` (Student-Based) and `y0 >= 500.0` (Enrollment-Based) cleanly separates the header block from the two-column body.
- **`Attempted/Earned` Sub-Header Exclusion in Student-Based Layout:** In Student-Based transcripts, the `Attempted/Earned` sub-header sits at `x0 = 181.4 pt` (Left Col) and `x0 = 444.9 pt` (Right Col). Setting `descMaxX` to `180.0 pt` (Left) and `440.0 pt` (Right) and matching `Attempted/Earned` as a structural terminator prevents it from being appended to the final course description of a semester.
- **Running `Cum GPA:` in Student-Based Layout:** Unlike Enrollment-Based transcripts (which print the final `Student GPA:` in the Page 1 Header), Student-Based transcripts print a running `Cum GPA:` after every semester block in chronological order (`3.31` in Fall 23 $\rightarrow$ `3.75` in Fall 26). Updating `metadata.student_gpa` on each subsequent `Cum GPA:` (and final `Undergraduat(e)` summary row) ensures the final cumulative GPA (`3.75`) is captured.
- **Transcript Currency Verification & Dual-Variant Validation:** Implemented `verifyDocumentCurrency()` in `src/engine/transcriptParser.js` tailored to both PDF variants:
  - *Enrollment-Based (`792 × 612 pt` landscape):* Validates presence of in-progress courses registered for `0.00` attempted / `0.00` earned credits under the current semester term.
  - *Student-Based (`612 × 792 pt` portrait):* Because Anthology Student-Based exports omit in-progress courses by design, extracts the printed header export date (`Date: MM/DD/YYYY`) and validates that it falls within or after the active semester window.
  - *Off-Season Exemption & Skippable Advisor Modal:* Bypasses validation during Summer (May 16 – August 14) and Winter Break (December 19 – January 4), and renders a skippable dialog on Screen 1 allowing advisors to override stale files with one click.

## Learnings (2026-10-26)

- **In-Stream Course Re-Ordering in `extractSpatialTranscriptFromPdf`:** Course rows extracted spatially must be flushed directly into `reconstructedLines` in-stream under their respective `Term:` headers (`flushLastCourse()`) before term/non-course transitions. Pushing courses at the end of extraction caused downstream text parsers to attribute all courses to the final document term header (`FALL_26`), which broke cross-document deduplication matching between Anthology (`.xlsx`) and Transcript (`.pdf`) records.
- **Transfer Placeholder Invariants on Real Student Data (Jalen Smith):** Dedicated Vitest suite `tests/jalenSmithIntake.test.js` verified that real student files with multiple transfer placeholders (such as `ELECT 10000 TR-C 2.0cr` and `ELECT 10000 TR-B 3.0cr`) retain independent identities without repeat/retake exclusions, preserving 11.0 total transfer credits across individual file intake, combined merging, and waterfall degree audits.


