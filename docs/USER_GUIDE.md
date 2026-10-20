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

- **Toolbar** (top): Undo, Redo, New, Demo, Labs ▾ (labs + example networks), Import,
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
  or keyboard-focusing the device. In **Free panels**, each new session creates
  an independent side-by-side panel, unless a saved manual arrangement specifies
  its destination. There is no fixed panel limit: columns stay at least 280 px
  wide and the dock scrolls horizontally. Each panel has its own selected tab,
  device label and close buttons. Combine tabs manually when useful.
  Opening an existing session activates its tab and focuses its input.
  Switching tabs keeps history and running commands. Closing a tab ends only
  that session; an empty panel disappears and the other panels expand.

**Undo / Redo covers device movement, creation/deletion, cables and supported Inspector settings.** Use the toolbar buttons
or Ctrl+Z / Ctrl+Shift+Z (Cmd on macOS). Each drag, including a multi-device
selection, is one operation. Repeated arrow-key moves are grouped until 350 ms
after the last key release, or until focus/interaction changes. Escape cancels
an ongoing move; unchanged gestures do not add history. Tooltips name the next
operation, and unavailable actions are disabled.

The last 50 operations stay in memory; F5 starts a fresh history. New edits
clear Redo. Inspector name, IPv4/CIDR (including removal) and interface UP/DOWN
changes each count as one operation, as do DNS client nameserver, additional
TCP/UDP ports, AP SSID and switch access VLAN changes. Invalid or unchanged
values keep Redo; reordering or repeating the same ports is unchanged.
Other network configuration changes clear both stacks.
Appearance, dock layout, ordinary traffic,
selection and simulation updates do not clear history. A valid import, New,
Demo, example or lab starts with empty history; invalid imports retain it.
Undo/Redo autosaves the resulting topology. Cables retain their IDs and exact
interface endpoints. Undoing device creation closes only that device's terminal
and discards its pending events; Redo restores its initial configuration, ID,
name, MAC addresses and position, without reopening its terminal. Other devices
and sessions remain running. Disconnecting a cable discards frames in flight;
Undo does not rewind simulation time, packets, caches or command output. A ping
can stop normally if its source loses its only route; restoring the cable does
not restart a command that has already ended.
Deleting selected devices is one operation, including all incident cables and
any separately selected cables. Undo restores their configurations, IDs, MACs,
names, positions, colors and exact cable interfaces/latencies. Restored devices
are fresh instances; their former terminals and commands stay closed. Unaffected
devices and sessions keep running. RIP restarts only after cabling is restored.
MACs and cable latencies are now also saved in autosave and exported JSON; older
files remain compatible. F5 restores the topology, without restoring history or
opening terminal sessions. A running lab check is cancelled on device deletion;
use Check again after restoration to obtain fresh results.
The shortcuts leave terminals, text inputs, editable areas and settings controls
alone. DHCP/DNS/HTTP server configuration, RIP, firewall and routes
remain outside history, as do terminal commands. Changing configuration through
a command still clears incompatible history.

Inspector name/address fields follow Undo/Redo and external changes without
remounting or losing focus. Unfinished text stays visible during normal traffic.
If a confirmed value changes externally while you are editing, blur/Enter discards
the outdated draft and shows the current value instead of overwriting it. Typing
again after that external change starts an intentional edit against the new value.
Nameserver, extra ports, SSID and VLAN fields use the same draft protection.
Changing an access VLAN (including Undo/Redo) discards MAC entries learned on
that port and lets traffic relearn them; unrelated entries are retained. It
does not restore an old MAC table or rewind packets or the simulation clock.

Use the compact **⚙ Settings** chip at the dock's upper-left edge (accessible
name: **Terminal settings**). It floats at the edge instead of using a toolbar
row or taking width from a terminal. Under **Layout → Organization**, choose
**Group by type** to use one panel per occupied type: Hosts, Servers, Routers,
then Firewalls. Sessions of the same type become tabs within that panel;
switching a tab changes only that panel. Empty groups disappear.
Changing modes keeps the same sessions, buffers, history, pending input and
running commands. Each mode remembers its own widths and locks in this browser;
without saved preferences it starts with equal widths. The organization mode is saved with the
topology (autosave and JSON export/import). Old files default to Free panels.
Opening a new topology also starts with Free panels. Sessions themselves are
not restored after reloading the page.

In **Free panels**, drag a tab's device name to reorder it within the strip, or
drop on another panel to append it there. The tab edge marker shows insertion
position; a panel outline shows the target. An emptied panel disappears.
During dragging, **+ New panel** appears at the right edge of the dock; drop
there to separate a tab from a panel containing multiple tabs. No empty space
is needed. Hold near a horizontal edge to scroll the dock or a crowded tab strip.
Neighbors slide into the proposed order as the pointer crosses their midpoint;
the order is committed only on drop. Escape cancels. Reduced motion disables
the transition.
Locks stay with panels; moving a tab does not transfer a lock. Free space is
redistributed with the existing 280 px minimum and horizontal scrolling.

In **Group by type**, tabs can only move within their own group. Initial group
order is Hosts, Servers, Routers, Firewalls; new tabs append to their type.
Red destination feedback means the drop is not permitted. Escape cancels a drag.

