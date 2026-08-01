# ADR 0006 — Sharing via JSON files and compressed URLs, no database

**Status:** accepted (2026-08-01)

## Context

Lecturers must distribute scenarios; students must submit attempts. ADR 0001 rules out a
required backend.

## Decision

One canonical `SaveFile` JSON format (versioned, `app: "netsim"`) captures the whole world:
devices, interface config, static routes, links, canvas positions — and, from phase 4, lab
definitions and attempt state. It is used identically for:

- **Autosave** — localStorage;
- **Files** — export/import buttons (lecturer → LMS → student, and student attempt →
  submission);
- **Links** — lz-string `compressToEncodedURIComponent` in the URL fragment (`#t=…`), suitable
  for topologies up to a few KB;
- **Scenario library** — the same JSON committed to the repo, contributed by pull request.

## Consequences

- The format is a public contract: versioned, migrated forward, never broken silently.
- URL sharing has a practical size ceiling; large scenarios fall back to files.
- Assessment integrity relies on process (attempt files are trivially editable); auto-grading
  is formative feedback, not a proctored exam.
