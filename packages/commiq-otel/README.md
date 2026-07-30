# @naikidev/commiq-otel

OpenTelemetry tracing integration for Commiq stores. Commands become spans, store events become span events.

## Install

```bash
pnpm add @naikidev/commiq-otel @opentelemetry/api
```

## Usage

```typescript
import { instrumentStore } from "@naikidev/commiq-otel";

const instrumentation = instrumentStore(store, { storeName: "counter" });

// Later...
instrumentation.destroy();
```

The returned value is callable (`instrumentation()`) and also satisfies Commiq's `Disposable` (`instrumentation.destroy()`). Both are idempotent.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `storeName` | `string` | — | Required. Non-empty; set as `commiq.store` on every span. |
| `tracerName` | `string` | `"commiq"` | Tracer name. |
| `tracerVersion` | `string` | `undefined` | Tracer version. |
| `registry` | `TraceRegistry` | private per call | Opt-in shared registry that enables cross-store trace propagation. |
| `maxCommandDurationMs` | `number` | `60000` | Commands still pending after this window are ended as abandoned. `0` or a non-finite value disables the sweep. |
| `maxPendingCommands` | `number` | `1024` | Hard cap on concurrently tracked command spans; the oldest are ended as abandoned on overflow. |
| `recordCorrelationIds` | `boolean` | `false` | Record correlation ids as span *attributes* instead of span *events*. |
| `sanitizeError` | `(error: unknown) => string` | error type name | Maps an error to the text placed in span status and exception events. |

## Cross-store propagation

Each `instrumentStore` call keeps its own state. Two independent stores never share span parents, so
interleaved work (SSR, multi-tenant Node, concurrent requests) cannot fabricate causal edges.

To trace a causal chain that crosses stores, pass one shared registry to every participant:

```typescript
import { createTraceRegistry, instrumentStore } from "@naikidev/commiq-otel";

const registry = createTraceRegistry({ maxEntries: 512 });

instrumentStore(orders, { storeName: "orders", registry });
instrumentStore(payments, { storeName: "payments", registry });
```

The registry stores immutable `SpanContext` values (never live `Span` objects) keyed by correlation id,
capped at `maxEntries` with oldest-first eviction. A command queued from an event handler in another
store is parented to the span of the command that emitted the event — even if that command has already
finished.

## Abandoned commands

A command that never settles (hung `await`, navigation mid-flight) would otherwise leave an unended
span, and unended spans are never exported. Such spans are ended with `SpanStatusCode.ERROR` plus:

- `commiq.command.abandoned` — `true`
- `commiq.command.abandoned_reason` — `"timeout"`, `"overflow"` or `"disposed"`

The sweep timer only exists while commands are in flight and is cleared on disposal.

## Cardinality and PII

- Span names are low-cardinality (`commiq.command:<name>`, `commiq.event:<name>`).
- Correlation ids are high-cardinality, so by default they are recorded on a `commiq.correlation`
  span event instead of as span attributes. Set `recordCorrelationIds: true` to restore attributes
  when your backend does not index or derive metrics from them.
- Error messages may contain user input. By default only the error type (`"TypeError"`) reaches span
  status and the `exception` event — no message and no stack. Opt into more detail explicitly:

```typescript
instrumentStore(store, {
  storeName: "users",
  sanitizeError: (error) => (error instanceof Error ? error.message : "unknown"),
});
```

- No command payload and no state is ever attached to spans.

## What gets recorded

| Store event | Span behaviour |
| --- | --- |
| `commandStarted` | Starts `commiq.command:<name>`, parented via `causedBy` or the active OTel context. |
| `commandHandled` | Ends the span with `OK`. |
| `commandHandlingError` | Ends the span with `ERROR` plus a sanitized `exception` event. |
| `commandInterrupted` | Ends the span with `commiq.command.interrupted` and the phase. |
| `invalidCommand` | Short `ERROR` span (no handler registered). |
| `stateChanged`, custom events | Span event on the causing command span, or a standalone `commiq.event:<name>` span when the cause is unknown. |
| `eventHandlingError` | Short `ERROR` span `commiq.event_handler:<event name>`; the command span stays `OK`. |
| `unhandledError` | Short `ERROR` span `commiq.error:<source>`. |
| `stateReset`, `<command>:handled` | Ignored. |

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
