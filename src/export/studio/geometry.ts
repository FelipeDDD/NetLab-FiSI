import type { PrintDevice, PrintSnapshot } from './model';
import type { DiagramOptions, PrintDocumentOptions } from './options';
import { presentationName } from './options';

export interface Point { x: number; y: number; }
export interface Rect extends Point { width: number; height: number; }
export interface Card extends Rect {
  device: PrintDevice; anchor: Point; name: string[]; kindLines: string[]; info: string[]; footer: string[];
  textRows: { text: string; role: 'name' | 'type' | 'interface' | 'gateway'; y: number; size: number; ascent: number; descent: number }[];
  footerY?: number;
}
export type MeasureText = (text: string, size: number, bold?: boolean, mono?: boolean) => number;

let context: CanvasRenderingContext2D | null | undefined;
/** Match the standalone SVG fonts in a browser; conservative widths for SSR/tests. */
export const measureText: MeasureText = (text, size, bold = false, mono = false) => {
  if (context === undefined) context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (context) {
    context.font = `${bold ? 700 : 400} ${size}px ${mono ? 'monospace' : 'Arial, sans-serif'}`;
    return context.measureText(text).width;
  }
  return Array.from(text).reduce((n, c) => n + size * (mono ? .63 : /[MW@%]/.test(c) ? .95 : /[ilI.,' :;!|]/.test(c) ? .32 : .65), 0);
};

/** Use the same font box for measurement and SVG baselines. Conservative SSR
 * metrics also reserve descenders, which fixed baseline offsets used to miss. */
function fontBox(size: number, bold: boolean, mono: boolean) {
  measureText('Mg', size, bold, mono);
  const metrics = context?.measureText('Mg');
  // SVG glyph bounds can round outwards at a fractional print transform.
  return { ascent: Math.ceil(metrics?.fontBoundingBoxAscent || size * .9) + 1, descent: Math.ceil(metrics?.fontBoundingBoxDescent || size * .25) + 1 };
}

/** Word wrapping also splits long interface names/tokens, without dropping text. */
export function wrapText(text: string, width: number, measure: (value: string) => number): string[] {
  return text.split(/\r?\n/).flatMap(paragraph => {
    const lines: string[] = []; let rest = Array.from(paragraph);
    while (rest.length) {
      let end = 1;
      while (end < rest.length && measure(rest.slice(0, end + 1).join('')) <= width) end++;
      if (end < rest.length) {
        const space = rest.slice(0, end).lastIndexOf(' ');
        if (space > end / 2) end = space + 1;
      }
      lines.push(rest.slice(0, end).join('')); rest = rest.slice(end);
    }
    return lines.length ? lines : [''];
  });
}

export const center = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export const overlaps = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.width + gap - .01 && a.x + a.width + gap > b.x + .01 && a.y < b.y + b.height + gap - .01 && a.y + a.height + gap > b.y + .01;

export function makeCards(snapshot: PrintSnapshot, options: PrintDocumentOptions, gateway: string, measure = measureText, defaultRoute = 'Default route', connected = 'Connected'): Card[] {
  const d: DiagramOptions = options.diagram, font = { small: 16, normal: 20, large: 24 }[options.textSize];
  return snapshot.devices.filter(device => d.deviceIds.includes(device.id)).map(device => {
    const title = presentationName(options, device.id).trim() || device.name, rawInfo: string[] = [], rawFooter: string[] = [];
    const defaults = device.routes.filter(route => route.prefix === 0);
    // Switch port identity belongs to its actual cable endpoint, not a list
    // whose visual order could be mistaken for a port-to-cable assignment.
    for (const iface of device.kind === 'switch' ? [] : device.interfaces) {
      if (d.ipv4 && iface.address) rawInfo.push(`${d.interfaces ? iface.name + ' ' : ''}${iface.address}${d.cidr ? '/' + iface.prefix : ''}`);
      else if (d.interfaces && iface.peer) rawInfo.push(iface.name);
      if (d.gateways && iface.gateway && !defaults.some(route => route.iface === iface.name && route.via === iface.gateway)) rawFooter.push(`${gateway}: ${iface.gateway}${d.gatewayInterfaces ? ` (${iface.name})` : ''}`);
    }
    // Collapse only the identical forwarding pair (interface + next hop).
    // The actual snapshot routes, their origins and technical tables stay intact.
    const shown = new Set<string>();
    if (d.gateways) for (const route of defaults) {
      const key = JSON.stringify([route.iface, route.via]); if (shown.has(key)) continue;
      shown.add(key); rawFooter.push(`${defaultRoute}: ${route.via ?? connected}${d.gatewayInterfaces ? ` (${route.iface})` : ''}`);
    }
    const nameMeasure = (s: string) => measure(s, font, true), infoMeasure = (s: string) => measure(s, font * .82, false, true);
    const width = Math.ceil(Math.max(112, d.names ? Math.min(240, nameMeasure(title)) + 24 : 0, d.types ? measure(device.kind, font * .76) + 24 : 0, ...[...rawInfo, ...rawFooter].map(s => Math.min(280, infoMeasure(s)) + 24)));
    const name = d.names ? wrapText(title, width - 24, nameMeasure) : [], info = rawInfo.flatMap(s => wrapText(s, width - 24, infoMeasure));
    const kindLines = d.types ? [device.kind] : [], footer = rawFooter.flatMap(s => wrapText(s, width - 24, infoMeasure));
    const textRows: Card['textRows'] = []; let bottom = 48;
    const group = (lines: string[], role: Card['textRows'][number]['role'], size: number, gap: number) => {
      if (!lines.length) return;
      const { ascent, descent } = fontBox(size, role === 'name', role === 'interface' || role === 'gateway');
      bottom += gap;
      for (const [index, text] of lines.entries()) {
        if (index) bottom += Math.max(3, size * .18);
        textRows.push({ text, role, size, y: bottom + ascent, ascent, descent }); bottom += ascent + descent;
      }
    };
    group(name, 'name', font, 8);
    group(kindLines, 'type', font * .76, name.length ? 3 : 8);
    group(info, 'interface', font * .82, 8);
    const footerY = footer.length ? bottom + 8 : undefined;
    group(footer, 'gateway', font * .82, 16);
    const height = Math.max(64, Math.ceil(bottom + 10));
    // A common center reference preserves positional relationships even when
    // different presets/device contents produce different card dimensions.
    return { device, anchor: { x: device.x, y: device.y }, x: device.x - width / 2, y: device.y - height / 2, width, height, name, kindLines, info, footer, textRows, footerY };
  });
}

/** Small, bounded overlap repair. No rows, ranks, graph layout or engine writes.
 * Moves may not reverse either original axis. Unaffected cards stay put. */
export function separateCards(cards: Card[], gap = 28): { expanded: boolean; unresolved: boolean } {
  // Stable IDs make coincident positions deterministic even if snapshot order changes.
  const ordered = [...cards].sort((a, b) => a.device.id < b.device.id ? -1 : a.device.id > b.device.id ? 1 : 0);
  const room = (card: Card, axis: 'x' | 'y', sign: number, exclude: Card) => {
    const c = center(card); let limit = Infinity;
    for (const other of ordered) {
      if (other === card || other === exclude) continue;
      if (Math.sign(other.anchor[axis] - card.anchor[axis]) === sign) limit = Math.min(limit, Math.max(0, (center(other)[axis] - c[axis]) * sign));
    }
    return limit;
  };
  const repair = () => {
    for (let pass = 0; pass < 80; pass++) {
      let collisions = 0, moved = 0;
      for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i], b = ordered[j]; if (!overlaps(a, b, gap)) continue;
        collisions++;
        const ac = center(a), bc = center(b), dx = b.anchor.x - a.anchor.x, dy = b.anchor.y - a.anchor.y;
        // On a diagonal, first move along the ORIGINAL direction. This avoids
        // flattening a tightly spaced diagonal/irregular group into a row.
        if (dx && dy) {
          const amount = Math.min(((a.width + b.width) / 2 + gap - (bc.x - ac.x) * Math.sign(dx)) / Math.abs(dx),
            ((a.height + b.height) / 2 + gap - (bc.y - ac.y) * Math.sign(dy)) / Math.abs(dy));
          const ar = Math.min(room(a, 'x', -Math.sign(dx), b) / Math.abs(dx), room(a, 'y', -Math.sign(dy), b) / Math.abs(dy));
          const br = Math.min(room(b, 'x', Math.sign(dx), a) / Math.abs(dx), room(b, 'y', Math.sign(dy), a) / Math.abs(dy));
          if (ar + br >= amount) {
            let am = Math.min(amount / 2, ar), bm = Math.min(amount - am, br); am = Math.min(amount - bm, ar); bm = amount - am;
            a.x -= dx * am; a.y -= dy * am; b.x += dx * bm; b.y += dy * bm;
            moved += Math.hypot(dx, dy) * amount; continue;
          }
        }
        const candidates = (['x', 'y'] as const).flatMap(axis => {
          const delta = axis === 'x' ? dx : dy;
          if (!delta && (dx || dy || axis === 'y')) return [];
          const sign = Math.sign(delta) || 1, span = axis === 'x' ? (a.width + b.width) / 2 : (a.height + b.height) / 2;
          const amount = span + gap - (bc[axis] - ac[axis]) * sign;
          const ar = room(a, axis, -sign, b), br = room(b, axis, sign, a);
          if (ar + br + .01 < amount) return [];
          let am = Math.min(amount / 2, ar), bm = Math.min(amount - am, br); am = Math.min(amount - bm, ar);
          bm = Math.min(amount - am, br);
          return [{ axis, sign, am, bm, cost: amount / Math.max(.25, Math.abs(delta) / (Math.hypot(dx, dy) || 1)) }];
        }).sort((a, b) => a.cost - b.cost);
        const move = candidates[0];
        if (move) { a[move.axis] -= move.sign * move.am; b[move.axis] += move.sign * move.bm; moved += move.am + move.bm; }
      }
      if (!collisions) return true;
      if (moved < .001) break;
    }
    return !ordered.some((a, i) => ordered.slice(i + 1).some(b => overlaps(a, b, gap)));
  };
  if (repair()) return { expanded: false, unresolved: false };
  // Exceptional fallback: expand the ORIGINAL shape uniformly, retaining local
  // offsets. Increasing diagram bounds is preferable to shuffling devices.
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const card of cards) { card.x += card.anchor.x * .25 * 1.25 ** attempt; card.y += card.anchor.y * .25 * 1.25 ** attempt; }
    if (repair()) return { expanded: true, unresolved: false };
  }
  return { expanded: true, unresolved: true };
}

