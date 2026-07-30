export const NODE_W = 130;
export const NODE_H = 44;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;

const CLUSTER_GAP = NODE_W * 2;
const DISCONNECTED_GAP = 24;
const REPULSION = 60_000;
const SPRING_K = 0.006;
const IDEAL_LEN = NODE_W * 2.2;
const DAMPING = 0.85;
const MIN_DIST = NODE_W * 0.8;
const DEFAULT_ITERATIONS = 120;

export type Vec = { x: number; y: number }

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

export type LayoutEdge = { from: string; to: string }

export type ViewTransform = { pan: Vec; zoom: number }

export function findComponents(nodes: string[], edges: readonly LayoutEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node, new Set());
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of nodes) {
    if (visited.has(node)) continue;
    const component: string[] = [];
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) stack.push(neighbour);
      }
    }
    components.push(component);
  }
  return components;
}

export function getBounds(positions: Map<string, Vec>): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

export function forceLayout(
  nodes: string[],
  edges: readonly LayoutEdge[],
  iterations: number = DEFAULT_ITERATIONS,
): Map<string, Vec> {
  const positions = seedRing(nodes);
  if (nodes.length < 2) return positions;

  const velocities = new Map<string, Vec>(nodes.map((n) => [n, { x: 0, y: 0 }]));
  const edgeSet = new Set(edges.map((e) => `${e.from}→${e.to}`));
  const isLinked = (a: string, b: string) =>
    edgeSet.has(`${a}→${b}`) || edgeSet.has(`${b}→${a}`);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const maxMove = 30 * (1 - iteration / iterations) + 2;
    applyRepulsion(nodes, positions, velocities);
    applySprings(nodes, positions, velocities, isLinked);
    integrate(nodes, positions, velocities, maxMove);
  }

  return positions;
}

function seedRing(nodes: string[]): Map<string, Vec> {
  const positions = new Map<string, Vec>();
  const count = nodes.length;
  if (count === 0) return positions;
  if (count === 1) {
    positions.set(nodes[0], { x: 0, y: 0 });
    return positions;
  }
  const radius = Math.max(100, count * 40);
  for (let i = 0; i < count; i += 1) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    positions.set(nodes[i], { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return positions;
}

function applyRepulsion(
  nodes: string[],
  positions: Map<string, Vec>,
  velocities: Map<string, Vec>,
): void {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = positions.get(nodes[i])!;
      const b = positions.get(nodes[j])!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(MIN_DIST, Math.sqrt(dx * dx + dy * dy));
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const va = velocities.get(nodes[i])!;
      const vb = velocities.get(nodes[j])!;
      va.x -= fx;
      va.y -= fy;
      vb.x += fx;
      vb.y += fy;
    }
  }
}

function applySprings(
  nodes: string[],
  positions: Map<string, Vec>,
  velocities: Map<string, Vec>,
  isLinked: (a: string, b: string) => boolean,
): void {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (!isLinked(nodes[i], nodes[j])) continue;
      const a = positions.get(nodes[i])!;
      const b = positions.get(nodes[j])!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const displacement = dist - IDEAL_LEN;
      const fx = (dx / dist) * displacement * SPRING_K;
      const fy = (dy / dist) * displacement * SPRING_K;
      const va = velocities.get(nodes[i])!;
      const vb = velocities.get(nodes[j])!;
      va.x += fx;
      va.y += fy;
      vb.x -= fx;
      vb.y -= fy;
    }
  }
}

function integrate(
  nodes: string[],
  positions: Map<string, Vec>,
  velocities: Map<string, Vec>,
  maxMove: number,
): void {
  for (const name of nodes) {
    const v = velocities.get(name)!;
    const p = positions.get(name)!;
    v.x *= DAMPING;
    v.y *= DAMPING;
    const magnitude = Math.sqrt(v.x * v.x + v.y * v.y);
    if (magnitude > maxMove) {
      v.x = (v.x / magnitude) * maxMove;
      v.y = (v.y / magnitude) * maxMove;
    }
    p.x += v.x;
    p.y += v.y;
  }
}

export function computeLayout(
  storeNames: readonly string[],
  edges: readonly LayoutEdge[],
): Map<string, Vec> {
  const positions = new Map<string, Vec>();
  if (storeNames.length === 0) return positions;

  const linked = new Set<string>();
  for (const edge of edges) {
    linked.add(edge.from);
    linked.add(edge.to);
  }

  const connected = storeNames.filter((s) => linked.has(s));
  const disconnected = storeNames.filter((s) => !linked.has(s));

  let cursorX = 0;
  for (const component of findComponents(connected, edges)) {
    const members = new Set(component);
    const componentEdges = edges.filter((e) => members.has(e.from) && members.has(e.to));
    const laidOut = forceLayout(component, componentEdges);
    const bounds = getBounds(laidOut);
    const width = bounds.maxX - bounds.minX + NODE_W;
    const offsetX = cursorX + width / 2 - (bounds.minX + bounds.maxX) / 2;
    const offsetY = -(bounds.minY + bounds.maxY) / 2;
    for (const [name, p] of laidOut) {
      positions.set(name, { x: p.x + offsetX, y: p.y + offsetY });
    }
    cursorX += width + CLUSTER_GAP;
  }

  centre(positions);
  placeDisconnected(positions, disconnected);
  return positions;
}

function centre(positions: Map<string, Vec>): void {
  if (positions.size === 0) return;
  const bounds = getBounds(positions);
  const shiftX = -(bounds.minX + bounds.maxX) / 2;
  const shiftY = -(bounds.minY + bounds.maxY) / 2;
  for (const [name, p] of positions) {
    positions.set(name, { x: p.x + shiftX, y: p.y + shiftY });
  }
}

function placeDisconnected(positions: Map<string, Vec>, disconnected: string[]): void {
  if (disconnected.length === 0) return;
  const bounds =
    positions.size > 0 ? getBounds(positions) : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const y = bounds.maxY + NODE_H * 2.5;
  const totalWidth = disconnected.length * (NODE_W + DISCONNECTED_GAP) - DISCONNECTED_GAP;
  const startX = -totalWidth / 2 + NODE_W / 2;
  for (let i = 0; i < disconnected.length; i += 1) {
    positions.set(disconnected[i], { x: startX + i * (NODE_W + DISCONNECTED_GAP), y });
  }
}

export function computeFit(
  positions: Map<string, Vec>,
  viewWidth: number,
  viewHeight: number,
): ViewTransform {
  if (positions.size === 0 || viewWidth <= 0 || viewHeight <= 0) {
    return { pan: { x: 0, y: 0 }, zoom: 1 };
  }

  const bounds = getBounds(positions);
  const minX = bounds.minX - NODE_W / 2;
  const maxX = bounds.maxX + NODE_W / 2;
  const minY = bounds.minY - NODE_H / 2;
  const maxY = bounds.maxY + NODE_H / 2;

  const scale = Math.min(1.2, Math.min(viewWidth / (maxX - minX + 80), viewHeight / (maxY - minY + 80)));
  const zoom = clampZoom(scale);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  return {
    pan: { x: viewWidth / 2 - centreX * zoom, y: viewHeight / 2 - centreY * zoom },
    zoom,
  };
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function mergePositions(
  previous: Map<string, Vec>,
  next: Map<string, Vec>,
): Map<string, Vec> {
  const merged = new Map<string, Vec>();
  for (const [name, p] of next) {
    merged.set(name, previous.get(name) ?? p);
  }
  return merged;
}
