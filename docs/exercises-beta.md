# Übungen (Beta): first functional MVP

Open **Übungen (Beta)** in the toolbar (under **Menü** below 1100px). Two exercises
are available: office/warehouse routing and DNS/HTTP portal diagnosis. Labs remains
a separate, unchanged catalog with its existing quizzes and checks.

## Learner flow

1. **Starten** opens the initial topology as a new workspace draft. Existing plans
   remain open. Apply/discard pending Inspector forms before opening another exercise.
2. The collapsible exercise panel shows the German task and mandatory requirements.
   Configure the network using normal terminal/Inspector tools. It does not apply solutions.
3. **Überprüfen** first flushes the active draft, then runs the existing `runChecks`
   against that actual active network. It starts Run and sends real probe packets;
   Pause still works (resume Run to finish or cancel the check).
4. Each requirement aggregates all of its checks. All must pass. A successful run
   stores completion; only a confirmed IndexedDB transaction produces the saved message
   and green **Abgeschlossen** menu marker. Failed writes display an error and require
   another verification, not a false confirmation.
5. **Fortsetzen** focuses an existing open attempt. **Erneut starten** creates a new
   attempt and preserves the earlier completion. Other documents show no exercise panel.

There is no continuous grading, required command sequence or additional Finish button.
Checks and results are invalidated when the network/document/edit sequence changes,
including undo after an edit. Unapplied forms block verification. Async callbacks use a
captured attempt, network identity and configuration signature. Changes during the final
metadata write abort its transaction through the repository's existing AbortSignal support.
An earned historical completion remains in the menu after later edits; this is separate
from whether the **current configuration** has been checked. Old per-requirement green
results are cleared and never reused to approve new work.

## Data and module boundaries

- `drafts.ts` and `types.ts`: authoring source, including private-to-author solutions.
- `scripts/generate-exercise-beta.mjs`: explicit developer projection generation; validates
  drafts and allowlists exactly the two automated exercises.
- `betaStudents.json`: ID, content version and `student` only.
- `betaChecks.json`: IDs, requirement references and supported engine checks only.
- `beta.ts`: runtime projection facade, no import of the full draft catalog.
- `exerciseController.ts`: independent coordinator; delegates topology operations to
  SessionController and probe execution to `labs/checker.ts`.
- `ExerciseUI.tsx`, `exercises.css`: themed menu/panel and minimal provider wired at the
  application composition root. No modifications to Inspector, terminals or protocols.

Regenerate projections after editing the two draft definitions:

```powershell
node scripts/generate-exercise-beta.mjs
```

A unit test compares both projections exactly to their authoring source. References,
reference commands and the other three exercise definitions do not enter the app bundle.
Assessment data is local client-side data, not an anti-cheating or security boundary.

All Beta checks declare `resolveBy: 'id'` in the shared backwards-compatible `Check`
contract. Equipment references (`device`, `from`, `toDevice`) resolve through the
engine's device-ID map, never through editable display names and never by name fallback.
This applies to IPv4, routes, forwarding, firewall policy, ping/TCP sources and targets,
DNS clients and HTTP clients. Legacy Labs omit the field and continue resolving by name.
The exercise authoring type and validator require ID mode; generated projections carry
it too. Renaming equipment does not change the technical conditions or internal IDs.
A rename during an asynchronous run still cancels that run under the existing edit guard;
the next explicit verification evaluates the same IDs with their new labels.

This identity correction changes neither topology documents nor IndexedDB records.
Content versions and criteria remain the same, so existing attempts/completion dates
stay valid without data migration or re-creation.

## Persistence and safety

The existing repository stores one `meta` record under **`exercises:beta:v1`**; the
IndexedDB structural version remains **1**. Writes use `getMeta`/`setMeta` with explicit
expected revisions and bounded CAS retry/merge, preserving other exercise completions.
Unknown/incompatible progress is reported, never overwritten with empty defaults.

The record contains a draft-to-attempt mapping (UUID, draft ID, exercise ID, content
version and start timestamp), plus the first earned completion per exercise (attempt ID,
version, completion timestamp). No topology, solution, packet capture or terminal data
is duplicated there. Workspace drafts continue to persist all network configuration.

- No completion: no attempts means **Noch nicht begonnen**, otherwise **In Bearbeitung**.
- Any earned completion: **Abgeschlossen**, even during a fresh attempt.
- F5, browser restart and switching tabs keep both progress and recoverable open attempts.
- Closing/discarding a draft does not delete its earned completion. A discarded attempt
  has no recoverable topology; start a new one. Historical small mappings can remain.
- Saving/reopening a plan as a *new draft*, JSON import and Share Link do not infer an
  attempt or award completion. Association belongs to the original workspace draft ID.
- Progress is browser-origin-local; it does not travel in topology exports or Git.
- A failed initial association write keeps the newly opened topology and offers retry
  without opening another draft. If the browser is closed before retry, that unassociated
  draft remains ordinary recoverable work, not silently credited exercise progress.
- Pending metadata writes trigger a native unload warning; there is no promise that an
  asynchronous write can finish during browser shutdown. Failed completion needs recheck.
- Other-tab progress is refreshed on window focus and menu opening; CAS protects writes.

This is deliberately not an attempt-history platform. There is no achievement import,
account, backend, currency, AI API, auto-publication or cross-device sync. Exercise version
1 is the only supported content here; a recovered attempt from another content version
cannot be checked against a new version and must be restarted.

## Validation

```powershell
node node_modules/vitest/vitest.mjs run src/exercises/ src/labs/ src/persistence/sessionController.test.ts src/workspace/workspaceUI.test.ts
node scripts/test-exercise-beta.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
git diff --check
```

Unit tests cover real-engine initial failures/reference successes, alternate solutions,
stale callbacks, closing/switching, pending forms, change during delayed commit, CAS retry,
write failures, association retry, corrupt metadata and no achievements from solved imports.

The native Chromium harness reuses the existing repository test environment: disposable
profile, random loopback port and `netlab-idb-test-*` database, never the user's real data.
It exercises the UI, both solutions, actual IndexedDB completion writes/failures, F5,
full browser restart, resume/repeat, changes during checks, Labs, Graphite Dark at 1440px
and Classic Light at 700px. Reference data is imported by the **test only**. Captures are
published through the existing Visual Review generator; previous captures are archived.
The test harness also verifies the production database was never opened.
