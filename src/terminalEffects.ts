// Original, static SVG compositions. No renderer, timers, external resources or
// protocol state: the image is painted behind xterm like any other background.
export const TERMINAL_EFFECT_GROUPS = [
  { label: 'Aurora', presets: [
    { id: 'fx-aurora-soft', label: 'Aurora Soft' },
    { id: 'fx-aurora-balanced', label: 'Aurora Balanced' },
    { id: 'fx-aurora-vivid', label: 'Aurora Vivid' },
  ] },
  { label: 'Aurora Lines', presets: [
    { id: 'fx-lines-subtle', label: 'Lines Subtle' },
    { id: 'fx-lines-flow', label: 'Lines Flow' },
    { id: 'fx-lines-spectrum', label: 'Lines Spectrum' },
  ] },
  { label: 'Signal / Wireframe', presets: [
    { id: 'fx-signal-minimal', label: 'Signal Minimal' },
    { id: 'fx-signal-pulse', label: 'Signal Pulse' },
    { id: 'fx-signal-matrix', label: 'Signal Matrix' },
  ] },
  { label: 'Gradient Mesh', presets: [
    { id: 'fx-mesh-ambient', label: 'Mesh Ambient' },
    { id: 'fx-mesh-prism', label: 'Mesh Prism' },
    { id: 'fx-mesh-deep-glow', label: 'Mesh Deep Glow' },
  ] },
] as const;
export type TerminalEffectId = typeof TERMINAL_EFFECT_GROUPS[number]['presets'][number]['id'];
const effectIds = new Set<string>(TERMINAL_EFFECT_GROUPS.flatMap((group) => group.presets.map((preset) => preset.id)));
export function isTerminalEffect(value: unknown): value is TerminalEffectId {
  return typeof value === 'string' && effectIds.has(value);
}

