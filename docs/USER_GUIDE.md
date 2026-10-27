# NetSim user guide

NetSim is a network simulator that runs entirely in your browser. Build a
network by dragging devices onto the canvas and cabling them together, open a
terminal with **Linux commands or a Windows CMD subset** on hosts, and
watch packets travel between them. Nothing to install; nothing is sent to a
server.

Live app: <https://netsim.borck.education/>

> In-app, the `help` command in any terminal lists the supported commands.
> This guide is the bigger picture: the interface, the workflow, and what the
> tool does and doesn't simulate.

## The interface

The manual Save/Load and plan-tab interface is currently available only in an
isolated test environment. The normal app still follows the existing workflow
described here; it does not automatically migrate browser data. Developer review
instructions and screenshots are described in [workspace-ui.md](workspace-ui.md).

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
  Hosts use three tabs: **Allgemein** (name, OS and live network summary),
  **Netzwerk** (the existing IPv4 form, expandable routing/ARP/DNS sections and
  advanced services/ports), and **Sicherheit** (NetLab simulated packet filter,
  conntrack, logs and configuration copy). Windows hosts use the same simulated
  filter; its nftables representation/export is not Windows Defender Firewall.
  Left/Right arrows and Home/End navigate the focused tab bar. Selecting another
  host starts on Allgemein. Pages remain mounted during tab changes, preserving
  drafts and the IPv4 500 ms autosave; leaving a field still commits only a valid
  complete form. Incomplete drafts survive returning to the tab. Delete device
  stays below the pages; terminal access remains on devices and in the dock.
  On Allgemein, **Bearbeiten** opens the existing IPv4 editor inline for that
  interface. There is one editor instance, moved between this slot and Netzwerk;
  its draft, debounce and validation survive the move and closing the quick view.
  **ARP-Tabelle** expands the current neighbor table; **Terminal** opens or focuses
  the existing device session. Gateway/DNS summaries identify interface-owned
  Static/DHCP options, independent explicit routes, and the global DNS override.
  An effective value from a route or override is not copied into the interface's
  empty fields. If a route and interface option share the same gateway, both
  ownership labels remain visible; this does not create another route. Legacy
  files have no provenance beyond their saved configuration: a saved explicit
  route/global DNS remains labeled as such, without guessing its earlier origin.
  **ARP-Tabelle**, **Routing-Tabelle** and **MAC-Tabelle** use structured live
  tables. Interface/type/metric details sit beneath each entry when extra
  columns would be cramped. ARP age means time since its last update, not a
  remaining lifetime; the MAC table has no simulated age. Default routes show
  `0.0.0.0/0`, and metrics appear only when supplied by the engine. Tables can
  be focused with Tab and scrolled with the keyboard; full addresses wrap
  without truncation. Large tables scroll vertically within a compact area.
  Servers use **Allgemein**, **Netzwerk**, **Dienste** and **Sicherheit**.
  Allgemein shows the name, interface addresses/states and live DHCP/DNS/HTTP
  status. Compact on/off switches with **AN/AUS** labels on Allgemein use the same DHCP/DNS/HTTP
  actions as Dienste, including Undo/Redo and autosave. Disabling a service
  preserves its configuration; disabling DHCP does not remove client addresses.
  **Bearbeiten** opens the existing interface editor in Netzwerk;
  **Dienste bearbeiten** opens the service page. Netzwerk also keeps routing,
  ARP, global DNS override and forwarding information in expandable sections.
  Dienste preserves DHCP/DNS/HTTP editors and additional TCP/UDP ports;
  Sicherheit contains the existing nftables rules, configuration copy,
  conntrack and logs. All four pages stay mounted to preserve drafts and
  IPv4 autosave. Server tabs use 2 + 2 at narrow widths and one row at 460 px.
  Blue info tooltips in Sicherheit explain nftables, INPUT/OUTPUT/FORWARD,
  Quelle/Ziel and Conntrack on hover, keyboard focus or click/touch. Delete
  device remains below the pages; terminal access stays on devices and in the
  dock, without a duplicate Inspector button. Server devices
  currently use the existing Linux shell; OS selection applies to Hosts only.
  Routers use **Allgemein**, **Interfaces**, **Routing**, **Dienste** and
  **Firewall**. Allgemein summarizes connected peers, IPv4, UP/DOWN, forwarding
  and RIP. **Bearbeiten** opens the selected interface's existing IPv4 editor;
  interface sections can be collapsed.
  Router Allgemein also offers the same DHCP/DNS/HTTP quick switches; advanced
  configuration stays in Dienste. Router and Server summaries show a physical
  connection indicator and peer name separately from **Admin: UP/DOWN**.
  Green means a cable exists and both modeled endpoints are UP, not guaranteed
  IP reachability. A cable with a local or remote DOWN endpoint is shown in a
  muted amber state; no cable and unknown status use neutral text. Each IPv4
  address belongs to its own interface. Inspector data
  and device-list descriptions use at least 12 px; terminal font settings remain
  independent.
  Switches use **Allgemein**, **Ports**, **VLAN** and **MAC-Tabelle**. Allgemein
  summarizes attached cables, configured port VLANs and learned MAC count;
  unused ports collapse into a compact section. Ports shows each real port,
  its peer/link state, administrative UP/DOWN, MAC address and access VLAN.
  **Bearbeiten** opens that port; **VLAN bearbeiten** focuses its existing VLAN
  editor. VLAN allows IDs 1–4094 on every port, including unplugged ports,
  with VLAN 1 as default. Blue help explains access VLANs and the simulated
  untagged frames. There is no trunk or 802.1Q-tag configuration in the engine.
  MAC-Tabelle uses the live shared MAC/VLAN/Port table. Learned entries are
  runtime data and are learned again after reloading. All pages remain mounted
  during tab changes. The L2 Switch has no functional IPv4 configuration;
  its administrative and VLAN edits retain Undo/Redo and autosave. AP settings
  remain unchanged.
  On Routers, **Routing** contains the live routing/ARP
  tables and RIP switch; static routes still use terminal commands. Firewall
  contains nftables, conntrack and logs. Dienste keeps DHCP/DNS/HTTP servers,
  extra TCP/UDP ports and the global DNS override. All pages remain mounted
  during tab changes, preserving drafts and IPv4 autosave. Selecting another
  router starts on Allgemein. Arrow keys and Home/End navigate the tab bar;
  toolbar **Settings → Inspector layout · Experiment** offers three local,
  immediately applied comparisons: **A / Kompakt** (290 px), **B / Ausgewogen**
  (340 px), and **C / Breit** (470 px), plus **Benutzerdefiniert** for a saved
  custom width. Drag the Inspector's left edge to resize between 290 and 470 px;
  this selects the custom mode without snapping to presets. Double-click the
  edge to restore B. Focus the edge with Tab: Left/Right adjust by 5 px (20 px
  with Shift), Home/End select the width limits. Without a saved preference,
  B is the provisional default; previous preset preferences remain valid.
  Router tabs use two aligned rows (3 + 2), switching to one row when the
  displayed Inspector reaches 460 px. Hosts keep three tabs on one row.
  The chosen mode and custom width persist locally, separately from topology
  exports. Selecting a preset preserves the last custom width for later reuse.
  Resizing preserves mounted pages, active tabs and form drafts. On windows up
  to 700 px wide the Inspector overlays the map to keep the canvas laid out.
  Its displayed width is capped to the window without overwriting the saved
  width; the original width returns when the window grows again.
  Every routing table has one Routentyp
  info button explaining Connected, Static and RIP. Hover or keyboard focus opens
  the help without moving focus; click/touch keeps it open. Escape or an outside
  interaction dismisses it. Hosts retain their directly connected routes too.
