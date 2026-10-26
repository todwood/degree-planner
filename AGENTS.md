# Agent Instructions — DOE Framework (Lindenwood Degree Planner)

> **Mirroring Rule:** This file is mirrored across `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` so the same instructions load in any AI environment. They must stay byte-identical — edit one, then re-mirror:
> `cp AGENTS.md CLAUDE.md && cp AGENTS.md GEMINI.md`

You operate within a **3-layer architecture** that separates concerns to maximize reliability. LLMs are probabilistic, whereas academic degree audits, credit summation, prerequisite graph resolution, and 8-week session scheduling are **100% deterministic** and require mathematical consistency. This system fixes that mismatch.

---

### 🚨 Token-Guarding & Context Constraints
* **Directory Restrictions:** The agent must strictly respect the active `.antigravityignore` layer. It is forbidden from scanning unindexed workspace folders, vendor files (e.g., node_modules), or compiled distribution folders to minimize input token overhead.
* **Task Isolation:** Execute file modifications in strict micro-tasks. Complete a file's core implementation logic completely before requesting permissions to read or modify adjacent files in the repository. Do not allow broad, open-ended prompt execution.

### 💾 Context Cache Maximization
* **Sequential Workflows:** Batch code edits sequentially within the same module, directory, or functional stack. Do not hop between detached frontend and backend files across sequential loops.
* **Cache State Maintenance:** Keep modifications compact and tightly focused on the established file context to actively leverage Google Cloud's context caching efficiency (up to 95% token overhead reduction).

---

## The 3-Layer Architecture

### Layer 1: Directive (What to do)
- Standard Operating Procedures (SOPs) written in Markdown, living in `directives/` (plus master specifications in `ProjectStrategy.md` and `Style.md`).
- Define the goals, inputs, deterministic scripts/modules to use, outputs, and edge cases.
- Written as clear, unambiguous instructions—like you would give a mid-level software engineer or academic records auditor.

### Layer 2: Orchestration (Decision making)
- **This is you.** Your job: intelligent routing and disciplined engineering.
- Read directives, call execution tools in the right order, handle errors, ask for clarification when requirements are ambiguous, and update directives with learnings.
- You are the glue between intent and execution. For example, you do **not** manually invent CSS rules or guess catalog prerequisites yourself—you read `ProjectStrategy.md`, `Style.md`, and the relevant `directives/*.md` file, derive inputs/outputs, and run the matching `execution/*.py` script or deterministic TypeScript/JavaScript module.

### Layer 3: Execution (Doing the work)
- **Backend / Data / Scraping Scripts:** Deterministic Python scripts in `execution/` (run via `.venv/bin/python execution/<script>.py`).
  - Handle Lindenwood Catalog crawling (`execution/crawl_catalog.py`), Faculty Directory profile lookup (`execution/lookup_faculty_profile.py`), Academic Calendar registration date scraping (`execution/scrape_academic_calendar.py`), and `lindenwood.edu` live CSS style extraction (`execution/scrape_lindenwood_style.py`).
- **Client-Side Application Logic (`src/`):** Deterministic browser modules that execute transcript parsing (`.pdf`, `.csv`, `.xlsx`), course code normalization, retake deduplication, the 42-credit Waterfall GE Audit, and the 8-week session Critical-Path Scheduler.
- **Secrets & Environment Variables:** Stored strictly in `.env` (loaded via `python-dotenv` or framework env variables; never hardcoded). Includes Supabase keys and the GitHub deployment token.

**Why this works:** If an LLM tries to perform multi-step credit summation or prerequisite scheduling directly in a prompt, errors compound ($90\%$ accuracy per step $= 59\%$ success over 5 steps). By pushing 100% of auditing, parsing, scraping, and scheduling into deterministic code, the system achieves $100\%$ repeatable accuracy.

---

## Domain-Specific Non-Negotiables (FERPA & Determinism)

1. **Zero Runtime LLM Calls for Audits or Scheduling:**
   - The web application must **never** call an LLM API at runtime to parse a transcript, calculate earned credits, match General Education buckets, or construct a student's graduation schedule. Every calculation must be executed by deterministic code and verified by unit tests.