export function borderPoint(box: Rect, toward: Point): Point {
  const c = center(box), dx = toward.x - c.x, dy = toward.y - c.y;
  const k = Math.min(dx ? box.width / 2 / Math.abs(dx) : Infinity, dy ? box.height / 2 / Math.abs(dy) : Infinity);
  return Number.isFinite(k) ? { x: c.x + dx * k, y: c.y + dy * k } : { x: c.x + box.width / 2, y: c.y };
}

/** Tests the rectangle interior, allowing a cable endpoint on its border. */
export function crossesCard(a: Point, b: Point, box: Rect): boolean {
  let low = 0, high = 1;
  for (const axis of ['x', 'y'] as const) {
    const min = box[axis] + .1, max = box[axis] + (axis === 'x' ? box.width : box.height) - .1, delta = b[axis] - a[axis];
    if (Math.abs(delta) < .0001) { if (a[axis] <= min || a[axis] >= max) return false; }
    else { const p = (min - a[axis]) / delta, q = (max - a[axis]) / delta; low = Math.max(low, Math.min(p, q)); high = Math.min(high, Math.max(p, q)); }
  }
  return high > low && high > 0 && low < 1;
}
export const pathLength = (points: Point[]) => points.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);

/** Prefer a straight border-to-border cable. Try only simple one/two-bend
 * alternatives around cards; deliberately not a general obstacle router. */
