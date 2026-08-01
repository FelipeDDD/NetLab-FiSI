// Documentation-grade SVG of the topology (light theme, print friendly).
import type { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { cidrToString } from '../engine/ip';

export interface NodePos {
  id: string;
  x: number;
  y: number;
}

const W = 150;
const BASE_H = 58;
const LINE_H = 15;

const KIND_COLOR: Record<string, string> = {
  host: '#0284c7',
  server: '#0d9488',
  switch: '#7c3aed',
  router: '#059669',
  firewall: '#ea580c',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function topologySvg(net: Network, positions: NodePos[], title = 'NetSim topology'): string {
  const pos = new Map(positions.map((p) => [p.id, p]));
  interface Box {
    x: number;
    y: number;
    h: number;
    name: string;
    kind: string;
    ips: string[];
  }
  const boxes = new Map<string, Box>();
  for (const d of net.devices.values()) {
    const p = pos.get(d.id);
    if (!p) continue;
    const ips =
      d instanceof IpDevice
        ? d.interfaces.filter((i) => i.ip).map((i) => `${i.name} ${cidrToString(i.ip!.addr, i.ip!.prefix)}`)
        : [];
    boxes.set(d.id, { x: p.x, y: p.y, h: BASE_H + ips.length * LINE_H, name: d.name, kind: d.kind, ips });
  }
  if (boxes.size === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text x="12" y="40">empty topology</text></svg>`;

  const minX = Math.min(...[...boxes.values()].map((b) => b.x)) - 40;
  const minY = Math.min(...[...boxes.values()].map((b) => b.y)) - 60;
  const maxX = Math.max(...[...boxes.values()].map((b) => b.x + W)) + 40;
  const maxY = Math.max(...[...boxes.values()].map((b) => b.y + b.h)) + 40;
  const width = maxX - minX;
  const height = maxY - minY;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`,
  );
  parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(
    `<text x="${minX + 20}" y="${minY + 32}" font-size="16" font-weight="bold" fill="#0f172a">${esc(title)}</text>`,
  );

  // Cables with interface labels near each end.
  for (const l of net.links.values()) {
    const a = boxes.get(l.a.device.id);
    const b = boxes.get(l.b.device.id);
    if (!a || !b) continue;
    const ax = a.x + W / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + W / 2;
    const by = b.y + b.h / 2;
    parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#94a3b8" stroke-width="2"/>`);
    const lx = (x1: number, y1: number, x2: number, y2: number, t: number) => [
      x1 + (x2 - x1) * t,
      y1 + (y2 - y1) * t,
    ];
    const [alx, aly] = lx(ax, ay, bx, by, 0.22);
    const [blx, bly] = lx(ax, ay, bx, by, 0.78);
    parts.push(
      `<text x="${alx}" y="${aly - 4}" font-size="9" fill="#64748b" text-anchor="middle">${esc(l.a.name)}</text>`,
    );
    parts.push(
      `<text x="${blx}" y="${bly - 4}" font-size="9" fill="#64748b" text-anchor="middle">${esc(l.b.name)}</text>`,
    );
  }

  for (const b of boxes.values()) {
    const color = KIND_COLOR[b.kind] ?? '#334155';
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${W}" height="${b.h}" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
    );
    parts.push(`<rect x="${b.x}" y="${b.y}" width="5" height="${b.h}" rx="2.5" fill="${color}"/>`);
    parts.push(
      `<text x="${b.x + 16}" y="${b.y + 22}" font-size="13" font-weight="bold" fill="#0f172a">${esc(b.name)}</text>`,
    );
    parts.push(
      `<text x="${b.x + 16}" y="${b.y + 38}" font-size="10" fill="${color}" style="text-transform:uppercase">${esc(b.kind)}</text>`,
    );
    b.ips.forEach((ip, i) => {
      parts.push(
        `<text x="${b.x + 16}" y="${b.y + 54 + i * LINE_H}" font-size="10" fill="#334155" font-family="monospace">${esc(ip)}</text>`,
      );
    });
  }
  parts.push('</svg>');
  return parts.join('\n');
}

export function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG rendering failed'));
    };
    img.src = url;
  });
}