To reorder a **whole panel**, drag the dotted handle at the left of its header.
This works in both modes and moves all its tabs, width and lock together.
Click the handle (or focus it and press Enter/Space or Shift+F10) for **Move panel
left/right**. This is separate from moving an individual tab. Navigation shortcuts
follow the resulting panel and tab order. After a keyboard move, focus returns
to that panel's handle so you can continue navigating.

For keyboard access, focus a tab and press **Shift+F10** (or the Context Menu key).
The same move menu opens by right-clicking the tab name. Use Up/Down and
Enter/Space to move left/right, move to another panel, or create a panel when
allowed. Escape closes the menu and returns focus. Color and close buttons keep
their usual actions. Mouse drag/drop is supported; touch drag and long-press
context menus depend on the browser's native support. No touch-specific drag
library is required.

Manual membership and order are saved locally, separately for both modes,
against the current topology's device IDs and types. After F5, no sessions open
automatically: reopening matching devices restores their saved positions.
Sessions that have not yet been reopened remain absent from the dock. A
definitive close/delete forgets that session's saved placement in both modes;
opening it again is a fresh insertion. A new topology clears this arrangement.
These browser-local preferences are not part of the exported network JSON.

Use the chevron button at the upper right of the dock to **Collapse terminals**
or **Expand terminals** (also available with Enter/Space). Collapsing leaves a
34 px control bar and gives the freed height to the topology editor. It returns
keyboard focus to the editor; expanding restores focus to the active terminal
and restores the previous dock height, temporarily clamped for smaller windows.
Sessions stay mounted: commands, history, pending input, buffers and selection
are retained. Both organization modes, tabs, widths and locks stay unchanged.
Settings remains available on the collapsed bar.

Opening or activating a terminal expands the dock automatically. Collapse state
lasts while the current page has open sessions; it is not saved into topology
files or browser preferences. F5 keeps sessions closed and the chosen height
remains saved independently. No global Ctrl+backtick shortcut is installed;
the button remains accessible from the keyboard.

Drag the dock's top border to resize it. You can also focus that border and
use Up/Down (10 pixels), Shift+Up/Down (50 pixels), Home (minimum) or End
(maximum). The preferred height is remembered in this browser when storage is
available and adapts temporarily to smaller windows. In the tab bar, Left/Right
or Home/End moves keyboard focus; Enter/Space activates the focused terminal.

Use the small padlock at the right of a panel's header to **Lock panel width**
at its current pixel width, or **Unlock panel width**. Enter/Space also works.
The lock belongs to the panel, so changing its active tab keeps the same lock.
Opening or closing other terminals leaves locked widths fixed and redistributes
only the remaining space among free panels. New columns start equal free shares;
closing a column retains the surviving free proportions.

Drag a separator to adjust its two adjacent panels, whether free or locked.
The lock protects automatic sizing only: manual resizing updates the protected
pixel width and keeps the padlock closed. Other locked panels stay unchanged.
With a separator
focused, Left/Right adjusts 10 pixels, Shift+Left/Right 50 pixels, and Home/End
reaches the width limits. Double-click equalizes the adjacent pair, keeping their
locks. With all panels locked, unused space stays empty.
Panels keep at least 280 pixels of width. Narrow screens scroll
the dock horizontally instead of squeezing the terminals; opening or navigating
to a session brings its panel into view. If locks plus free minima exceed the
available width, locks remain unchanged and free panels keep their 280 px minimum.

Widths and locks use local browser storage, separately for Free panels and Group
by type; they are not exported with the network. After F5, sessions remain closed.
Reopening them restores Free panel slots by panel number, and grouped panels by
type, without changing the order in which you open devices. An empty panel loses
its saved preference when its final tab is explicitly closed or deleted. Storage
restrictions can prevent persistence; runtime locks still work. Dock height is
saved independently.

Press Escape while typing in a terminal to return focus to the topology editor.
The command continues running. Click a terminal or activate its tab to resume
typing. Escape inside an appearance popover only closes that popover.

Use **⚙ Settings** at the upper left of the dock and its **Appearance** section.
Choose a device under **Device color**, including devices
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
open sessions, organization mode, panel widths, dock height, history and running
commands. The color indicator remains a shortcut to Appearance; organization
is available in the central Settings menu. There are no placeholder options.

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
all panels**, following the current visual order: panels from left to right,
then each panel's tabs from left to right. Reverse navigation follows the exact
opposite order. Opening, closing, grouping or rearranging sessions updates this
order immediately. The activated terminal
receives focus; its input, history and running commands are retained. These keys
do not switch terminals while editing a field elsewhere in the app.
Ctrl+Tab / Ctrl+Shift+Tab also work **if the browser delivers them to the page**.
Ctrl+PageDown / Ctrl+PageUp are additional next/previous shortcuts under the
same browser restriction. Plain Tab and Shift+Tab do not switch sessions.
[Chrome reserves these combinations for its own tabs](https://support.google.com/chrome/answer/157179?hl=en),
so use Alt+Shift+Right/Left when they are intercepted. No browser settings or
keyboard-lock permissions are required; OS shortcuts and extensions can still
take precedence.

Browser validation: automated checks in Chromium 155 covered wrapped Unicode
selection, replacement/deletion, safe native-event paste, circular navigation,
focus restoration and isolation from other fields. Ctrl+Tab was also delivered
through automation, as were Ctrl+PageDown/PageUp in both organization modes;
this does not prove that a physical key press bypasses the browser's own tab
shortcuts. Vivaldi-specific handling is not required or assumed.

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