- **Terminal dock** (bottom): double-click a host/router/server/firewall to
  open its terminal, or use the small terminal button revealed when hovering
  or keyboard-focusing the device. In **Free panels**, each new session creates
  an independent side-by-side panel, unless a saved manual arrangement specifies
  its destination. At most five columns are shown, each at least 220 px wide;
  additional sessions become tabs in the last column. The dock scrolls
  horizontally when needed. Each panel has its own selected tab,
  device label and close buttons. Combine tabs manually when useful.
  Opening an existing session activates its tab and focuses its input.
  Switching tabs keeps history and running commands. Closing a tab ends only
  that session; an empty panel disappears and the other panels expand.

When terminals are expanded, the right Inspector keeps the full height below
the header and can overlap the dock. Click or focus a control in either
panel to bring that panel to the front; scrolling and hovering do not change
priority. Scroll still works over the visible portion of a covered panel. To recover the
Inspector, use its visible upper area. To recover the dock, use its visible
top strip to the left of the Inspector, then click the desired terminal.
The existing height, column widths, sessions and Inspector scroll stay intact;
changing priority never pans, zooms or fits the topology. Priority is temporary
and is not restored after F5. Packets analysis retains its current scrolling
layout as a fallback. See [terminal layout](terminal-layout.md).

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
alone. Firewall and route edits remain outside history, as do terminal commands. Changing configuration through
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