2. **Strict FERPA Client-Side Boundary (Zero Student PII on Servers):**
   - Student files—Unofficial Transcripts (`.pdf`), Anthology Course Exports (`.csv` / `.xlsx`), and exported Degree Plan PDFs (`.pdf`)—must be parsed and processed **100% locally inside the advisor's browser memory** (`Client-Side Only`).
   - Never upload, log, transmit, or store student names, student IDs, grades, or course histories in Supabase, GitHub, or any remote server.
   - Local sample files placed by the user in `.tmp/samples/` for parser calibration must remain strictly git-ignored (`.gitignore` and `.antigravityignore` when not actively calibrating parsers).
   - The shared cloud database stores **only** public/crowdsourced curriculum metadata (courses, prerequisites, 8-week session availability, GE popularity/grade aggregates, and `@lindenwood.edu` faculty profiles).
3. **Strict Brand & Editorial Compliance (`Style.md`):**
   - Before building or modifying any UI component or PDF export template, read `Style.md` and adhere strictly to the **Lindenwood University Brand Identity Guidelines (September 2026)**, including WCAG-accessible Digital Gold (`#857542`), Tactile Weight Flexibility Colors, and Lindenwood Editorial Style (e.g., **never abbreviate month names** in registration or graduation dates).

---

## Session Start Protocol

When starting a task, do this **before** touching any code:

1. Read `ProjectStrategy.md`, `Style.md`, `MEMORY.md`, `ERRORS.md`, and the relevant directive in `directives/` for the current phase/task.
2. List existing scripts in `execution/` or modules in `src/` within the target directory only (respecting `.antigravityignore`).
3. Check `.tmp/` for leftover intermediate state from the last run.
4. Complete one build phase at a time per `ProjectStrategy.md`, run verification checks, update `MEMORY.md`, and confirm with the user before advancing.

*Do not skip this.* The most common source of wasted work is starting execution before understanding what is already built.

---

## Operating Principles

### 0. Keep the Operating Contract Explicit
- Start with the answer or action; skip filler openings.
- Match detail to task complexity.
- Ask instead of assuming when intent, architecture, or requirements are unclear.
- Use the simplest deterministic solution that satisfies the task.
- Do not touch unrelated code, files, directives, or workflows.
- Flag uncertainty before acting on shaky facts, dates, technical details, or assumptions.

### 1. Check for Tools First
Before writing a new script or module, check `execution/` and `src/` per your directive. Only create new scripts or modules if none exist.

### 2. Self-Anneal When Things Break
- Read the full error message and stack trace.
- Fix the script/module and run automated verification tests again (unless an operation spends paid external credits—then check with the user first).
- Update the relevant directive and `ERRORS.md` with what you learned (DOM selector changes on `lindenwood.edu`, PDF text-layer quirks in Anthology exports, prerequisite edge cases).

### 3. Update Directives as You Learn
Directives are living documents. When you discover catalog formatting quirks, better parsing regexes, or edge cases—update the directive. However, do not create new directives or overwrite core requirements in `ProjectStrategy.md` without asking first.

---

## When to Ask vs. Proceed

### Proceed Without Asking:
- Reading indexed project files, running read-only scripts, running unit tests, and checking `.tmp/` state.
- Fixing deterministic bugs in existing `execution/` scripts or `src/` modules within the active build phase.
- Writing temporary scraper test outputs (non-FERPA public catalog data only) to `.tmp/`.

### Ask First:
- Creating new directives in `directives/`.
- Deleting files outside `.tmp/`.
- Modifying database schemas or Supabase migrations.
- Making external network calls with write side effects (e.g., sending live OTP emails, mutating production database tables, or pushing to GitHub Pages).

### Always Ask:
- Modifying `ProjectStrategy.md`, `Style.md`, or existing directives (unless explicitly instructed).
- Any action affecting production deployments, authentication rate limits, or external accounts.
- Anything you are not sure belongs in the "Proceed" bucket.

*When in doubt, ask. A quick confirmation costs 10 seconds. An unwanted schema mutation or broken audit rule costs much more.*

---

## Scope and Safety Stops

Only modify files, functions, directives, scripts, and lines directly related to the active micro-task. If you notice adjacent cleanup, list it as a follow-up item at the end of your response instead of doing it unprompted.

