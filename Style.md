# Lindenwood University Degree Planner — Visual & Editorial Style Guide (`Style.md`)

> **Authority & Alignment:** This style guide incorporates the official **Lindenwood University Brand Identity Guidelines (Updated September 2026)** alongside custom UI/UX tokens engineered specifically for the **Lindenwood Deterministic Degree Planner**. Every screen (`Screen 0` through `Screen 3`) and the exported **Student Degree Plan (`.pdf`)** must strictly adhere to these specifications.

---

## 1. Core Brand Color Palette & WCAG Digital Accessibility

Lindenwood University's visual identity is anchored by **Gold, Black, and White**. Never approximate these hex values or substitute unapproved brand colors.

### 1.1 Official Brand Colors (Page 36 & Page 54 of LU Brand Guidelines)

| Token Name | CSS Variable | Hex | RGB | Official Usage Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Lindenwood Gold (Standard / Print)** | `--lu-gold-standard` | `#B5A36A` | `182, 162, 105` | Primary brand accent for borders, decorative bars, active highlights, icons, dark-mode text highlights, and **all exported `.pdf` print headers/accents**. **NEVER place white text directly on `#B5A36A` on digital screens.** |
| **Digital Accessibility Gold (Web UI)** | `--lu-gold-accessible` | `#857542` | `133, 117, 66` | **MANDATORY FOR DIGITAL UI:** Use whenever **white text (`#FFFFFF`) appears on top of a Gold button, badge, banner, or interactive control** to satisfy WCAG AA/AAA contrast compliance. |
| **Lindenwood Black (Digital)** | `--lu-black` | `#000000` | `0, 0, 0` | Primary anchor for top navigation headers, major headlines, high-contrast buttons, and primary text. *(Note: Never use print Rich Black CMYK conversions in digital CSS).* |
| **Lindenwood White** | `--lu-white` | `#FFFFFF` | `255, 255, 255` | Primary card surface, page background, and reversed text on `--lu-black` and `--lu-gold-accessible` surfaces. |

### 1.2 Approved Neutral Tints (`0%–100%` of Black & Gold)
Per Page 36 of the Brand Guidelines, tints of Lindenwood Gold and Black are approved for structural hierarchy:
- **App Canvas Background:** `--lu-bg-canvas: #F8F7F4` (Subtle $4\%$ warm gold/neutral tint to give white cards crisp elevation)
- **Gold Tint Surface (Callouts & Pending Transfers):** `--lu-gold-tint-10: #F7F5EE` (Background) paired with `--lu-gold-standard: #B5A36A` border
- **Gold Tint Hover:** `--lu-gold-tint-20: #EFEBD9`
- **Primary Body Text:** `--lu-text-primary: #111111`
- **Secondary / Metadata Text:** `--lu-text-secondary: #4B5563`
- **Muted / Historical Text (Past Semesters):** `--lu-text-muted: #6B7280`
- **Past Semester Surface:** `--lu-bg-past: #F3F4F6`
- **Border / Hairline Divider:** `--lu-border-subtle: #E5E7EB`

---

## 2. Tactile Weight Course Flexibility Color Scale (Screen 3 & PDF Export)

Course cards on the Interactive Degree Plan Board (`Screen 3`) and in the exported `.pdf` use a **Tactile Weight Color System** so students and advisors immediately perceive how easy or difficult it is to move a course to a different semester:

| Flexibility Tier | Visual Metaphor | Card Background | Left Bar & Border | Badge / Text Color | Deterministic Trigger Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Easily Movable** | *Light / Airy (Sky Blue / Cyan)* | `#F0F9FF` | `#0284C7` | `#0369A1` | Course/bucket is offered in almost every session (including GE placeholders and General Electives) **AND** no remaining required courses depend on it as a prerequisite. |
| **2. Movable with Effort** | *Moderate (Warm Amber / Ochre)* | `#FFFBEB` | `#D97706` | `#92400E` | Moving this course does not delay graduation by itself, **BUT** it is a prerequisite for another remaining course **OR** is only offered in 2 sessions per academic year. |
| **3. Not Really Movable** | *Heavy / Fixed (Charcoal Gray / Deep Slate)* | `#1E293B` (or `#F1F5F9` with `#1E293B` header bar) | `#0F172A` | `#0F172A` (with `#FFFFFF` on `#1E293B` pill) | Moving this course delays the graduation date, **OR** it is offered only 1 time per year (or Odd/Even years only), **OR** it is the Capstone (`ICS 48900` / `IIT 48900`), **OR** it is locked (`🔒`). |

