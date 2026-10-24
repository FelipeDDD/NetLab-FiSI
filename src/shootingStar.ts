export function nextStarDelay(random = Math.random): number { return 15000 + random() * 15000; }
export function starFlight(width: number, height: number, random = Math.random) {
  const trail = 50 + random() * 40;
  const dx = Math.min(240, width * 0.18), dy = Math.min(160, height * 0.18);
  return {
    trail, dx, dy, angle: Math.atan2(dy, dx) * 180 / Math.PI,
    x: width * 0.15 + random() * Math.max(0, width * 0.65 - dx - trail),
    y: height * 0.15 + random() * Math.max(0, height * 0.6 - dy),
    duration: 800 + random() * 700,
  };
}