DHCP, DNS and HTTP server settings also support Undo/Redo. Enabling an absent
server creates its defaults; Undo removes that configuration, and Redo recreates
the same defaults. Existing servers keep their configuration when enabled or
disabled. DHCP range, advertised router/DNS, DNS A records, HTTP port and response
body each commit as one edit. Multiline textareas commit on blur, allowing Enter
to add lines. DNS names are case insensitive; record order, comments and spacing
do not create edits when the resulting records are unchanged. Duplicate names
retain the last value, matching the existing editor validation.

DHCP leases are runtime state: editing fields or enabling/disabling an existing
server preserves current leases. Removing a newly created configuration discards
its leases; Redo starts a fresh empty lease table. Client addresses, cached
answers, open connections, transmitted packets and pending traffic are not
rewound or replayed. Service inputs and textareas use the same stale-draft
protection as the basic Inspector fields.

The DHCP server reserves pending offers separately from confirmed leases, so
simultaneous clients cannot receive the same offer. Before offering an address,
it sends ARP checks on the receiving interface (up to three probes, 500 ms apart).
If another MAC answers, it tries the next address. These frames appear in Packet
Inspector and respect actual links, VLANs and delivery times. This also protects
addresses retained by online clients after reloading/importing a topology, when
the server's runtime lease table starts empty. Pending offers expire after 30
simulated seconds; invalid/conflicting REQUESTs are not acknowledged. Probe timers
use the existing device lifecycle and cannot send offers after device removal.

This is conflict detection, not a guarantee against all duplicate IPs: an offline
machine or an answer arriving after the probing window cannot be detected. Keep
static addresses outside the DHCP pool. Manually assigning the same IP still
creates a real configuration error; pinging your own address succeeds locally
and does not establish that another machine with that address is reachable.

The Inspector's RIP checkbox also supports Undo/Redo. Only the enabled setting
is restored: disabling RIP cancels its periodic announcement and clears learned
RIP routes; enabling it starts one announcement cycle and lets routes converge
again. Other routers and running terminals keep working. Packets already in
flight, caches and simulation time are not rewound. External incompatible
configuration changes still clear history.

**Ping-Animation** appears automatically near the bottom of the canvas when a
terminal ping or Quick Ping creates its first ARP/ICMP animation. A single slider
selects **Langsam (0.5×)**, **Normal (1×)** or **Schnell (2×)**. At Normal, the dot
takes 200 ms per link. Changing speed keeps its position and affects only ping
presentation, with no change to protocol timing, RTTs or captured timestamps.

The newest ping command is followed automatically, showing one ICMP attempt at
a time: its request path, its reply path, then the next attempt. ARP broadcast
branches leave the switch in parallel on their actual eligible links, within
the VLAN. A missing reply
is never invented; the player can proceed after the real attempt ends or times
out. Other commands keep running and Packet Inspector captures independently.
The existing ARP/ICMP observer and cable geometry are reused.

The bar stays between requests of a continuous ping and disappears three seconds
after the command and its queued animation finish. Its close button hides only
the controls; the animation and command continue. The next ping can show the bar
again. Local ping or a command with no link transmission opens no empty controls.
There is no public Live/Guided/Schrittmodus selector, Replay menu or draggable
animation widget. Normal animation of other traffic remains available outside
the focused ping. Run/Pause still controls the network clock separately.

Only the current attempt and one pending attempt are kept for presentation;
continuous slow playback replaces an unstarted attempt with a newer one.
Ctrl+C discards unstarted attempts and lets the current attempt finish,
including its reply if one was really observed. Network packets and terminal
results remain unchanged. An active command started after automatic session
restoration starts Run; an explicit manual Pause stays in effect and the
terminal briefly reminds you to click Run.

The bounded visual queue can omit hops during overload; the bar then shows
**Animation gekürzt · Details in Packets**. Packet Capture is unaffected.
Changing plans clears temporary playback; F5 does not reopen terminal commands.
Speed is a runtime preference and is not stored in a saved plan or restored from
old hidden preferences.