### 2.1 Conflict & Override States (When Dragging a Course Card)
- **Invalid Session / Prerequisite Conflict Highlight:**
  - Card border pulses `#DC2626` (Crimson Red), background shifts to `#FEF2F2`, and a **Conflict Notification Dot** (`#DC2626` badge with `!`) appears in the top-right corner of the card.
  - Hovering over the dot displays a high-contrast tooltip explaining the exact deterministic rule violated (e.g., *"Not offered in SP-II"* or *"Prerequisite ICS 32700 not completed prior to this session"*) with action buttons to **Override via Shared DB (`* Tentative`)** or **Flag as Policy Exception (`PE`)**.

---

## 3. Typography System (Pages 37–38 of LU Brand Guidelines)

Lindenwood's modern typographic voice pairs **`Obviously`** (display headers) with **`Trade Gothic` / `Trade Gothic Next`** (subheaders, UI controls, tables, and body copy), using **`Arial`** as the official universal fallback when Adobe Fonts are unavailable.

### 3.1 Font Stacks (CSS Variables)
```css
:root {
  /* Display Headers, Hero Titles, Milestone Flags */
  --font-display: "Obviously", "Trade Gothic Next", "Trade Gothic", Arial, sans-serif;

  /* Subheaders, UI Controls, Course Cards, Tables, Body Copy */
  --font-sans: "Trade Gothic Next", "Trade Gothic", Arial, -apple-system, BlinkMacSystemFont, sans-serif;

  /* Course Codes, Credit Counts, Audit Ledgers (Tabular Numerals) */
  --font-mono: "JetBrains Mono", "Consolas", monospace;
}
```
- **Prohibited Legacy Fonts:** Never use `Bembo Std` or `Great Vibes` in the web application or PDF schedule output (those are restricted to ceremonial diplomas and legacy materials per Page 38).
- **Tabular Numbers:** Always apply `font-variant-numeric: tabular-nums;` to credit columns, mathematical audit sums, and 6-digit verification code inputs so digits align vertically.

---

## 4. Logos, Identity & The Signature $15^\circ$ Shear (Pages 9–42)

### 4.1 Logo Usage vs. LU Asset Den
- **Stock Photography Not Required:** This application is a high-density academic advising tool. Do **not** clutter the interface with decorative stock photos.
- **Official Logo Placement (Optional Asset Den Drop-in + Clean Code Fallback):**
  - The top navigation bar (`#000000` background) displays the **Primary Institutional Logo (Reversed White & Gold)** on desktop (`min-width: 160px`) and the **Secondary Horizontal Logo** or **"LU" Icon Mark** (`min 50x50px` paired with `"Lindenwood University"` text nearby) on mobile.
  - Place official SVG/PNG files from **LU Asset Den** in `public/assets/logos/` (`lu-primary-reversed.svg`, `lu-primary-fullcolor.svg`, `lu-icon.svg`). If the asset folder is empty during initial local development, render a crisp CSS/SVG geometric wordmark using `--font-display`, `#FFFFFF`, `#B5A36A`, and the official $15^\circ$ shear rectangle.
- **Strict Logo Restrictions:**
  - Respect the **Clear Space Requirement** (padding around the logo must be at least the capital height of `"UNIVERSITY"`).
  - Never crop, stretch, tilt, or apply drop shadows to any Lindenwood logo.
  - **Never use the University Seal or Sibley Crest** anywhere in the application or exported PDF.

