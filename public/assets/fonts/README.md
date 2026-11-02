# Terminal fonts

These are unmodified upstream WOFF2 binaries. Each family includes Regular (400)
and Bold (700) and its original SIL Open Font License notice. Other weights and
italics are not bundled; the browser may synthesize italic text.

| Family | Upstream source / pinned revision | Local directory |
|---|---|---|
| JetBrains Mono | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono/tree/19371302b95d218af43299bce79ddbddd0bc364d/fonts/webfonts) | `jetbrains-mono/19371302/` |
| Fira Code | [Official 6.2 release](https://github.com/tonsky/FiraCode/releases/tag/6.2), `woff2/` in `Fira_Code_v6.2.zip`; [license at that tag](https://github.com/tonsky/FiraCode/blob/6.2/LICENSE) | `fira-code/6.2/` |
| IBM Plex Mono | [IBM/plex](https://github.com/IBM/plex/tree/71f558992315a12ca1f06a2215d57962a1992162/packages/plex-mono/fonts/complete/woff2) | `ibm-plex-mono/71f55899/` |
| Source Code Pro | [adobe-fonts/source-code-pro](https://github.com/adobe-fonts/source-code-pro/tree/803b7e23ec97ae58b6232ea76519a76d428ba268/WOFF2/TTF) | `source-code-pro/803b7e23/` |

Consolas is a local system font. No Microsoft font files are included, converted
or downloaded by NetLab. When local Consolas is unavailable, the terminal loads
the JetBrains Mono files above without changing the saved `consolas` choice.

Preserve the license files alongside the binaries when distributing or updating
these assets. Use a new version directory on updates so browser caches cannot
confuse old and new font bytes.
