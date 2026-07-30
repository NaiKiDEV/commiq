import { context, trace } from "@opentelemetry/api";
import type { Attributes, Context } from "@opentelemetry/api";
import type { StoreEvent } from "@naikidev/commiq";
import type { InstrumentConfig } from "./config";
import type { CommandInfo } from "./event-data";
import type { TraceLink } from "./types";

export const CORRELATION_EVENT = "commiq.correlation";

export function parentContextFromLink(link: TraceLink | undefined): Context {
  const active = context.active();
  if (!link) return active;
  return trace.setSpanContext(active, link.spanContext);
}

export function resolveParentContext(
  config: InstrumentConfig,
  causedBy: string | null,
): Context {
  if (causedBy === null) return context.active();
  return parentContextFromLink(config.registry.resolve(causedBy));
}

export function commandCorrelationAttributes(command: CommandInfo): Attributes {
  if (command.causedBy === null) {
    return { "commiq.command.correlation_id": command.correlationId };
  }
  return {
    "commiq.command.correlation_id": command.correlationId,
    "commiq.command.caused_by": command.causedBy,
  };
}

export function commandAttributes(
  config: InstrumentConfig,
  command: CommandInfo,
): Attributes {
  const base: Attributes = {
    "commiq.store": config.storeName,
    "commiq.command.name": command.name,
  };
  if (!config.recordCorrelationIds) return base;
  return { ...base, ...commandCorrelationAttributes(command) };
}

export function eventCorrelationAttributes(event: StoreEvent): Attributes {
  if (event.causedBy === null) {
    return { "commiq.event.correlation_id": event.correlationId };
  }
  return {
    "commiq.event.correlation_id": event.correlationId,
    "commiq.event.caused_by": event.causedBy,
  };
}

export function eventAttributes(
  config: InstrumentConfig,
  event: StoreEvent,
): Attributes {
  const base: Attributes = {
    "commiq.store": config.storeName,
    "commiq.event.name": event.name,
  };
  if (!config.recordCorrelationIds) return base;
  return { ...base, ...eventCorrelationAttributes(event) };
}

export function spanEventAttributes(event: StoreEvent): Attributes {
  return {
    "commiq.event.name": event.name,
    ...eventCorrelationAttributes(event),
  };
}