Use **Packets** in the main toolbar to open or close the Packet Inspector.
While open, the device palette temporarily gives its space to the selected
device Inspector on the left, with the canvas in the centre and Packets on the
right. Use **⇄** in the Packet Inspector header to invert the sides, placing
Packets on the left and the device Inspector on the right. The preference is
saved locally; closing Packets always restores the normal layout.
Selecting a device still opens its configuration without closing Packets.
The same device Inspector stays mounted, preserving its active tab, IPv4 drafts
and preferred width. Its resize handle moves to the right edge while on the left.
Closing Packets restores the normal palette and right-hand device Inspector.
Opening or closing does not change capture, device selection or running terminals.
The **Compact / Full** selector uses the same records, selection and details.
Compact shows Time, Protocol and Summary; Full retains all six original columns.
It does not change packet data or interpretation. Full is the initial default.
Drag Packets' inner edge to resize, or focus its handle and use Left/Right
(5 px, or 20 px with Shift), Home/End. Compact and Full remember separate widths
(initially 370 and 600 px), independently of the device Inspector preference.
Widths start at 300 px, with maxima of 680 px for Compact and 800 px for Full when space permits, with at least 280 px reserved
for the canvas in the three-column layout. Larger saved widths are temporarily
capped when space is insufficient and return when the window grows. In the
two-row layout a narrower packet panel can leave unused space between panels.
At widths up to 1100 px the canvas sits above the two panels; up to 700 px the
canvas and panels stack vertically with scrolling. Panels have their own scrolling,
and the existing packet table may require horizontal scrolling to read all columns.
The terminal dock stays accessible. Close Packets with its × button, the toolbar
button or Escape while focused inside the panel.

**Start capture** begins a new global trace; **Pause capture** freezes collection
without pausing the simulation, and **Resume capture** continues it. **Stop capture**
retains the trace; starting again clears it. **Clear records** removes the trace
without changing capture status. The counter shows up to 1,000 retained records
and how many were discarded by the limit. Captures are in memory only and reset
when a different topology is loaded or the page is refreshed.

The table shows simulated time, protocol addresses and a summary, 50 rows per
page. The Link column shows the neighbours recorded at transmission time, even
if they have since been renamed or removed. Select a row or activate its time button to inspect Ethernet, ARP/IPv4,
transport and application fields. Link neighbours and interfaces appear in
details, separately from IP/MAC addresses. Click the selected row again or use
the details' × button to return to the list. Reopening the main panel also returns
to the list, keeping captured records and the list position. HTTP bodies are inert text. Missing
wire fields are not invented; truncated captured text is marked. These records
describe transmissions, not guaranteed delivery. Expired selections show a notice.
**Follow Live** starts enabled for a new capture and follows the latest page and
its newest rows. Previous/Next, scrolling upward, or selecting a packet suspends
following without stopping capture. A counter shows new arrivals while you read,
including when older records are evicted at the 1,000-record limit. **Jump to
latest** returns to the newest page, closes packet details and resumes following.
Pause/resume capture preserves the follow setting. Pagination shows **Page X of Y**
and the retained record range, with the same 50-row page limit. Cable capture controls and
protocol filters are not part of this first interface.

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
color at the lower right, **Dual Glow** for a subtle upper-left light and a
stronger lower-right light with a dark center, or **Aurora Lines** for soft curved
bands blending the device color with indigo over a nearly black base. Aurora
also adds a fine 1 px accent below the tabs, following the active device's color;
the existing colored tab borders remain. These original backgrounds are static CSS, with
no images, animations or blur filters. **Aurora Flow** adds overlapping ambient
lights across the background and two fine curved wave crests. Its three-color
palette combines the device color with cyan/violet (hosts), amber/violet
(routers), magenta/purple (firewalls) or teal/blue (servers). Customized device
colors remain the primary light. **Intensity** ranges from 0 to
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

Choose an effect family in **Background style**, then a **Variation** when more
than one is available: **Aurora** offers Soft/Balanced, **Aurora Lines** offers
Subtle/Flow/Spectrum, and **Signal / Wireframe** uses Matrix. Single-variation
styles hide the second selector. Diagonal, Dual Glow, Aurora Lines and Aurora
Flow remain under **Original styles**; that group distinguishes the original
Aurora Lines from the newer family with the same name.

