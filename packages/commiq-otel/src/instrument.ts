import { trace, context, Span, SpanStatusCode } from "@opentelemetry/api";
import type { StoreEvent, StreamListener } from "@naikidev/commiq";
import { BuiltinEventName } from "@naikidev/commiq";
import type { InstrumentOptions } from "./types";

type StoreWithStream = {
  openStream: (listener: StreamListener) => void;
  closeStream: (listener: StreamListener) => void;
};

const spanRegistry = new Map<string, Span>();

let _activeCommandSpan: Span | null = null;
const _prevActiveSpans = new Map<string, Span | null>();
const _liveSpans = new Set<Span>();

export function instrumentStore(
  store: StoreWithStream,
  options: InstrumentOptions,
): () => void {
  const { storeName, tracerName = "commiq", tracerVersion } = options;
  const tracer = trace.getTracer(tracerName, tracerVersion);

  const ownedIds = new Set<string>();

  const listener: StreamListener = (event: StoreEvent) => {
    switch (event.name) {
      case BuiltinEventName.CommandStarted: {
        const cmd = (
          event.data as {
            command: {
              name: string;
              correlationId: string;
              causedBy: string | null;
            };
          }
        ).command;

        const parentSpan = cmd.causedBy
          ? (spanRegistry.get(cmd.causedBy) ?? _activeCommandSpan)
          : undefined;
        const parentCtx = parentSpan
          ? trace.setSpan(context.active(), parentSpan)
          : context.active();

        const span = tracer.startSpan(
          `commiq.command:${cmd.name}`,
          {
            attributes: {
              "commiq.store": storeName,
              "commiq.command.name": cmd.name,
              "commiq.command.correlation_id": cmd.correlationId,
              ...(cmd.causedBy
                ? { "commiq.command.caused_by": cmd.causedBy }
                : {}),
            },
          },
          parentCtx,
        );
        spanRegistry.set(cmd.correlationId, span);
        ownedIds.add(cmd.correlationId);

        _prevActiveSpans.set(cmd.correlationId, _activeCommandSpan);
        _activeCommandSpan = span;
        _liveSpans.add(span);
        break;
      }

      case BuiltinEventName.CommandHandled: {
        const cmd = (event.data as { command: { correlationId: string } })
          .command;
        const span = spanRegistry.get(cmd.correlationId);
        if (span) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          _liveSpans.delete(span);
          spanRegistry.delete(cmd.correlationId);
          ownedIds.delete(cmd.correlationId);

          if (_activeCommandSpan === span) {
            const prev = _prevActiveSpans.get(cmd.correlationId) ?? null;
            _activeCommandSpan = prev && _liveSpans.has(prev) ? prev : null;
          }
          _prevActiveSpans.delete(cmd.correlationId);
        }
        break;
      }

      case BuiltinEventName.InvalidCommand: {
        const cmd = (
          event.data as {
            command: {
              name: string;
              correlationId: string;
              causedBy: string | null;
            };
          }
        ).command;

        const parentSpan = cmd.causedBy
          ? (spanRegistry.get(cmd.causedBy) ?? _activeCommandSpan)
          : undefined;
        const parentCtx = parentSpan
          ? trace.setSpan(context.active(), parentSpan)
          : context.active();

        const span = tracer.startSpan(
          `commiq.command:${cmd.name}`,
          {
            attributes: {
              "commiq.store": storeName,
              "commiq.command.name": cmd.name,
              "commiq.command.correlation_id": cmd.correlationId,
              ...(cmd.causedBy
                ? { "commiq.command.caused_by": cmd.causedBy }
                : {}),
            },
          },
          parentCtx,
        );
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `No handler registered for command "${cmd.name}"`,
        });
        span.recordException(
          new Error(`No handler registered for command "${cmd.name}"`),
        );
        span.end();
        break;
      }

      case BuiltinEventName.CommandHandlingError: {
        const { command: cmd, error } = event.data as {
          command: { correlationId: string };
          error: unknown;
        };
        const span = spanRegistry.get(cmd.correlationId);
        if (span) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: String(error),
          });
          if (error instanceof Error) {
            span.recordException(error);
          } else {
            span.recordException(new Error(String(error)));
          }
          span.end();
          _liveSpans.delete(span);
          spanRegistry.delete(cmd.correlationId);
          ownedIds.delete(cmd.correlationId);

          if (_activeCommandSpan === span) {
            const prev = _prevActiveSpans.get(cmd.correlationId) ?? null;
            _activeCommandSpan = prev && _liveSpans.has(prev) ? prev : null;
          }
          _prevActiveSpans.delete(cmd.correlationId);
        }
        break;
      }

      case BuiltinEventName.StateChanged: {
        const parentSpan = event.causedBy
          ? spanRegistry.get(event.causedBy)
          : undefined;
        if (parentSpan) {
          parentSpan.addEvent(BuiltinEventName.StateChanged, {
            "commiq.event.correlation_id": event.correlationId,
          });
          spanRegistry.set(event.correlationId, parentSpan);
          ownedIds.add(event.correlationId);
        } else {
          const span = tracer.startSpan(
            `commiq.event:${BuiltinEventName.StateChanged}`,
            {
              attributes: {
                "commiq.store": storeName,
                "commiq.event.name": BuiltinEventName.StateChanged,
                "commiq.event.correlation_id": event.correlationId,
              },
            },
          );
          span.end();
        }
        break;
      }

      default: {
        if (
          event.name === BuiltinEventName.StateReset ||
          isNotifyHandledEvent(event)
        ) {
          break;
        }

        const parentSpan = event.causedBy
          ? spanRegistry.get(event.causedBy)
          : undefined;
        if (parentSpan) {
          parentSpan.addEvent(event.name, {
            "commiq.event.name": event.name,
            "commiq.event.correlation_id": event.correlationId,
          });
          spanRegistry.set(event.correlationId, parentSpan);
          ownedIds.add(event.correlationId);
        } else {
          const span = tracer.startSpan(`commiq.event:${event.name}`, {
            attributes: {
              "commiq.store": storeName,
              "commiq.event.name": event.name,
              "commiq.event.correlation_id": event.correlationId,
              ...(event.causedBy
                ? { "commiq.event.caused_by": event.causedBy }
                : {}),
            },
          });
          span.end();
        }
        break;
      }
    }
  };

  store.openStream(listener);

  return () => {
    store.closeStream(listener);
    for (const id of ownedIds) {
      const span = spanRegistry.get(id);
      if (span) {
        span.end();
        _liveSpans.delete(span);
        spanRegistry.delete(id);
      }
      _prevActiveSpans.delete(id);
    }
    ownedIds.clear();
  };
}

function isNotifyHandledEvent(event: StoreEvent): boolean {
  const data = event.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object") return false;
  const cmd = data.command as Record<string, unknown> | undefined;
  if (!cmd || typeof cmd !== "object" || typeof cmd.name !== "string")
    return false;
  return event.name === `${cmd.name}:handled`;
}