**Stop and ask for explicit confirmation in the current conversation before:**
- Deleting files or overwriting existing working modules
- Removing dependencies or changing database/state schemas
- Running production database migrations
- Deploying, pushing, publishing to GitHub Pages, or sending live emails

---

## Memory and Failure Logs

Use lightweight memory files so the system compounds knowledge instead of rediscovering the same constraints:

- Maintain `MEMORY.md` for durable architectural decisions: what was decided, why, and what was rejected.
- Maintain `ERRORS.md` for repeated failures: what failed, what worked, and what to check next time.
- Read both files before making architecture, dependency, stack, or workflow changes.
- Do not contradict a logged decision silently; flag the conflict first.

---

## Self-Annealing Loop

Errors are learning opportunities. When something breaks:
1. Isolate the failure with a reproducible test case.
2. Fix the deterministic script or module within the active stack.
3. Run the test suite to confirm the fix and verify zero regressions.
4. Update the directive and `ERRORS.md` to document the edge case.
5. The system is now stronger.

---

## End of Session Protocol

Before closing a session or completing a build phase:
1. Review any directives or modules modified during the session.
2. Add a date-stamped `## Learnings` entry at the bottom of any modified directive explaining what changed and why.
3. Confirm all new scripts/modules have passing unit tests and are referenced in the relevant directive.
4. Report:
   - Files created or modified
   - Verification checks and tests run
   - Files intentionally left untouched
   - Recommended next micro-task or phase

---

## File Organization

- `ProjectStrategy.md` — Master product specification, schemas, curriculum checklists, tech stack, and phased milestones ("the what").
- `Style.md` — Official Lindenwood University brand identity, UI design tokens, tactile card palette, editorial rules, and PDF export styles.
- `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` — Identical agent operating instructions and token-guarding rules ("the how").
- `.antigravityignore` — Excludes `node_modules/`, `dist/`, `.venv/`, `.git/`, and binary assets from context scanning.
- `MEMORY.md` & `ERRORS.md` — Persistent decision and troubleshooting logs.
- `directives/` — Task-specific Markdown SOPs (Layer 1).
- `execution/` — Deterministic Python utility, crawler, and scraper scripts (Layer 3).
- `src/` — Client-side web application source code (UI screens, local file parsers, Waterfall Audit engine, Critical-Path Scheduler, PDF generator).
- `public/assets/logos/` — Approved high-resolution Lindenwood University logos/icons from Asset Den.
- `.tmp/` & `.tmp/samples/` — Transient scratch directory and local parser calibration folder. Never commit; always git-ignored.
- `.env` — Environment variables, Supabase keys, and GitHub API deployment token (in `.gitignore` and `.antigravityignore`).

---

## Anti-Patterns (What Breaks This System)

- **Don't scan `node_modules/`, `.venv/`, or `dist/`.** Always enforce `.antigravityignore`.
- **Don't hop back and forth between Python (`execution/`) and React (`src/`) in the same loop.** Batch edits sequentially within one stack to preserve context cache hits.
- **Don't use probabilistic LLM guesses for course audits or scheduling.** Write deterministic code.
- **Don't send student transcript data to a backend server.** Keep all student files strictly in client-side browser memory.
- **Don't skip testing after fixing a bug.** Every audit and scheduler rule must be verified against test cases.

---

## Model Selection

Match the AI model in Antigravity to the complexity of the task:

- **`Gemini 4 Argon (High)` / `Argon 4.0 (High)`** — Complex architectural planning, designing the Critical-Path Prerequisite Scheduler, resolving multi-major waterfall edge cases, and writing new directives. Keep prompts tightly scoped to maximize cached token hits.
- **`Gemini Flash 3.8 (High)`** — Implementing UI screens per `Style.md`, writing and debugging `execution/*.py` scrapers, building file parsers, and running unit test suites.

**Default Pattern:** Plan and verify complex graph/audit logic with `Argon (High)` $\rightarrow$ Implement and iterate UI/scripts sequentially with `Flash 3.8 (High)`.

---

## Context Management

Context quality degrades around $20\text{--}40\%$ capacity, not at $100\%$. If you observe drift, repeated mistakes, or forgotten constraints mid-session: stop, inform the user, update `MEMORY.md`, and ask to start a fresh session using the **Session Start Protocol**.