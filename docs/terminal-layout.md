# Terminal panel distribution

`terminalPanels.ts` defines the visual limits: five columns and a 220px minimum
width. In Free panels, opening another session adds a normal tab to the last
column when all five columns exist. Group by type retains each session in its
device group's tabs. Sessions, buffers, commands and input remain owned by the
existing terminal registry. The existing tabs, navigation shortcuts and move
menus provide access to additional sessions. A tab can be split again once a
column is available; no path creates a sixth column.

Changing the number of columns (open, close, split, merge or device deletion)
equalizes only unlocked weights. Adding/closing/switching a tab within an
existing column does not redistribute it. Normal manual resizing remains in
effect until the next structural change or explicit distribution request.
**Terminal Settings > Layout > Gleichmäßig verteilen** calls the same helper.
It is disabled when fewer than two columns are unlocked.

The existing locks are per panel and protect fixed pixel widths against
automatic changes. Manual divider movement, including a divider beside a locked
panel, still intentionally updates that width. Equalization leaves all locked
widths intact and shares the remaining space between unlocked columns. If the
minimum widths or the locks exceed the available area, only the terminal region
scrolls horizontally. All-locked layouts may leave unused space; the dock height
is independent of this distribution.

Widths and locks continue to use the existing local preference system and are
remembered independently for Free panels and Group by type. Legacy tab layouts
with more than five columns keep their first five slots; remaining tabs fold
into the fifth slot without being discarded. Opening a topology still does not
automatically reopen terminal sessions, matching the existing behavior.

`TerminalDock` memoizes width allocation. It does not continuously rewrite
weights. The existing `ResizeObserver` / animation-frame coalescing and FitAddon
refit visible xterm hosts after their size changes. Hidden tabs refit when shown;
sessions are not recreated by distribution or tab changes. Console appearance,
network configuration and topology history are unchanged.