export function cablePath(a: Card, b: Card, cards: Card[], area?: Rect): { points: Point[]; obstructed: boolean } {
  const ac = center(a), bc = center(b);
  const simplify = (points: Point[]) => {
    const result: Point[] = [];
    for (const p of points) {
      if (result.length && Math.hypot(p.x - result.at(-1)!.x, p.y - result.at(-1)!.y) < .01) continue;
      while (result.length > 1) {
        const previous = result.at(-2)!, last = result.at(-1)!;
        if (Math.abs((last.x - previous.x) * (p.y - last.y) - (last.y - previous.y) * (p.x - last.x)) > .001 ||
          (last.x - previous.x) * (p.x - last.x) + (last.y - previous.y) * (p.y - last.y) < 0) break;
        result.pop();
      }
      result.push(p);
    }
    return result;
  };
  const clip = (middle: Point[]) => simplify([borderPoint(a, middle[0] ?? bc), ...middle, borderPoint(b, middle.at(-1) ?? ac)]);
  // Cable stroke 1.8/2 + card border 1.2/2 = 1.5 units. crossesCard trims
  // 0.1 from the tested interior; 1.6 therefore retains the painted clearance
  // without the former extra halo that rejected genuinely free straight lines.
  const clearance = 1.6;
  const clear = (points: Point[]) => (!area || points.every(p => p.x >= area.x - .01 && p.x <= area.x + area.width + .01 && p.y >= area.y - .01 && p.y <= area.y + area.height + .01)) && !points.slice(1).some((p, i) => cards.some(c => crossesCard(points[i], p, c === a || c === b ? c : { x: c.x - clearance, y: c.y - clearance, width: c.width + clearance * 2, height: c.height + clearance * 2 })));
  // Small local repairs can leave almost aligned centers a few units apart.
  // Share an interior projection on the facing edges instead of drawing a kink.
  const near = (span: number) => Math.max(3, Math.min(10, span * .06));
  const left = Math.max(a.x, b.x) + 4, right = Math.min(a.x + a.width, b.x + b.width) - 4;
  const top = Math.max(a.y, b.y) + 4, bottom = Math.min(a.y + a.height, b.y + b.height) - 4;
  if (left <= right && Math.abs(ac.x - bc.x) <= near(Math.min(a.width, b.width)) && Math.abs(ac.y - bc.y) >= (a.height + b.height) / 2) {
    const x = Math.max(left, Math.min(right, (ac.x + bc.x) / 2)), down = bc.y > ac.y;
    const points = [{ x, y: down ? a.y + a.height : a.y }, { x, y: down ? b.y : b.y + b.height }];
    if (clear(points)) return { points, obstructed: false };
  }
  if (top <= bottom && Math.abs(ac.y - bc.y) <= near(Math.min(a.height, b.height)) && Math.abs(ac.x - bc.x) >= (a.width + b.width) / 2) {
    const y = Math.max(top, Math.min(bottom, (ac.y + bc.y) / 2)), rightward = bc.x > ac.x;
    const points = [{ x: rightward ? a.x + a.width : a.x, y }, { x: rightward ? b.x : b.x + b.width, y }];
    if (clear(points)) return { points, obstructed: false };
  }
  const direct = clip([]); if (clear(direct)) return { points: direct, obstructed: false };
  const candidates: Point[][] = [clip([{ x: ac.x, y: bc.y }]), clip([{ x: bc.x, y: ac.y }])];
  const blockers = cards.filter(c => c === a || c === b || crossesCard(ac, bc, c));
  for (const c of blockers) {
    for (const x of [c.x - 20, c.x + c.width + 20]) candidates.push(clip([{ x, y: ac.y }, { x, y: bc.y }]));
    for (const y of [c.y - 20, c.y + c.height + 20]) candidates.push(clip([{ x: ac.x, y }, { x: bc.x, y }]));
  }
  const cost = (points: Point[]) => pathLength(points) + points.slice(1).filter((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y) < 8).length * 20;
  const best = candidates.filter(clear).sort((p, q) => cost(p) - cost(q))[0];
  return { points: best ?? direct, obstructed: !best };
}

