# Packet presentation and experimental device actions

## Simplified public controls

The toolbar keeps Run/Pause and Packets. It no longer exposes the simulation
clock multiplier. Packet settings and the movable packet widget expose only:

- **Live:** 200 ms/link, parallel independent transmissions with causal ordering.
- **Schrittmodus:** 1000 ms/link, existing ARP/ICMP observation, playback Pause,
  Step and Replay. The internal mode ID remains `guided`.

The shared duration constants remain `PACKET_ANIMATION_BASE_MS` in
`src/packetAnimation.ts`. Both clocks initialize at 1x. Packet speed previously
read a global localStorage preference; hiding its slider alone would have left
an invisible multiplier. Store initialization and legacy boot now use the
existing default of 1 instead. Old preference keys/values are not deleted or
rewritten. No topology document, session schema or Save/Load behavior changed.

Technical `setSpeed`, `setPacketAnimationSpeed`, normalization, legacy preference
helpers and retiming remain available internally. No Scheduler, ping interval,
packet capture, protocol or command Run policy was changed. Public controls do
not invoke those multiplier setters. Guided playback Pause is still separate
from Run/Pause of the network clock; Step/Replay never synthesize network packets.

Main files: `Toolbar.tsx`, `PacketAnimationControl.tsx`, `GuidedPacketControls.tsx`,
`store.ts` and the corresponding compact widget rules in `styles.css`.

## Action-placement comparison, awaiting user choice

No definitive placement is selected. Without a parameter, the current button
position remains the reference. Append one of these to the normal app URL:

```text
app.html?deviceActions=current
app.html?deviceActions=a
app.html?deviceActions=b
```

Other URL parameters can coexist. Nothing is persisted in Settings or topology
documents. `src/deviceActions.ts` validates the experimental parameter.

**A:** Terminal and Ping preview inline before the device name, immediately
below the sprite and above IPv4. The caption's bounded zoom compensation applies
to the actions as well. Buttons are 17px so at low zoom compensation they do not
reach the existing bottom Handle. This stays inside the caption area, but
shifts the text of the name right within the centered name/action row and leaves
less width for unusually long names.

**B:** a small vertical pair outside the lower-left side of the asset, aligned
to its bottom. Bounded scaling grows upward/leftward; the right edge stays clear
of the left Handle and the bottom stays above the name/IP caption. It preserves
the centered name but needs extra left-side clearance in dense topologies.

Provisional recommendation: **A** for compact networks with many devices; B is
a reasonable alternative if keeping names centered matters more. Both remain
available for user comparison, with the existing placement active by default.

`DeviceActions.tsx` reuses the existing Terminal handler and a shared icon.
The Ping button is focusable, marked `aria-disabled`, and explicitly described
as unavailable preview. It has no network handler. Click/keyboard events cannot
start a ping or drag/select another device. Devices without terminals do not
gain fictional Terminal controls.

Only UI markup/CSS changes: real sprites, four Handles, node dimensions,
cable attachment geometry, interfaces, sessions and saved positions are kept.

## Validation and screenshots

```powershell
node scripts/test-device-actions.mjs
node node_modules/vitest/vitest.mjs run src/terminals.test.ts src/components/GuidedPacket.test.ts src/packetAnimation.test.ts src/guidedPacket.test.ts src/deviceActions.test.ts src/App.test.ts src/canvasNetwork.test.ts src/deviceArtwork.test.ts
npm run build
git diff --check
```

The native Chromium runner reuses the disposable profile/IndexedDB harness. It
captures current/A/B at 0.75/1x, Graphite Dark/Classic Light, normal/hover/selected,
with actual Linux and Windows sprites plus Notebook, Switch, Router and Server.
It verifies identical sprite/node/Handle rectangles and viewport, Ping preview
without traffic, Terminal by real pointer and Enter, focus, 700px/0.5x clearance,
and the floating widget. A real two-request ping in Schrittmodus retains its
1000ms simulated interval, with Step/Replay and no extra attempts.

All 39 captures and measurements are ignored under
`.playwright-mcp/reviews/raw/device-actions-staging/`. The existing Visual Review
generator publishes a curated set and archives the previous review, preserving
sources and offering the complete offline gallery for every state.