// Callers supply luminance-limited colors. Normal alpha compositing keeps all
// overlaps within that same contrast budget. Invalid colors cannot inject SVG.
export function terminalEffectBackground(style: TerminalEffectId, palette: readonly string[]): string {
  const colors = [0, 1, 2].map((i) => /^#[0-9a-f]{6}$/i.test(palette[i] ?? '') ? palette[i] : '#06080c');
  const [primary, secondary, tertiary] = colors;
  const defs = `<defs>
    <!-- Only the broad light ribbons are feathered, once during image rasterization.
         This bounded SVG filter never processes xterm, text, or animated frames. -->
    <filter id="feather" x="-15%" y="-35%" width="130%" height="170%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="12"/></filter>
    ${colors.map((color, i) => `<radialGradient id="g${i}"><stop stop-color="${color}"/><stop offset=".35" stop-color="${color}" stop-opacity=".75"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`).join('')}
    <radialGradient id="shade"><stop stop-color="#06080c"/><stop offset="1" stop-color="#06080c" stop-opacity="0"/></radialGradient>
    <linearGradient id="silk" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop stop-color="${tertiary}" stop-opacity="0"/><stop offset=".28" stop-color="${tertiary}" stop-opacity=".2"/>
      <stop offset=".52" stop-color="${secondary}" stop-opacity=".9"/><stop offset=".67" stop-color="${primary}" stop-opacity=".5"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="thread" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0"><stop stop-color="${secondary}" stop-opacity="0"/><stop offset=".2" stop-color="${secondary}"/><stop offset=".53" stop-color="${primary}"/><stop offset=".8" stop-color="${tertiary}"/><stop offset="1" stop-color="${tertiary}" stop-opacity="0"/></linearGradient>
  </defs>`;
  const glow = (x: number, y: number, rx: number, ry: number, color: number, opacity = 1) =>
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#g${color})" opacity="${opacity}"/>`;
  const ribbon = (path: string, opacity: number) => `<path d="${path}" fill="url(#silk)" opacity="${opacity}" filter="url(#feather)"/>`;
  const stroke = (path: string, opacity = 1, width = 0.7) =>
    `<path d="${path}" fill="none" stroke="url(#thread)" stroke-width="${width}" stroke-opacity="${opacity}" vector-effect="non-scaling-stroke"/>`;
  const point = (x: number, y: number, color: number) => glow(x, y, 16, 12, color, 0.6) +
    `<circle cx="${x}" cy="${y}" r="1.5" fill="${colors[color]}"/>`;
  // Each thread has shallow, continuous Bezier bends, never closed orbits.
  const wave = (y: number, bend: number, opacity: number, width = 0.7) => stroke(
    `M-20 ${y} C160 ${y - bend} 270 ${y + bend} 450 ${y + bend * 0.3} S760 ${y - bend} 1020 ${y + bend * 0.15}`, opacity, width);
  const upperSilk = 'M-70 50 C180 -10 240 140 490 100 S780 0 1070 80 L1070 200 C800 100 680 240 450 190 S160 80 -70 150Z';
  const middleSilk = 'M-80 130 C200 240 290 40 550 120 S830 260 1080 160 L1080 285 C810 340 710 220 500 225 S210 340 -80 230Z';
  const lowerSilk = 'M-50 280 C190 130 320 330 580 250 S830 160 1050 240 L1050 365 C840 260 770 370 540 345 S180 250 -50 390Z';
  let content: string;
  switch (style) {
    case 'fx-aurora-soft':
      content = glow(70, 50, 560, 290, 1, 0.35) + glow(900, 280, 550, 330, 2, 0.4) +
        glow(650, 150, 400, 230, 0, 0.2) + ribbon(upperSilk, 0.32);
      break;
    case 'fx-aurora-balanced':
      content = glow(200, 180, 500, 310, 1, 0.65) + glow(830, 80, 490, 290, 2, 0.7) +
        glow(750, 390, 500, 260, 0, 0.5) + ribbon(middleSilk, 0.8) + ribbon(upperSilk, 0.4);
      break;
    case 'fx-aurora-vivid':
      content = glow(140, 80, 340, 280, 2, 0.9) + glow(850, 110, 430, 270, 1, 0.9) +
        glow(500, 380, 600, 280, 0, 0.9) + ribbon(upperSilk, 0.85) + ribbon(lowerSilk, 0.95) +
        ribbon('M280 -50 C110 80 600 120 470 300 L660 450 C760 150 330 100 490 -50Z', 0.65);
      break;
    case 'fx-lines-subtle':
      content = glow(130, 180, 460, 280, 1, 0.22) + glow(830, 210, 510, 250, 2, 0.27) +
        wave(115, 8, 0.65, 0.6) + wave(260, -12, 0.8, 0.65) + wave(270, -11, 0.3, 0.5);
      break;
    case 'fx-lines-flow':
      content = glow(120, 240, 500, 290, 1, 0.5) + glow(840, 110, 470, 300, 2, 0.55) + ribbon(middleSilk, 0.45) +
        [0, 1, 2, 3, 4].map((i) => wave(155 + i * 9, 32 - i * 4, 0.95 - i * 0.12, i === 0 ? 0.85 : 0.6)).join('') +
        [0, 1, 2].map((i) => wave(300 + i * 7, -22 + i * 4, 0.65 - i * 0.15, 0.6)).join('');
      break;
    case 'fx-lines-spectrum':
      content = glow(130, 80, 430, 260, 2, 0.65) + glow(780, 170, 470, 270, 1, 0.6) + glow(500, 380, 550, 230, 0, 0.5) +
        Array.from({ length: 14 }, (_, i) => wave(90 + i * 17, Math.sin(i * 0.45) * 32, i % 3 === 0 ? 1 : 0.5, i % 3 === 0 ? 0.8 : 0.5)).join('') +
        point(310, 128, 1) + point(735, 282, 2);
      break;
    case 'fx-signal-minimal':
      content = glow(0, 0, 380, 180, 1, 0.25) + glow(1000, 400, 380, 200, 2, 0.3) +
        stroke('M0 42H210L235 67H390', 0.9) + stroke('M610 333H760L785 358H1000', 0.9) +
        stroke('M0 1H1000 M0 399H1000', 0.9) + point(235, 67, 1) + point(785, 358, 2);
      break;
    case 'fx-signal-pulse':
      content = glow(180, 220, 440, 280, 1, 0.3) + glow(840, 140, 440, 260, 2, 0.35) +
        stroke('M-20 135H180L205 110H365L395 140H560L585 115H800L825 140H1020', 1, 0.8) +
        stroke('M-20 278H230L255 253H440L470 283H700L725 258H1020', 0.85) +
        stroke('M-20 288H234L259 263H436L466 293H704L729 268H1020', 0.35, 0.5) +
        point(205, 110, 1) + point(585, 115, 0) + point(725, 258, 2);
      break;
    case 'fx-signal-matrix':
      content = glow(450, 210, 600, 300, 1, 0.32) + glow(960, 50, 420, 270, 2, 0.35) +
        Array.from({ length: 9 }, (_, i) => stroke(`M0 ${30 + i * 45}H1000`, i % 3 === 0 ? 0.65 : 0.3, 0.5)).join('') +
        Array.from({ length: 18 }, (_, i) => stroke(`M${i * 75 - 350} 400l300 -400`, i % 4 === 0 ? 0.55 : 0.25, 0.5)).join('') +
        stroke('M180 300H425L460 255H755', 0.9) + point(460, 255, 0);
      break;
    case 'fx-mesh-ambient':
      content = glow(250, 180, 650, 410, 1, 0.55) + glow(700, 230, 610, 370, 2, 0.45) + glow(480, 80, 420, 270, 0, 0.25);
      break;
    case 'fx-mesh-prism':
      content = glow(80, 70, 360, 280, 1, 0.85) + glow(560, 0, 430, 270, 2, 0.9) +
        glow(920, 160, 380, 300, 0, 0.85) + glow(420, 390, 440, 280, 0, 0.85) + glow(710, 330, 330, 210, 1, 0.6);
      break;
    case 'fx-mesh-deep-glow':
      content = glow(-50, 130, 420, 330, 1) + glow(1040, 240, 430, 320, 2) +
        glow(480, -90, 590, 210, 0, 0.85) + glow(600, 460, 500, 230, 0, 0.7) +
        '<ellipse cx="500" cy="210" rx="360" ry="190" fill="url(#shade)"/>';
      break;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" preserveAspectRatio="none">${defs}<path fill="#06080c" d="M0 0H1000V400H0Z"/>${content}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
