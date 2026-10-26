# Directive: Phase 1 Data Core & Environment Setup (`directives/phase1_data_core.md`)

## 1. Objective
Establish the deterministic data core, local persistence adapter, and development environment for the Lindenwood University Degree Planner application in strict accordance with `ProjectStrategy.md` and `Style.md`.

## 2. Architecture & Components
- **Deterministic Master Curriculum:** `src/data/masterDatabase.json` containing 71 normalized courses, boolean 8-week session offerings (`FA_I_8wk`, `FA_II_8wk`, `FA_16wk`, `SP_I_8wk`, `SP_II_8wk`, `SP_16wk`, `SU_8wk`), modalities, structured boolean prerequisite logic trees, Math Placement flags (`IIT 21500`), forced summer exception (`IIT 45200`), legacy substitutions (`ICS 41100` -> `ICS 41500`, `ICS 41400` -> `ICS 41700`, `ICS 32600/32601`), and exact degree checklists for all 3 majors:
  1. `Cybersecurity, BS` (poid=2148, 66 credits)
  2. `Information Technology, BS - Applications Development Emphasis` (poid=2151, 66 credits)
  3. `Information Technology, BS - Networking Emphasis` (poid=2152, 60 credits)
- **Local Persistence & Two-Key Peer Verification Adapter:** `src/data/dbAdapter.js`
  - Offline-first IndexedDB and localStorage storage.
  - Two-Key Peer Verification: single-advisor edit marks rule `Tentative (*)`; second distinct `@lindenwood.edu` advisor confirmation promotes to `Verified`.
- **Python Execution Layer:** `execution/seed_master_database.py` generates and validates `masterDatabase.json`.

## 3. Verification Protocol
1. Run Vitest suite: `npm.cmd test` (13 tests verifying schemas, credit calculations, degree checklists, and dbAdapter mutability).
2. Run Pytest suite: `.\.venv\Scripts\python.exe -m pytest tests/test_master_db.py`.
3. Verify Vite static production build: `npm.cmd run build`.

## 4. Learnings (October 22, 2026)
- **Windows PowerShell Execution Policy:** Default Windows client restricts `.ps1` execution for npm. Commands must use `npm.cmd`.
- **Windows AppLocker on pip:** Standalone `.venv/Scripts/pip.exe` is blocked by Windows Application Control; executing via allowed Python launcher `.\.venv\Scripts\python.exe -m pip` bypasses this cleanly.
- **GitHub Token Extraction:** GitHub Personal Access Token, username (`todwood`), and repo (`synapse-ai`) were rescued in read-only mode from `../simple-project1/.env` into `Degree_Planner/.env`. Token string is never committed and never printed in logs or chat.
- **Node v24 ESM JSON Import Attribute (`with { type: 'json' }`):** Static JSON imports in `src/data/dbAdapter.js`, `src/engine/waterfallAudit.js`, and `src/engine/scheduler.js` use `with { type: 'json' }` for dual compatibility across Node v24 native ESM and Vite 5.
- **Composition D-Grade Overflow Prevention:** `ENGL 15000`, `EPP 15000`, and `ENGL 17000` with a `D` grade are explicitly excluded from `ge_elective_1` and `ge_elective_2` so they flow strictly into `claimedFreeElectives` (counting toward the 120-credit total while leaving the Composition bucket unfulfilled).
- **Same-Semester Session I $\rightarrow$ Session II Chaining & What-If Conferral Sort Keys:** Completing a prerequisite in `FA-I` or `SP-I` unlocks dependent courses in `FA-II` or `SP-II` of the same semester (e.g., `ICS 32300/32301` in `FA-I` $\rightarrow$ `ICS 32400/32401` in `FA-II`). The What-If Accelerator compares chronological conferral sort keys (`YYYYMM`) to surface earlier graduation months (`March`, `May`, `August`, `October`, `December`).
