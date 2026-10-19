# NetSim user guide

NetSim is a network simulator that runs entirely in your browser. Build a
network by dragging devices onto the canvas and cabling them together, open a
terminal on any device and configure it with **real Linux commands**, and
watch packets travel between them. Nothing to install; nothing is sent to a
server.

Live app: <https://netsim.borck.education/>

> In-app, the `help` command in any terminal lists the supported commands.
> This guide is the bigger picture: the interface, the workflow, and what the
> tool does and doesn't simulate.

## The interface

- **Toolbar** (top): New, Demo, Labs ▾ (labs + example networks), Import,
  Export ▾, Share link, Help; on the right, the simulation clock with
  Pause and a speed selector.
- **Device palette** (left): drag Host, Server, Switch, Router, Firewall or
  Wi-Fi AP onto the canvas — or click to drop one in.
- **Canvas** (centre): your network. Drag between the dots on two devices to
  cable them. Packets animate along the links, colour-coded by protocol
  (amber ARP, blue ICMP, green TCP, purple UDP); a red ring flashes where a
  firewall drops a packet.
- **Inspector** (right, when a device is selected): rename, interfaces and
  addresses, routing/ARP/MAC/conntrack tables, firewall ruleset and log, and
  service editors (DHCP/DNS/web, VLANs, SSID, RIP).
- **Terminal dock** (bottom): double-click a host/router/server/firewall to
  open its terminal, or use the small terminal button revealed when hovering
  or keyboard-focusing the device. The first four sessions automatically create
  equal side-by-side panels. Each panel has its own selected tab, device label
  and close buttons. Further sessions open as tabs in the last focused panel.
  Opening an existing session activates its tab and focuses its input.
  Switching tabs keeps history and running commands. Closing a tab ends only
  that session; an empty panel disappears and the other panels expand.

Drag the dock's top border to resize it. You can also focus that border and
use Up/Down (10 pixels), Shift+Up/Down (50 pixels), Home (minimum) or End
(maximum). The preferred height is remembered in this browser when storage is
available and adapts temporarily to smaller windows. In the tab bar, Left/Right
or Home/End moves keyboard focus; Enter/Space activates the focused terminal.

Drag a separator between panels to adjust the adjacent widths. With a separator
focused, Left/Right adjusts 10 pixels, Shift+Left/Right 50 pixels, and Home/End
reaches the width limits. Double-click equalizes the adjacent pair. Creating a
new panel resets all columns to equal widths; closing one retains the remaining
proportions. Panels keep at least 280 pixels of width. Narrow screens scroll
the dock horizontally instead of squeezing the terminals; opening or navigating
to a session brings its panel into view. Panel arrangement and width preferences
last for the current session; the saved dock height is unchanged.

Press Escape while typing in a terminal to return focus to the topology editor.
The command continues running. Click a terminal or activate its tab to resume
typing. Escape inside an appearance popover only closes that popover.

Use **⚙ Terminal settings** at the upper left of the dock to open the compact
**Appearance** menu. Choose a device under **Device color**, including devices
whose terminals are closed, then change its color or use **Restore color** to
return to the type's color: blue for hosts,
green for servers, amber for routers and rose for firewalls. The color appears
as a small dot beside the terminal tab, an integrated colored top border and a
tint in its mostly-black background. The active tab has a subtle matching fill;
inactive tabs are quieter. Tab labels use 14 px text and larger close buttons.
When tabs exceed a panel's width, scroll its tab strip horizontally.
Click the dot (or focus it and press Enter/Space) to open the same settings in a
compact popover with that device already selected, without switching terminals.
The Inspector now focuses on network settings. Enter/Space opens the menu;
Escape closes it and returns focus to its trigger. Clicking outside also closes it.

Choose **Diagonal** for a dark upper-left corner that transitions to the device
color at the lower right, or **Dual Glow** for a subtle upper-left light and a
stronger lower-right light with a dark center. **Intensity** ranges from 0 to
100%, with a more visible default of 80%. **Terminal font size** offers 12–18 px;
new topologies start at 14 px. Older files without a font preference retain the
original 13 px, also available in the menu. The terminal refits automatically
when its font changes, including hidden tabs when they are shown again. This
does not change fonts elsewhere in the interface. **Terminal font family** offers
System (the original stack), Consolas, Cascadia Code and Courier New. These use
locally installed fonts with monospace fallbacks and require no downloads.
The exact fallback and glyph appearance depend on the operating system's fonts.
Style, intensity, font family and font size
apply to all terminals in the current topology; colors remain individual. These preferences
are saved with the topology alongside the existing per-device colors.
Text, cursor and selection colors stay fixed;
even choosing white keeps the background dark. The device name and selected-tab
border remain visible, so identification does not depend on color alone.
Custom colors are saved with the topology (autosave, JSON export/import and
share links), including for devices whose terminal is closed. Old files use
the defaults. A color change does not restart the terminal or its commands.

**Restore defaults** resets all device colors and the shared appearance in the
current topology: Diagonal, 80% intensity, System font and 14 px. It preserves
open sessions, panel widths, dock height, history and running commands. Only
implemented appearance options are shown; there are no placeholder Layout or
Behavior sections.

The **Labs** and **Export** menus stay above the editor and scroll internally
when the window is too short. Open them with a click, Enter/Space, or Up/Down
while the button has focus. Inside, Up/Down, Home and End move between items;
Enter activates one, Escape returns to the button, and Tab leaves the menu.
They reposition on scrolling/resizing and close if their button leaves the window.

Click the IP address below a device to copy its IPv4 address without the CIDR
prefix. In the Inspector, each configured interface has its own copy button.
Both controls work with Enter/Space and briefly confirm success. If clipboard
access is denied or unavailable, select the address and use Ctrl+C (Cmd+C on
Mac). On the canvas, dragging over the IP selects text instead of moving the
device. In a terminal, Ctrl+C copies selected text; without a selection it
interrupts the running command.