### 4.2 Signature $15^\circ$ Shear Element (`SHEAR 15°` — Pages 37, 42, 47)
The $15^\circ$ shear angle is a defining visual signature of the 2026 Lindenwood Brand Guidelines, symbolizing forward momentum:
- **Where to Apply `transform: skewX(-15deg)` (with inner text un-skewed `skewX(15deg)`):**
  - Primary section tags / phase badges in headers.
  - The **Graduation Flag** at the end of the `Screen 2` credit number line.
  - Active semester status pills and the *"Discover Your Roar!"* footer accent badge.
- **Where NOT to Apply Shear:** Never skew data tables, course cards, form inputs, or dropdown menus—keep all functional workspace elements strictly orthogonal ($0^\circ$) for effortless scanning.

---

## 5. Screen-by-Screen UI Layout & Component Specifications

### 5.1 Global Navigation Header & Footer (Required by Page 54)
- **Top Header Bar (`#000000` background, `64px` height, bottom `3px solid #B5A36A` border):**
  - **Left:** Lindenwood University Logo + Application Title (`Academic Degree Planner`).
  - **Center-Right:** Mode Switcher / Dropdown (`Advisor Workspace` [Default], `Upload Bingo Sheet`, `View/Edit Shared Master Database`).
  - **Far Right (Faculty Profile Badge):** Auto-scraped Circular Headshot (`40px`, `#B5A36A` ring), **Full Name** (`Matthias Wood`), **Position & Department** (`Senior Instructor, Mathematics`).
- **Global Footer:** Minimal dark bar (`#000000` text on `#F3F4F6` or `#FFFFFF` text on `#000000`) displaying:
  `Lindenwood University | 209 S. Kingshighway St., St. Charles, MO 63301 | www.lindenwood.edu | 100% Client-Side FERPA Compliant`

### 5.2 Screen 0: Faculty Login & 6-Digit Verification Modal
- Centered card (`max-width: 460px`, white surface, top `4px solid #B5A36A` accent bar).
- **Split Username Input:** Left input box for username prefix (placeholder `mwood`) seamlessly joined to a fixed right addon badge `@lindenwood.edu` (`#F3F4F6` background, bold `#111111` text).
- **Primary CTA Button:** Background `--lu-gold-accessible` (`#857542`), text `#FFFFFF`, hover `#6E6035`.
- **Rate-Limit Countdown State:** If triggered within the 5-minute cooldown window, disable the button and show a calm timer badge.
- **6-Digit OTP Modal:** 6 individual large numeric boxes (`48px x 56px`) supporting single-paste auto-fill across all 6 boxes.
- **Reassurance Callout Box:** Soft gold tint (`#F7F5EE`), left border `4px solid #857542`, explaining the one-time 6-digit verification, persistent browser login cookie, and local-memory FERPA guarantee.

### 5.3 Screen 1: Student Intake & Strict Single-File Dropzones
- **Two-Column Card Layout:** `Option A: Returning Student Reload` vs. `Option B: New Student Audit`.
- **Strict Single-File Dropzones:**
  - Every upload box accepts **at most 1 file** (`multiple={false}`) and visually displays its strict extension lock badge:
    - Returning Plan Reload Dropzone: **`.pdf` only**
    - Anthology All-Courses Export Dropzone: **`.csv` or `.xlsx` only**
    - Unofficial Transcript Dropzone: **`.pdf` only**
    - Departmental Bingo Sheet / Degree Plan Dropzone: **`.xlsx` or `.csv` only**
  - **Embedded Scribe SOP Button:** Positioned directly inside the header of the Anthology and Transcript upload cards (`🎬 Watch / View Scribe Guide: How to Download Student Files`).
- **Control Ordering (Option B):**
  1. Mandatory Student Record Upload (Anthology `.csv`/`.xlsx` OR Unofficial Transcript `.pdf`).
  2. **Catalog Year Dropdown $\rightarrow$ Degree / Emphasis Dropdown $\rightarrow$ `[+ Add Major / Minor / Certificate]` Button** *(placed strictly ABOVE the optional Bingo Sheet dropzone)*.
  3. Optional Bingo Sheet Dropzone (`.xlsx` / `.csv`).
  4. Scheduling Constraints (Start Semester, Modality Preference, Summer Availability + Conditional Summer Credit Cap, and the 3 Linked Pacing Dropdowns).

