import { trace, Span, SpanStatusCode } from "@opentelemetry/api";
import type { StoreEvent, StreamListener, SealedStore } from "@naikidev/commiq";
import type { InstrumentOptions } from "./types";

interface StoreWithStream {
  openStream: (listener: StreamListener) => void;
  closeStream: (listener: StreamListener) => void;
}

export function instrumentStore(
  store: StoreWithStream,
  options: InstrumentOptions,
): () => void {
  const { storeName, tracerName = "commiq", tracerVersion } = options;
  const tracer = trace.getTracer(tracerName, tracerVersion);

  const activeSpans = new Map<string, Span>();

  const listener: StreamListener = (event: StoreEvent) => {
    switch (event.name) {
      case "commandStarted": {
        const cmd = (event.data as { command: { name: string; correlationId: string; causedBy: string | null } }).command;
        const span = tracer.startSpan(`commiq.command:${cmd.name}`, {
          attributes: {
            "commiq.store": storeName,
            "commiq.command.name": cmd.name,
            "commiq.command.correlation_id": cmd.correlationId,
            ...(cmd.causedBy ? { "commiq.command.caused_by": cmd.causedBy } : {}),
          },
        });
        activeSpans.set(cmd.correlationId, span);
        break;
      }

      case "commandHandled": {
        const cmd = (event.data as { command: { correlationId: string } }).command;
        const span = activeSpans.get(cmd.correlationId);
        if (span) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          activeSpans.delete(cmd.correlationId);
        }
        break;
      }

      case "commandHandlingError": {
        const { command: cmd, error } = event.data as {
          command: { correlationId: string };
          error: unknown;
        };
        const span = activeSpans.get(cmd.correlationId);
        if (span) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
          if (error instanceof Error) {
            span.recordException(error);
          } else {
            span.recordException(new Error(String(error)));
          }
          span.end();
          activeSpans.delete(cmd.correlationId);
        }
        break;
      }

      case "stateChanged": {
        const parentSpan = event.causedBy ? activeSpans.get(event.causedBy) : undefined;
        if (parentSpan) {
          parentSpan.addEvent("stateChanged", {
            "commiq.event.correlation_id": event.correlationId,
          });
        } else {
          const span = tracer.startSpan(`commiq.event:stateChanged`, {
            attributes: {
              "commiq.store": storeName,
              "commiq.event.name": "stateChanged",
              "commiq.event.correlation_id": event.correlationId,
            },
          });
          span.end();
        }
        break;
      }

      default: {
        if (event.name === "invalidCommand" || event.name === "stateReset") {
          break;
        }

        const parentSpan = event.causedBy ? activeSpans.get(event.causedBy) : undefined;
        if (parentSpan) {
          parentSpan.addEvent(event.name, {
            "commiq.event.name": event.name,
            "commiq.event.correlation_id": event.correlationId,
          });
        } else {
          const span = tracer.startSpan(`commiq.event:${event.name}`, {
            attributes: {
              "commiq.store": storeName,
              "commiq.event.name": event.name,
              "commiq.event.correlation_id": event.correlationId,
              ...(event.causedBy ? { "commiq.event.caused_by": event.causedBy } : {}),
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
    for (const span of activeSpans.values()) {
      span.end();
    }
    activeSpans.clear();
  };
}