**Show experimental styles** reveals Aurora Vivid, Signal Minimal/Pulse and the
three Gradient Mesh presets (Ambient, Prism, Deep Glow). It starts unchecked
each time the settings open. A selected experimental preset always remains
visible, even when this checkbox is off, including after import or reload.
Hiding experiments never replaces the selected background. Existing preset IDs,
intensity and device colors are preserved. Changes apply immediately without
resetting sessions. See the
[comparisons and visual assessment](TERMINAL_EFFECTS_LAB.md).

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

Left/Right move within the command; Home/End jump to its start/end. Typing or
pasting inserts at the cursor. Backspace removes the previous character and
Delete removes the next, without touching the prompt. Up/Down browse command
history and restore your partially typed command and cursor when you return
to the newest entry. This works in both Linux and Windows terminals, including
visually wrapped input and after resizing or moving terminal columns.

Ctrl+A (Cmd+A on Mac) selects only the command currently being edited, with
xterm's visible selection highlight. The prompt and previous output are excluded,
including for Unicode and visually wrapped commands. Backspace/Delete clears the
selected command; typing or pasting replaces it. Enter executes it unchanged.
An empty line or a running command has no editable command to select. Ctrl+C
continues to copy a selection, or interrupt a command when nothing is selected.

To clear learned ARP mappings, use `ip neigh flush all` or
`ip neigh flush dev eth0` in Linux; in Windows, use `arp -d *` or
`arp -d 192.168.1.20`. Display them with `ip neigh show` or `arp -a`,
respectively. The Inspector's **ARP-Cache leeren** button clears only the
selected device's cache, including while paused. The next ping resolves the
neighbor again through real ARP Request/Reply packets. Interface settings,
DHCP leases and switch MAC tables stay intact. Only dynamic IPv4 mappings are
modeled; static entries and additional filters are unsupported. See
[ARP cache contract](arp-cache.md).

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

## Linux and Windows hosts

**New hosts** in the device palette selects Linux, Windows or Mixed. Mixed makes
one approximately 50/50 choice when each host is created. It does not guarantee
equal totals in a small topology. The creation preference is local to this browser;
the OS of each existing host is saved in the topology, autosave and JSON exports.
Old files without an OS load as Linux, regardless of the creation preference.
The small Linux/Win badge identifies hosts without changing their device type.

The Inspector's **Operating system** selector changes an individual host and
supports Undo/Redo. It does not reboot the device or replace its terminal. An idle,
empty prompt updates immediately; an active command, typed draft or selected text
is preserved and the new profile applies at the next prompt. A selection alone
does not bind the next new command to the old OS: typing adopts the current
profile. A draft already being edited and a running ping keep their original
syntax and output until completion or Ctrl+C. Other device types
retain their Linux command interface. Existing examples and Labs remain Linux.

Windows hosts use a simulated CMD prompt (`C:\>`) and case-insensitive command
names, Windows syntax, output, errors and ping statistics. They support:

| Command | Behavior |
| --- | --- |
| `ipconfig`, `ipconfig /all` | Actual IPv4/mask, gateway, MAC and configured DNS |
| `ipconfig /renew` | DHCP discovery/request using the existing simulator client |
| `arp -a`, `route print` | Actual ARP cache and IPv4 routes |
| `ping host` | Four attempts by default |
| `ping -n N host`, `ping -t host` | Explicit count or continuous until Ctrl+C |
| `tracert host` | ICMP TTL probes, three per hop, up to 30 hops |
| `nslookup host` | A lookup through the configured DNS server |
| `hostname`, `cls`, `help` | Host name, clear screen, supported command help |

Linux-specific commands and flags are rejected by the Windows shell; Windows-only
commands and flags are rejected by Linux. The xterm renderer, colors, backgrounds,
selection/copy/paste, history, panels and shortcuts work with both profiles.
Windows and Linux use the same network stack and can communicate normally.
Packet Inspector and Ping-Animation observe the same real simulated transmissions.

