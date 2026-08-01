# ADR 0005 — UI stack: React + React Flow + xterm.js + Zustand + Vite

**Status:** accepted (2026-08-01)

## Context

The UI needs a drag-and-drop node/edge editor (devices + cables), embedded terminals, packet
animation, and static-site builds. Evaluated: tldraw (whiteboard-oriented, watermark license),
JointJS (best parts are paid), Cytoscape.js (graph analysis, weak editing), raw D3/SVG (maximum
effort).

## Decision

- **React Flow (@xyflow/react, MIT)** for the topology canvas — purpose-built node/edge editor;
  interfaces map to handles; custom "floating" edges draw cables border-to-border.
- **xterm.js** for per-device terminals (one persistent session per device).
- **Zustand** for state; the engine instance itself lives outside React and is mirrored into
  reactive state (nodes/edges/packets).
- **Vite + Vitest**; the engine and command layers stay import-free of React so they test in
  Node and could be reused (CLI grader, service worker) later.
- Packet animation renders as an SVG overlay in flow coordinates, interpolating along the
  device-centre line — the same line floating edges use.

## Consequences

- The engine/UI boundary (`src/engine`, `src/commands` vs `src/components`) is a hard rule;
  engine code must never import React or DOM types.
- React Flow's attribution stays visible (free tier requirement).
