# Terminal command reference

Each terminal panel has an information button beside its width lock, labelled
`Befehlsreferenz öffnen`. All buttons open the same read-only dock-level modal,
`Terminal — Befehlsreferenz`. It is portalled to the page body and uses native
`dialog.showModal()`: the browser keeps background controls inert and handles
Escape. A localized Tab/Shift+Tab boundary loop prevents focus from escaping to
browser chrome at either end; interior keyboard navigation stays native.
Closing via Escape, X or the backdrop returns
focus to the originating button without scrolling. No terminal is remounted.

Search covers command names, topics, syntax, parameters, examples and notes.
Linux and Windows CMD are separate views; categories filter the current view.
Examples and implementation notes expand with native `details` controls.
When a syntax and its example are identical, the syntax is directly copyable
and no duplicate example is shown; useful parameter explanations still expand.
Other examples remain separately copyable. Syntax highlighting uses plain React
text tokens: amber and a dotted underline identify placeholders/alternatives,
and grey brackets mark optional parts. A visible legend explains the notation;
characters and copied commands are unchanged. The route example explains that
West's eth1 is its own outgoing interface toward Ost, not Lager's interface.
Copy uses the Clipboard API only. A denied/unavailable clipboard gives a manual
selection/Strg+C instruction; it never sends input to a terminal. The modal has
no shell/engine/store write access. Existing textual `help` remains unchanged.

## Content and source of truth

`src/terminalReference.ts` contains 29 entries and 67 operations, checked against
the actual dispatchers and parsers in `src/commands/`. `clear` belongs to the
terminal session rather than the Linux shell dispatcher.

| View | Referenced commands |
| --- | --- |
| Linux | `ip route`, `ip address`, `ip link`, `ip neigh`, `arp`, `ping`, `traceroute`, `dhclient`, `systemctl`, `dig`, `curl`, `nc`, `nft`, `iptables`, `sysctl`, `conntrack`, `ss`, `hostname`, `clear`, `help` |
| Windows CMD | `ipconfig`, `route print`, `ping`, `tracert`, `arp`, `nslookup`, `hostname`, `cls`, `help` |

Seven topics group the entries: IP & Interfaces, Routing, Diagnose & Verbindung,
ARP, DHCP/DNS/HTTP, Firewall & Sicherheit and Weitere Befehle. Routing explains
Connected/Static/Default routes, longest-prefix matching, destination, next hop
and local interface, including
`ip route add 10.72.2.0/27 via 10.72.254.2 dev eth1`.

Static route destinations are normalized to their network before checking for
duplicates. For example, `10.72.2.10/27` and `10.72.2.0/27` are the same
destination; another static route with that prefix reports `RTNETLINK answers:
File exists`, even with a different gateway or interface. Use `ip route add` to
create a new route; use `ip route replace 10.72.2.0/27 via 10.72.254.2 dev eth1`
to correct its next hop/interface, or create it if absent. Replace preserves its
position and refuses legacy duplicates with a message asking for manual repair.
It uses the same interface and gateway validation as add. `default` and any
`/0` destination likewise identify the same static route. Connected routes,
interface gateways and RIP routes remain separate from this check.

Older saved documents can already contain duplicate static routes. Loading and
saving preserve their order and do not remove them. The routing lookup uses the
longest matching prefix; on ties it selects the first usable route in its
existing order (connected routes precede static routes). To repair duplicates,
first save or export a backup and inspect `ip route show`. `ip route del
10.72.2.0/27` removes the first matching **static** route, one at a time; check
the table and repeat as necessary, then add the desired route. For defaults use
`ip route del default`. This does not remove a connected route or the separate
interface gateway option; `append`, `change` and ECMP are not supported here.

The catalog deliberately describes NetLab's implemented subset:

- Windows supports `route print`, not `route add/delete`; `tracert` has no flags.
- Linux ARP deletion uses `ip neigh flush all/dev`; Windows uses `arp -d`.
- `systemctl` supports only start/stop/status of the router's
  `kea-dhcp4-server` unit, not general systemd, DHCP relay or Cisco IOS.
- DNS queries are A lookups; HTTP has no TLS; netcat is a probe/listener model.
- nftables/iptables share a limited IPv4 filter/NAT model. Handle display uses
  `nft -a list ruleset` (the flag must precede `list`). Examples that change rules
  state their table/chain prerequisites; displayed handle numbers are examples.
- `ss` shows simulated listeners, and `conntrack` is display-only.

Adding a command requires reviewing its real parser before expanding this data.
The catalog coverage test detects new dispatcher commands without references;
it does not prove every option is supported. Syntax/semantic regression tests
exercise the documented route and firewall examples using the existing shell.

## Layout and validation

The header gains one 28px information button; dock geometry and terminal session
ownership are unchanged. The modal is centered relative to the browser, with
independently scrollable navigation and content. At widths up to 760px, navigation
becomes horizontal strips above the content. Theme variables cover Graphite Dark
and Classic Light. No preference, project or workspace data is written.

Run targeted tests with Node 24:

```text
node node_modules/vitest/vitest.mjs run src/terminalReference.test.ts src/commands src/terminals.test.ts src/terminalShortcuts.test.ts src/components/terminalPageFocus.test.ts
```

For real Chromium, set `NETLAB_TERMINAL_REFERENCE_REVIEW=1` and run
`node scripts/test-project-repository.mjs`. The existing harness creates a
disposable browser profile and isolated database. It checks opening from multiple
panels, one modal, search, categories, OS separation, disclosure, copy success
and denial, keyboard focus, all closing paths, focus restoration, continued
editing, session identity, serialized topology, panel arrangement, dock height
and exact viewport preservation after the initial document fit. Clipboard writes
are intercepted in the test profile; real system clipboard contents are untouched.
Five-column screenshots in both themes at 700/1440px are written to
`.playwright-mcp/reviews/raw/terminal-reference/` and remain generated artifacts.

Validated on 2026-11-02 with Node 24: 403 targeted tests in eight files and
108 Chromium checks passed (five reference-specific groups plus the repository,
workspace and application regressions). Chromium reported no runtime errors.
TypeScript, production build and whitespace checks passed. The existing build
warning about chunks larger than 500kB remains.