export interface CableLabel extends Rect { lines: string[]; size: number; }
export function cableLabels(points: Point[], texts: string[], cards: Card[], occupied: Rect[], font: number, measure = measureText, area?: Rect): { labels: CableLabel[]; crowded: boolean } {
  const length = pathLength(points), size = font * .75;
  const at = (ratio: number) => {
    let left = length * ratio;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], span = Math.hypot(b.x - a.x, b.y - a.y);
      if (left <= span || i === points.length - 1) return { x: a.x + (b.x - a.x) * left / (span || 1), y: a.y + (b.y - a.y) * left / (span || 1), nx: -(b.y - a.y) / (span || 1), ny: (b.x - a.x) / (span || 1) };
      left -= span;
    }
    return { ...points[0], nx: 0, ny: -1 };
  };
  let crowded = false;
  const labels = texts.map((text, index) => {
    const lines = wrapText(text, 170, s => measure(s, size)), width = Math.max(...lines.map(s => measure(s, size))) + 8, height = lines.length * size * 1.25 + 4;
    let best: CableLabel | undefined, bestScore = Infinity;
    for (const ratio of index ? [.84, .72, .6, .5] : [.16, .28, .4, .5]) for (const side of [-1, 1]) for (const offset of [height / 2 + 5, height + 14, height * 2 + 28, height * 3 + 42]) {
      const p = at(ratio), rawX = p.x + p.nx * offset * side - width / 2, rawY = p.y + p.ny * offset * side - height / 2;
      const box = { x: area ? Math.max(area.x, Math.min(area.x + area.width - width, rawX)) : rawX, y: area ? Math.max(area.y, Math.min(area.y + area.height - height, rawY)) : rawY, width, height, lines, size };
      const score = cards.filter(c => overlaps(box, c, 3)).length * 10000 + occupied.filter(c => overlaps(box, c, 3)).length * 1000 + offset + Math.abs(ratio - (index ? .84 : .16)) * 40 + Math.hypot(box.x - rawX, box.y - rawY);
      if (score < bestScore) { best = box; bestScore = score; }
    }
    if (bestScore >= 1000) crowded = true;
    occupied.push(best!); return best!;
  });
  return { labels, crowded };
}

export function diagramBounds(rects: Rect[], padding = 16): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 600, height: 250 };
  const x = Math.min(...rects.map(r => r.x)) - padding, y = Math.min(...rects.map(r => r.y)) - padding;
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x + padding, height: Math.max(...rects.map(r => r.y + r.height)) - y + padding };
}