### 5.4 Screen 2: Interactive Audit & "Race to the Graduation Flag"
- **Top Card — Race to the Graduation Flag:**
  - Full-width horizontal progress track (`height: 28px`, rounded pill) running from `0` to `120` (or dynamic target $>120$).
  - **Completed Credits Segment:** Solid `--lu-gold-accessible` (`#857542`) fill with an SVG **Stick-Figure Student Avatar** standing directly above the exact `Completed Credits` coordinate with a bold numeric callout pill.
  - **Enrolled Credits Segment (`In-Progress` + `Scheduled`):** Solid `--lu-gold-standard` (`#B5A36A`) striped/hatched extension bar reaching forward from the stick figure.
  - **Graduation Flag:** Positioned at the `120+` target mark using the $15^\circ$ sheared gold/black pennant flag.
  - **Structured Policy Checklist Grid (Below Track):**
    - Bullet/Row 1: `Total Earned + Enrolled Credits` vs. `120+ Target` (with breakdown of `Transfer (TR) Credits` and `UNIV/LUL Waiver` badge).
    - Bullet/Row 2: `Upper-Level (30000+) Credits (Earned + Enrolled)` vs. `42-Credit Minimum`.
    - Bullet/Row 3: `Credits at Lindenwood (Earned + Enrolled)` vs. `30-Credit Residency Minimum` & `Final 24-Credit Residency Check`.
    - Bullet/Row 4: `Human Diversity (/HD) Requirement` (`2 Courses / 6 Credits`) & `Composition C-or-Higher Gatekeeper` (`ENGL 15000` & `ENGL 17000`).
    - **Bullet/Row 5 (Dedicated Row):** **`Excluded Courses Ledger`** — Distinct collapsible/visible row listing every excluded course code, title, grade, and exact reason (`AF`, `F`, `W`, `Repeat`, `Sub-10000`).

### 5.5 Screen 3: 3-Zone Visual Schedule Board & Course Cards
- **Zone 1 — Past Completed Semesters (Top):**
  - Compact multi-column strip above a solid `2px solid #D1D5DB` horizontal divider line.
  - Styled in `--lu-bg-past` (`#F3F4F6`), `--lu-text-muted` (`#6B7280`), small text (`0.75rem / 12px`), `pointer-events: none` (non-interactive record-keeping).
- **Zone 2 — Current Active Semester & Highlighted Pending Incoming Transfers (Middle Band):**
  - Bold callout banner (`background: #F7F5EE`, `border: 2px solid #B5A36A`) displaying any **`+ Incoming Transfer Placeholders`** (e.g., `TR Pending: COM 11000 SLU`) alongside current in-progress courses.
- **Zone 3 — Future Interactive Degree Plan Grid (Bottom):**
  - **Academic Year Block:**
    - **Left Column (`48%` width):** `Fall [Year]` containing sub-lanes for `FA-I (8wk)`, `FA-II (8wk)`, and `Fall (16wk)`.
    - **Right Column (`48%` width):** `Spring [Year+1]` containing sub-lanes for `SP-I (8wk)`, `SP-II (8wk)`, and `Spring (16wk)`.
    - **Centered Below (`60%` width, centered):** `Summer [Year+1]` (`SU 8wk`). Renders as a sleek collapsed bar (`44px` height) when `No Summer` is selected/empty, expanding automatically if a course is dragged into it or forced (e.g., `IIT 45200`).
- **Course Card Anatomy:**
  - Left border (`6px solid`) and surface tinted per the **Tactile Weight Flexibility Scale** (Sky Blue / Warm Amber / Deep Slate).
  - **Top Row:** Category Badge (`GE`, `M`, `m`, `Em`, `E`) + `Department & Code` (`MTH 24100`) + `Credits` (`3cr`) + `🔒 Lock Toggle` + `* Tentative` badge (if applicable).
  - **Middle Row:** `Course Title` (bold, clickable to open the **Course Inspector Slide-Over Drawer**).
  - **Bottom Metadata Row (`11px`):** `Offered:` (`FA-I, SP-II`, etc.) | `Pre:` (`MTH 15100`) | `Co:` (`None`).