This is a CMD subset, not a Windows VM or a complete command interpreter. There is
no PowerShell, netsh, file system, piping or scripting. The engine does not model
ICMP payload sizes or Windows interface indices; these are not fabricated in
Windows output. RTT/TTL are measured from the simulation (including its existing
two-second ping response timeout), not an emulation of Windows kernel defaults.
`/renew` and `/release` act only on adapters explicitly configured for DHCP.
An optional adapter name limits the operation (for example `ipconfig /renew eth0`).
`/all` reports the actual DHCP mode. Automatic lease renewal/expiration is not modelled.
JSON round-trips preserve OS identity; Linux configuration/container exports remain
Linux-oriented and do not provision a real Windows environment.

## IPv4 configuration per interface

The Inspector's **IP-Adresse automatisch beziehen (DHCP)** checkbox selects DHCP
independently of the host OS. Assigned values are read-only; **DHCP erneuern**
requests a lease. Checking the box alone does not invent an address or start a
command. Unchecking it clears the interface-owned values and shows an empty
manual form in Unconfigured mode. Existing Static/DHCP/Unconfigured modes are
preserved when opening the Inspector or loading a file.

Manual fields are **IP-Adresse**, **Subnetzmaske**, **Standardgateway** and
**DNS-Server**. An address such as `192.168.1.10/24` fills the decimal mask
automatically. The mask also accepts `/24`, a bare prefix or a contiguous dotted
mask. All IPv4 prefixes `/0` through `/32` are supported. Editing the mask after
entering CIDR makes the mask field authoritative. Gateway and DNS are optional;
the gateway must be in that interface's subnet.

The complete valid configuration is applied after 500 ms without typing, or on
leaving a field. There is no Apply button. Incomplete/invalid forms remain as
drafts without changing the network. Clearing gateway or DNS removes that option;
an entirely empty manual form means Unconfigured. Saved text keeps its formatting
while typing, preserving the cursor. External changes cannot be overwritten by
an obsolete draft: it remains visible while editing and is discarded with a
message on blur. A clean form reflects Undo/Redo and terminal changes immediately.

Consecutive confirmations during one focus visit to the manual form form one
Undo/Redo operation. Leaving the form, changing modes, another history edit, or
Undo/Redo breaks the group. Undo/Redo restores configuration, not a historical
DHCP lease or a command that was cancelled. The debounce is local to this form;
other Inspector editors keep their existing behavior.

On Windows, `ipconfig /renew` preserves static and unconfigured adapters.
`ipconfig /release` clears DHCP-owned address/options and sends RELEASE for a
known lease. On Linux, explicitly running `dhclient eth0` switches that interface
to DHCP immediately, cancelling any previous acquisition on it. A failed request
leaves the interface in DHCP mode without inventing a new address. Renewing an
existing configuration retains its previous address until a successful ACK or
explicit release. Changing mode cancels pending DHCP callbacks.

Each interface owns its gateway and DNS options. Renewing replaces those options,
including clearing an option omitted by the server. These gateways participate in
the existing route lookup; independent explicit static routes are preserved.
The pre-existing device-wide **DNS client (global override)** remains an explicit
override. With no override, the resolver uses the first up, addressed interface
with a DNS option, in interface order. This is a simplified resolver policy, not
per-application or split DNS. Fields in the DHCP section show received options,
not the global override or independent routes.

JSON/autosave preserve modes, addresses and interface-owned options. Loading them
does not resume DHCP commands or fabricate active leases: saved values are marked
**Kein aktives Lease (gespeicherte Werte)** until renewed. Old files without mode
metadata infer Static for an existing address, otherwise Unconfigured. The same
rule preserves legacy addresses and independent routes/DNS without guessing their
origin. Terminal commands remain outside Undo/Redo and invalidate incompatible
history; Inspector configuration changes are atomic history entries.

The simulator still supports one IPv4 address per interface. Lease expiration and
automatic renewal are not simulated. RELEASE uses the existing broadcast DHCP
transport and the recorded server/IP/MAC to release only the matching allocation;
other servers and leases are not cleared. Linux/container configuration exports
remain snapshots of effective addresses/routes rather than a DHCP client manager.

## Commands (the supported Linux subset)

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
- **Router DHCPv4 service:** `systemctl start|stop|status kea-dhcp4-server`
  controls the same global switch as **DHCP-Server global aktivieren** in
  Inspector → Dienste. Pool flags/settings and current leases are retained;
  links remain UP. A disabled individual pool stays disabled after global Start.
  This is a Linux service-control subset, not Cisco IOS or DHCP Relay.
  See [global DHCP](global-dhcp.md) for persistence and command scope.

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