Ctrl+V (Cmd+V on Mac) uses the browser's normal paste event. IPs, commands and
Unicode text are inserted once into the current command line; press Enter to
execute. Pasted line breaks and tabs become spaces, and control characters
are removed, so multiline clipboard text never executes automatically. Review
it before pressing Enter, or paste one command at a time. While a command is
running, paste is ignored with a reminder to stop it using Ctrl+C first. The
app does not read the clipboard in the background or request extra clipboard
permissions; browser restrictions and shortcuts still apply.

Ctrl+A (Cmd+A on Mac) selects only the command currently being edited, with
xterm's visible selection highlight. The prompt and previous output are excluded,
including for Unicode and visually wrapped commands. Backspace/Delete clears the
selected command; typing or pasting replaces it. Enter executes it unchanged.
An empty line or a running command has no editable command to select. Ctrl+C
continues to copy a selection, or interrupt a command when nothing is selected.

With focus in the terminal dock, Alt+Shift+Right moves to the next terminal and
Alt+Shift+Left to the previous one, wrapping through **all open sessions across
all panels**, in opening order. The activated terminal
receives focus; its input, history and running commands are retained. These keys
do not switch terminals while editing a field elsewhere in the app.
Ctrl+Tab / Ctrl+Shift+Tab also work **if the browser delivers them to the page**.
[Chrome reserves these combinations for its own tabs](https://support.google.com/chrome/answer/157179?hl=en),
so use Alt+Shift+Right/Left when they are intercepted. No browser settings or
keyboard-lock permissions are required; OS shortcuts and extensions can still
take precedence.

Browser validation: automated checks in Chromium 155 covered wrapped Unicode
selection, replacement/deletion, safe native-event paste, circular navigation,
focus restoration and isolation from other fields. Ctrl+Tab was also delivered
through automation; this does not prove that a physical key press bypasses the
browser's own tab shortcut. Vivaldi-specific handling is not required or assumed.

## Building a network

1. Drag devices out, or click **Demo** for a ready-made one.
2. Cable them: drag from a dot on one device to a dot on another.
3. Give them addresses — either in the Inspector's interface fields, or in a
   terminal with `ip addr add 192.168.1.10/24 dev eth0`. Both run the same
   engine code.
4. Add routes (`ip route add default via ...`), turn on services, write
   firewall rules — then test with `ping`, `traceroute`, `nc`, `dig`, `curl`.

Hosts have one interface; routers and firewalls have four; switches and APs
have eight ports. A firewall is a router that already has nftables base
chains declared.

## Commands (the supported subset)

NetSim implements a **curated subset of genuine syntax** and errors clearly
on anything outside it — it never silently fakes a command. Highlights:

- **Addressing / routing:** `ip addr`, `ip link`, `ip route`, `ip neigh`,
  `arp`, `sysctl net.ipv4.ip_forward`
- **Reachability:** `ping`, `traceroute`
- **Firewall:** `nft ...` and `iptables ...` — two front-ends onto one
  ruleset, so a rule added with either shows up in both `nft list ruleset`
  and `iptables -S`. Plus `conntrack -L`, `ss`.
- **Services:** `dhclient` (DHCP), `dig` (DNS), `curl` (HTTP), `nc` (port
  testing and listeners)

Run `help` in any terminal for the exact list, and see
[the design doc](DESIGN.md) for the deliberate scope boundaries (IPv4 filter
+ NAT, RIP for dynamic routing, etc.).

## Labs and examples

The **Labs ▾** menu holds guided, auto-graded labs and a couple of example
networks to explore. See [LABS.md](LABS.md) for the catalogue. In a lab, the
panel on the canvas gives you steps, objectives (click **Check objectives**
to grade — you'll see the grader's probe packets), quizzes, and **Export
attempt for submission**.

## Saving, sharing, exporting

- **Autosave:** your work is saved in the browser automatically.
- **Import / Export → Topology (.json):** save a network to a file or hand
  one out.
- **Share link:** copies a URL with the whole topology encoded in it — good
  for handing a scenario to students, no file needed.
- **Export ▾** also produces: a **device config bundle** (real `setup.sh`,
  `nftables.conf`, `dnsmasq.conf` per device), **containerlab** and
  **docker-compose** files to run the design for real, **SVG/PNG** diagrams,
  and a printable **HTML report**.

## What NetSim does and doesn't simulate

It **does**: L2 switching with VLANs, ARP, IPv4 routing (static + RIP), ICMP,
a TCP handshake, UDP, DHCP, DNS (A records), HTTP, stateful firewalling with
NAT, and connection tracking — all as discrete packet events you can watch
and step through.

It **doesn't** (by design, for now): IPv6, OSPF/BGP, 802.1Q trunking, TLS,
real application payloads, or performance/bandwidth modelling. It is a
teaching and design tool, not a packet-accurate emulator — for that, use the
containerlab export and run the design on real kernels.

## Troubleshooting

- **A command is rejected as unsupported.** That's deliberate — check `help`
  for the supported form. NetSim won't pretend to run syntax it doesn't model.
- **A ping/curl hangs then times out.** Something is dropping it silently —
  check routes (`ip route`), the default gateway, and any firewall in the
  path (open its Inspector; the firewall log names the rule that dropped it).
- **DHCP finds no server / DNS won't resolve.** Confirm the server has the
  service enabled (Inspector) and that no firewall is dropping udp/67 or
  udp/53 between client and server.
- **The canvas is empty on load / something looks stuck.** Use **New** for a
  clean slate or **Demo** for a known-good network; both reset cleanly.
