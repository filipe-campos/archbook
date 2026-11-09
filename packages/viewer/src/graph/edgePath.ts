export interface Point {
  x: number;
  y: number;
}

/**
 * SVG path through `points` with straight segments and rounded corners. The radius shrinks on
 * short segments so two corners never overlap.
 */
export function roundedPath(points: Point[], radius = 14): string {
  const [first, ...rest] = points;
  if (!first) return "";
  if (rest.length === 0) return `M ${first.x} ${first.y}`;
  let path = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const corner = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(radius, distance(prev, corner) / 2, distance(corner, next) / 2);
    const from = toward(corner, prev, r);
    const to = toward(corner, next, r);
    path += ` L ${from.x} ${from.y} Q ${corner.x} ${corner.y} ${to.x} ${to.y}`;
  }
  const last = points[points.length - 1]!;
  return `${path} L ${last.x} ${last.y}`;
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const toward = (from: Point, to: Point, length: number): Point => {
  const d = distance(from, to);
  if (d === 0) return from;
  return { x: from.x + ((to.x - from.x) / d) * length, y: from.y + ((to.y - from.y) / d) * length };
};

/** Middle of the longest horizontal run, where a label reads best on a left-to-right diagram. */
export function longestRunMiddle(points: Point[]): Point {
  let best = points[0] ?? { x: 0, y: 0 };
  let bestLength = -1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.abs(b.x - a.x) * (a.y === b.y ? 1 : 0.2);
    if (length > bestLength) {
      bestLength = length;
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best;
}
