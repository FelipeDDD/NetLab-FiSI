# ADR 0001 — Fully client-side static site, no backend

**Status:** accepted (2026-08-01)

## Context

The tool must work for teaching at scale: student laptops, locked-down lab machines,
Chromebooks, and offline demos. Every comparable tool with a server component (PT Anywhere,
Boson NetSim Online, NetPilot, GNS3/EVE-NG) requires institutional hosting, accounts, or
licensing — which is exactly what killed easy classroom adoption of the tools NetSim replaces.

## Decision

NetSim is a static site. All simulation runs in the browser. Persistence and sharing use
localStorage, JSON file export/import, and lz-string-compressed URL fragments. Deployment
target is any static host (GitHub Pages).

## Consequences

- Zero infrastructure cost; a lecturer shares a link or a JSON file via the LMS.
- Student work is submitted by exporting a JSON attempt file, not via a server.
- Live class dashboards / in-app submission would need an optional backend later; that is an
  additive layer and must never become a requirement for core features.
- Everything (labs, scenario library) ships as data files in the repo.
