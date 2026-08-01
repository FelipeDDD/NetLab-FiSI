# ADR 0003 — Real Linux syntax subset with loud errors, validated against real tools

**Status:** accepted (2026-08-01)

## Context

The original iNetwork Simulator (and Filius, and most teaching tools) invented simplified
CLIs. Students then faced a cliff when they met real systems. Cisco-syntax tools (Packet
Tracer, Boson) teach a proprietary ecosystem. NetSim's core promise is that everything a
student types would work on a real Linux box.

The risk of *simulating* Linux (ADR 0002) is drift: accepting syntax that real tools reject, or
diverging output formats.

## Decision

1. Commands implement a **curated subset** of genuine syntax (`iproute2` now; `nft`/`iptables`
   in phase 2), including real error messages where practical (`RTNETLINK answers: File
   exists`, `Error: Nexthop has invalid gateway.`).
2. Anything outside the subset produces an explicit
   `netsim: "…" is not supported` error. **NetSim never silently fakes or approximates
   syntax.**
3. From phase 2, every example/lab ruleset shipped in the repo is validated in CI against the
   real parsers (`nft -c`, `iptables-restore --test`) so taught syntax is guaranteed genuine.

## Consequences

- Students can paste their NetSim commands into a real shell and vice versa (within the
  documented subset).
- Parser work is significant and must be prioritised by pedagogical value (filter + NAT before
  exotica).
- Output formats mimic Linux closely but are simplified where full fidelity adds noise
  (documented per command).
