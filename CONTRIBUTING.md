# Contributing to NetSim

Thanks for your interest! NetSim is a teaching tool, so clarity and
correctness matter more than feature count.

## Development

```sh
npm install        # .npmrc sets bin-links=false (works on ExFAT drives)
npm run dev        # dev server at http://localhost:5173
npm test           # engine + command + lab + export tests (vitest)
npm run build      # type-check + production bundle
```

The **engine** (`src/engine/`) and **command layer** (`src/commands/`) are
framework-free and fully unit-tested — they must never import React or DOM
types (see [ADR 0005](docs/adr/0005-react-flow-xterm-ui-stack.md)). UI lives
in `src/components/` and `src/store.ts`.

## Ground rules (from the ADRs)

- **Real syntax, or a loud error — never a fake.** Commands implement a
  curated subset of genuine Linux syntax and must reject anything outside it
  clearly ([ADR 0003](docs/adr/0003-real-linux-syntax-loud-errors.md)).
  Generated configs are validated against the real `nft`/`dnsmasq` binaries
  in CI.
- **Client-side only.** No feature may require a backend
  ([ADR 0001](docs/adr/0001-fully-client-side-static-site.md)).
- **Explainable simulation over emulation.** The engine is deterministic so
  every outcome can be explained ([ADR 0002](docs/adr/0002-pure-ts-engine-not-wasm-vms.md)).

## Adding a lab

See [docs/LAB_AUTHORING.md](docs/LAB_AUTHORING.md). To bundle it, add it to
`src/labs/library.ts` and include a test in `src/labs/labs.test.ts` that
grades it in both unsolved and solved states — this keeps every bundled lab
provably solvable.

## Pull requests

- Run `npm test` and `npm run build` before opening a PR.
- Keep new engine behaviour covered by tests.
- Match the surrounding code style; no linter config to fight.

Good first issues: additional labs, more `dig`/`nft` subset coverage, OSPF,
802.1Q trunks, IPv6, or a v86-based real-VM node type.