- **Semester Footer — Registration Opening Date & Reorderable Notes List:**
  - **Registration Opening Callout:** Subtle banner directly below each future semester's course lanes:
    `📅 Registration opens Monday, October 26, for Juniors (based on [X] completed credits prior to registration).`
  - **`[+ Note]` Reorderable List:**
    - Supports both **Auto-Generated Notes** (`Application for Degree Form` deadline, `Petition for Academic Course Overload` + tuition warning, `Summer Per-Credit Tuition Notice`, `Needs PE`) and **Custom Advisor/Student Notes**.
    - Every note item includes a **`⠿` Drag-to-Reorder Handle** (click and hold), an **`✏️ Edit` Icon**, and a **`🗑️ Delete` Icon**.

---

## 6. Writing & Editorial Style Rules (Pages 63–66 of LU Brand Guidelines)

All UI labels, automated alerts, registration notices, and exported PDF text **must** follow official Lindenwood University Editorial Style:

1. **Dates (Strict Deviation from AP Style — Page 65):**
   - **NEVER abbreviate months.** Always spell out all months in full (`January`, `February`, `March`, `April`, `May`, `June`, `July`, `August`, `September`, `October`, `November`, `December`).
   - Format specific dates as: `[Day of Week], [Full Month] [Arabic Number without st/nd/rd/th]` (e.g., write **`Monday, October 26`**, never `Oct. 26` or `October 26th`).
   - Graduation Application Deadlines must read:
     - **March Graduation:** `January 15` of the same year
     - **May Graduation:** `February 1` of the same year
     - **August Graduation:** `June 1` of the same year
     - **October Graduation:** `September 15` of the same year
     - **December Graduation:** `September 15` of the same year
2. **Semesters (Page 66):**
   - Capitalize when paired with a year: **`Fall 2026`**, **`Spring 2027`**, **`Summer 2027`**.
   - Lowercase when used generically without a year: `fall semester`, `spring semester`, `summer semester`.
3. **Academic Colleges, Departments & Degrees (Pages 64–65):**
   - Always use the **Oxford comma** and spell out the word **`and`**—**never use an ampersand (`&`)** in college or department names (e.g., `College of Science, Technology, and Health`, abbreviated `CSTH` on second reference).
   - Degree abbreviations use no periods (`BS`, `BA`, `MA`, `MBA`).
4. **Concise Tuition & Overload Auto-Note Copy:**
   - **Summer Tuition Auto-Note:** *"Summer Tuition Notice: Summer courses are billed per credit hour separately from standard fall/spring flat-rate tuition and may incur additional charges."*
   - **Overload (>18 Credits) Auto-Note:** *"Course Overload Notice: Enrolling in more than 18 credits requires a signed Petition for Academic Course Overload and incurs an additional per-credit hour charge above 18 credits."*

---

## 7. Exported Student Degree Plan (`.pdf`) Styling Rules

The `.pdf` export is the single official takeaway document for students and advisors:
- **Header Block:** Uses official Full-Color Lindenwood University Logo (`#B5A36A` and `#000000` on white paper background), paired with a structured 2-column metadata grid:
  - **Left Column (Student):** `Student Name`, `Student ID / Account #`, `Lindenwood Email`, `Degree(s) & Emphasis Seeking`, `Catalog Year`, `Projected Conferral Term` *(renders clean underline blanks if any student field was not present in the transcript)*.
  - **Right Column (Advisor):** `Advisor Name`, `Title & Department`, `Advisor Email`, `Date Generated`.
- **Visual Fidelity:** Preserves the **Tactile Weight Flexibility Color Badges** (Sky Blue, Warm Amber, Deep Slate), Category Icons (`GE`, `M`, `Em`, `m`, `E`), Registration Opening Dates, and the ordered Semester Notes list (`Application for Degree Form`, `Overload Petition`, `PE` reminders, and custom notes).
- **Embedded State Metadata:** Embeds the serialized JSON project state inside the PDF's custom metadata dictionary (`Info` / XMP `LindenwoodDegreePlanState`) so the exact `.pdf` file can be dragged back into `Screen 1 (Option A)` on future advising visits.