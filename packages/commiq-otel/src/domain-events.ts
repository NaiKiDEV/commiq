import { context } from "@opentelemetry/api";
import type { StoreEvent } from "@naikidev/commiq";
import { recordError } from "./errors";
import { readError, readErrorSource, readFailedEvent } from "./event-data";
import {
  CORRELATION_EVENT,
  eventAttributes,
  eventCorrelationAttributes,
  parentContextFromLink,
  spanEventAttributes,
} from "./spans";
import type { HandlerDeps } from "./deps";

export function ignoreEvent(): void {}

export function onDomainEvent(deps: HandlerDeps, event: StoreEvent): void {
  if (isNotifyHandledEvent(event)) return;

  const link =
    event.causedBy === null
      ? undefined
      : deps.config.registry.resolve(event.causedBy);
  const parent = deps.tracker.live(link?.commandId ?? null);

  if (parent) {
    parent.addEvent(event.name, spanEventAttributes(event));
    if (link) deps.config.registry.link(event.correlationId, link);
    return;
  }

  const span = deps.config.tracer.startSpan(
    `commiq.event:${event.name}`,
    { attributes: eventAttributes(deps.config, event) },
    parentContextFromLink(link),
  );
  if (!deps.config.recordCorrelationIds) {
    span.addEvent(CORRELATION_EVENT, eventCorrelationAttributes(event));
  }
  span.end();
  deps.config.registry.link(event.correlationId, {
    spanContext: span.spanContext(),
    commandId: null,
  });
}

export function onEventHandlingError(
  deps: HandlerDeps,
  event: StoreEvent,
): void {
  const failed = readFailedEvent(event.data);
  const link =
    failed === null
      ? undefined
      : deps.config.registry.resolve(failed.correlationId);
  const eventName = failed?.name ?? "unknown";

  const span = deps.config.tracer.startSpan(
    `commiq.event_handler:${eventName}`,
    {
      attributes: {
        "commiq.store": deps.config.storeName,
        "commiq.event.name": eventName,
      },
    },
    parentContextFromLink(link),
  );
  recordError(span, readError(event.data), deps.config.sanitizeError);
  span.end();
}

export function onUnhandledError(deps: HandlerDeps, event: StoreEvent): void {
  const source = readErrorSource(event.data);
  const span = deps.config.tracer.startSpan(
    `commiq.error:${source}`,
    {
      attributes: {
        "commiq.store": deps.config.storeName,
        "commiq.error.source": source,
      },
    },
    context.active(),
  );
  recordError(span, readError(event.data), deps.config.sanitizeError);
  span.end();
}

function isNotifyHandledEvent(event: StoreEvent): boolean {
  const data = event.data;
  if (typeof data !== "object" || data === null) return false;
  if (!("command" in data)) return false;
  const { command } = data;
  if (typeof command !== "object" || command === null) return false;
  if (!("name" in command) || typeof command.name !== "string") return false;
  return event.name === `${command.name}:handled`;
}
