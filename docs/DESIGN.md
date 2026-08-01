# NetSim — Browser-Based Network Simulator & Firewall Teaching Tool

*Working design document — 2026-08-01. Distilled from the iNetwork Simulator material in this
folder, competitor research, and technical feasibility research.*

## 1. Vision

A modern, fully browser-based successor to the UTS **iNetwork Simulator** (Ye & Sandrasegaran,
IEEE 2006): drag-and-drop network building, per-device terminals, packet-level simulation, and
firewall rule configuration — but using **real open-source Linux syntax** (nftables, iptables,
iproute2) instead of invented commands, and running **entirely client-side** so it deploys as a
static site with zero installation.

Three roles in one tool:
1. **Teaching tool** (primary) — guided labs with auto-checked objectives, packet animation,
   "why was this packet dropped?" explanations.
2. **Design tool** — build a topology, generate diagrams and documentation.
3. **Config-design/testing tool** — author firewall rules against a simulated network, then
   export *real* config files and a containerlab/compose file to run it for real.

## 2. Market gap (research summary, verified 2026-08-01)

No existing tool combines: fully client-side + real Linux syntax + drag-and-drop topology +
firewall testing.

| Tool | Client-side? | Real Linux syntax? | Topology editor? | Notes |
|---|---|---|---|---|
| NetPilot | No (cloud emulator) | Vendor CLIs | Yes | Proprietary SaaS |
| PT Anywhere | No (server-side Packet Tracer) | Cisco IOS | Yes | PT is Cisco-proprietary |
| Boson NetSim Online | No (hosted, paid) | Cisco IOS | Yes | Cert-prep focus |
| Filius | No (Java desktop) | Invented CLI | Yes | Closest pedagogical cousin |
| GNS3 / EVE-NG / Containerlab / Kathará | No (server/Docker) | Real (emulation) | Varies | Heavyweight |
| PackeTTrino (GitHub, 14★) | Yes | Linux-flavoured | Partial | Solo project, no labs/nftables |
| algolg/iptables-sim (11★) | Yes | iptables subset | No (single host) | Practice tool only |

**Nothing teaches nftables in the browser at all.** That space is entirely unserved.

## 3. Decisions made

| Question | Decision |
|---|---|
| Firewall syntax | **Both iptables and nftables, nftables-first** — one internal rule model, two syntax front-ends |
| Pedagogy | **Labs + sandbox** — free-build editor plus a lab format with auto-checked objectives |
| Exports | **All**: real config files, containerlab/docker-compose, SVG/PNG diagrams + docs report, topology JSON for sharing |
| Protocol scope | **Kitchen sink** as the end goal (ARP, DHCP, DNS, static + dynamic routing (RIP/OSPF), NAT, TCP, HTTP, VLANs, wireless) — delivered in phases so v1 ships |
| Backend | **None** — static site; sharing via JSON export/import, compressed-topology URLs, and a bundled scenario library |

## 4. Architecture

**Do not run real Linux in the browser; simulate it, keep the syntax honest.**

WASM VMs (v86 etc.) were evaluated and rejected for the core: 64–512 MB + 5–30 s boot *per
device* kills classroom topologies on student hardware, and a real kernel can't explain its
decisions. A pure-TS simulator gives instant, deterministic, inspectable, gradable execution.
(A v86 "real VM sandbox" node remains a possible advanced add-on later.)

### Components

- **Simulation engine** — pure TypeScript discrete-event simulator. Nodes (host, switch,
  router, servers, firewall, AP) with interfaces; every frame/packet is an event on a global
  clock. Deterministic and replayable → timeline scrubbing, step-through, auto-grading.
- **Command layer** — per-device shell (xterm.js) accepting a curated subset of real syntax:
  `ip addr/route/link`, `ping`, `traceroute`, `dig`, `arp`/`ip neigh`, `curl` (HTTP test),
  `nft`, `iptables`. **Unsupported syntax errors loudly** — never silently fake it.
- **Syntax honesty via CI** — every example/lab ruleset in the repo is validated against real
  `nft -c` / `iptables-restore --test` in CI, so taught syntax is guaranteed genuine.
- **Rule model** — one internal firewall IR; nftables and iptables parsers both compile to it;
  exporters emit both dialects. Evaluation engine annotates every verdict with the matching
  rule (the "explain" feature).
- **Topology editor** — React Flow (xyflow, MIT): device palette, drag-drop, interface
  handles, minimap. Packet animation = markers moving along edge paths, driven by the event log.
- **Lab format** — JSON: starting topology + narrative steps + objectives expressed as
  assertions the engine can check (e.g. `reach(hostA, web:80) && !reach(hostA, web:22)` and
  "conntrack must show ESTABLISHED"). Quiz questions per iNetwork tradition.
- **Persistence/sharing** — localStorage autosave; topology/lab/attempt JSON export-import
  (lecturer posts file to LMS → student imports → student exports attempt for submission);
  URL-fragment sharing (lz-string-compressed JSON) for small scenarios; bundled scenario
  library (JSON in repo, contributions by PR).

### Stack

TypeScript + React + React Flow + xterm.js + Vite; Zustand (or similar) for state;
Vitest for engine tests; deploy to GitHub Pages. No backend.

## 5. Firewall semantics (v1 scope within phase 2)

IPv4: filter (INPUT/FORWARD/OUTPUT) + NAT (masquerade, DNAT). Matches: `ip saddr/daddr`,
`tcp/udp sport/dport`, `icmp type`, `ct state`, `iifname/oifname`. Verdicts: accept, drop,
reject (with ICMP unreachable — as the iNetwork paper distinguished). Stateful tracking via a
simple conntrack table (NEW/ESTABLISHED/RELATED). Deferred: IPv6, mangle/raw, sets/maps,
marks, rate limiting, helpers.

This already exceeds the original iNetwork firewall (stateless, inbound-only) and covers its
paper's stated future work (outbound filtering, NAT, stateful).

## 6. Phased roadmap (end state = kitchen sink, but shippable at every phase)

1. **Core engine + editor** — topology editor, host/switch/router, ARP, IPv4 static
   addressing/routing, ICMP; terminals with `ip`, `ping`, `traceroute`; packet animation;
   save/load/share.
2. **Firewalls** ← the differentiator; do it early — nftables + iptables parsers, conntrack,
   NAT, verdict explanations; firewall lab series; real-config export.
3. **Services** — DHCP, DNS, TCP handshake, HTTP server + `curl`; iNetwork lab parity
   (addressing → DHCP → DNS → routing → firewall → HTTP).
4. **Lab/pedagogy layer polish** — lab player UI, objective auto-grading, quizzes, attempt
   export for submission.
5. **Design/testing exports** — SVG/PNG diagram + documentation report; containerlab +
   docker-compose export (bridge to the existing Docker environment: design in browser, run
   for real).
6. **Kitchen sink** — RIPv1/v2 (iNetwork parity) then OSPF; VLANs/802.1Q on switches;
   wireless AP/client (SSID association model). Optional: v86 real-VM node type.

## 7. References

- Ye, M. & Sandrasegaran, K. (2006). *Teaching about Firewall Concepts using the iNetwork
  Simulator*, IEEE (PDF in this folder).
- iNetwork Simulator (UTS) feature descriptions: `desc-0.md`, `desc-1.md`, `desc-2.md`,
  UI annotated screenshot `inetworksimulatorak9.png`.
- Competitor notes: `others.md` + research (NetPilot, PT Anywhere, Boson, Filius,
  PackeTTrino, iptables-sim, TULiPS; v86 networking docs; CheerpX licensing).
