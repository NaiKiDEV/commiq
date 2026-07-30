import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import type { CausalityIndex } from "../causality";
import { formatTime } from "../theme";

export const LANE_HEIGHT = 38;
export const DOT_RADIUS = 5;
export const LABEL_WIDTH = 100;
export const TIME_AXIS_HEIGHT = 24;
export const MIN_SPACING = 18;
export const CHART_PADDING = 24;

export type PositionedEvent = {
  entry: TimelineEntry;
  x: number;
  y: number;
}

export type CausalLink = {
  from: PositionedEvent;
  to: PositionedEvent;
}

export type TimelineTick = {
  x: number;
  label: string;
}

export type ChartLayout = {
  positioned: PositionedEvent[];
  links: CausalLink[];
  ticks: TimelineTick[];
  chartWidth: number;
  chartHeight: number;
}

export function buildChartLayout(
  entries: readonly TimelineEntry[],
  visibleStores: readonly string[],
  index: CausalityIndex,
): ChartLayout | null {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const minTs = sorted[0].timestamp;
  const maxTs = sorted[sorted.length - 1].timestamp;
  const timeSpan = maxTs - minTs;

  const laneY = new Map<string, number>();
  visibleStores.forEach((name, i) => {
    laneY.set(name, TIME_AXIS_HEIGHT + i * LANE_HEIGHT + LANE_HEIGHT / 2);
  });

  const positioned = positionEvents(sorted, laneY, timeSpan, minTs);
  const chartWidth = (positioned[positioned.length - 1]?.x ?? 0) + CHART_PADDING * 2;
  const chartHeight = TIME_AXIS_HEIGHT + visibleStores.length * LANE_HEIGHT;

  return {
    positioned,
    links: buildLinks(positioned, index),
    ticks: buildTicks(positioned, minTs, timeSpan),
    chartWidth,
    chartHeight,
  };
}

function positionEvents(
  sorted: readonly TimelineEntry[],
  laneY: Map<string, number>,
  timeSpan: number,
  minTs: number,
): PositionedEvent[] {
  const baseWidth = Math.max(400, sorted.length * MIN_SPACING);
  const positioned: PositionedEvent[] = [];
  let lastX = -Infinity;

  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];
    let x =
      timeSpan === 0
        ? (i / Math.max(1, sorted.length - 1)) * baseWidth
        : ((entry.timestamp - minTs) / timeSpan) * baseWidth;
    if (x - lastX < MIN_SPACING) x = lastX + MIN_SPACING;

    positioned.push({
      entry,
      x: x + CHART_PADDING,
      y: laneY.get(entry.storeName) ?? TIME_AXIS_HEIGHT + LANE_HEIGHT / 2,
    });
    lastX = x;
  }

  return positioned;
}

function buildLinks(positioned: PositionedEvent[], index: CausalityIndex): CausalLink[] {
  const byCorrelationId = new Map<string, PositionedEvent>();
  const groups = new Map<string, PositionedEvent[]>();

  for (const p of positioned) {
    byCorrelationId.set(p.entry.correlationId, p);
    if (p.entry.causedBy === null) continue;
    const group = groups.get(p.entry.causedBy);
    if (group) {
      group.push(p);
      continue;
    }
    groups.set(p.entry.causedBy, [p]);
  }

  const links: CausalLink[] = [];

  for (const [commandId, group] of groups) {
    group.sort((a, b) => a.entry.timestamp - b.entry.timestamp);
    for (let i = 1; i < group.length; i += 1) {
      links.push({ from: group[i - 1], to: group[i] });
    }
    const parentEventId = index.parentEventOfCommand.get(commandId);
    const parent = parentEventId ? byCorrelationId.get(parentEventId) : undefined;
    if (parent) links.push({ from: parent, to: group[0] });
  }

  return links;
}

function buildTicks(
  positioned: PositionedEvent[],
  minTs: number,
  timeSpan: number,
): TimelineTick[] {
  const firstX = positioned[0].x;
  const lastX = positioned[positioned.length - 1].x;
  const xRange = lastX - firstX || 1;

  if (timeSpan === 0) {
    return [{ x: firstX + xRange / 2, label: formatTime(minTs) }];
  }

  const tickCount = Math.max(2, Math.min(8, Math.floor(xRange / 100)));
  const ticks: TimelineTick[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    const fraction = i / tickCount;
    ticks.push({
      x: firstX + fraction * xRange,
      label: formatTime(minTs + fraction * timeSpan),
    });
  }
  return ticks;
}
