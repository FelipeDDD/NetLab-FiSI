# Cable management

Right-click an edge (or focus it and press Shift+F10). The menu starts with
`Kabel umstecken`, then `Kabel entfernen`, a separator and the six manual colors.
Menu labels follow the existing German UI.

The menu freezes the chosen end when it opens. The first half of the actual SVG
arc-length path selects A; the second selects B. `cableEndAt` projects the click
onto samples of the complete rendered path after inverting its screen transform,
including curves and frontal segments. Keyboard invocation defaults to A and
anchors the menu at the path midpoint.

Moving an end starts a temporary preview. Click a device (or focus it and press
Enter) to use its first free compatible Ethernet interface in model order.
There is no interface chooser. Occupied ports, WLAN and self-connections are
rejected with a small status message while the preview remains active. Escape
cancels the entire operation. Clicking the pane keeps it available for another
target. Clicking the original device restores the exact original interface,
including on a single-port Host; this is a no-op for the engine and history.
Other occupied ports are not counted as free.
The four node Handles remain visual drag points, not physical interface IDs.

`CableManager.tsx` uses the existing `FloatingPopover`, `linkAttachment` and
`cableGeometry`. React Flow's `onEdgeContextMenu` opens the menu. Its native
edge updater is disabled: changing an edge's source/target alone cannot commit
the engine's interface ownership or preserve the Switch's artwork geometry.
The shared geometry used by normal edges and PacketLayer is unchanged.

`Network.reconnectError` preflights both endpoints using the same Ethernet
validation as `connect`. `Network.reconnect` commits synchronously on the
existing Link object: its ID, latency and opposite endpoint survive. A confirmed
move cancels in-flight deliveries on that link and invalidates affected ports'
MAC learning and interface-scoped ARP/pending resolution. Ordinary disconnect
and device disposal retain their previous behavior. IPv4 and VLAN settings are
not copied or deleted when moving a cable; changing subnets may require an
explicit DHCP renewal or IPv4 configuration.

The preview does not touch the simulation. Packet markers for this one link are
temporarily hidden rather than drawn along the cursor's uncommitted path; the
simulation and capture continue on the original connection. Confirming removes
old live markers and validates Guided hops against the new actual endpoints.

`deviceColors.ts` centralizes the existing device identity palette, applied as
CSS variables by `main.tsx` and shared with the minimap and automatic cable
assignment. Theme overrides for category text stay intact. Terminal preferences
are independent and are never used for cable identity.

`cableAppearance.ts` defines the six manual choices and automatic allocation.
New connections prefer the peer's category over Router/Switch/Firewall identity.
On Router/Firewall endpoints, colors already used by other incident links are
avoided: try the preferred color, then unused manual palette colors, then a
deterministic HSL candidate with moderate luminance and greatest RGB separation
from those already used. Existing links are never recolored to make room.
Colors are computed only for new connections or confirmed automatic reconnects.
Manual colors, including explicit gray, survive every reconnect. `Auto` in the
menu restores automatic mode through the same undoable color edit.

The store and existing topology presentation section `ui.cableColors` map each
link ID to `{ mode: 'auto' | 'manual', color: '#rrggbb' }`. No color field is added
to the network Link or protocol data.
JSON export, autosave, import and Share Link include this metadata. Old files
without it use the original edge appearance. Older palette-key values such as
`'purple'` migrate as manual choices with the same rendered color. Unknown colors
and orphan IDs are ignored. Diagram/configuration exports keep their
existing rendering; the topology JSON and Share Link carry cable colors.

Color changes, confirmed reconnects and removal use the existing topology
history. Reconnect history includes exact before/after color and mode, rather
than reallocating on replay. Deletion snapshots retain colors. Runtime MAC,
ARP and packet snapshots are never restored by Undo.

`interfaceCableColor` supplies the same stored color to edges, RJ45 tips,
interface markers next to the canvas addresses and Inspector interface names.
The original functional green/amber/gray status stripe and UP/DOWN text are
preserved; neighbor names retain category identity. Disconnected markers are
neutral. No address, VLAN, subnet or device identity is inferred from a color.

WLAN associations can be colored or removed through this menu, but their
endpoints are changed through the existing WLAN settings rather than an
Ethernet cable operation.
