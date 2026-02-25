---
sidebar_position: 5
---

# OpenTelemetry

`@naikidev/commiq-otel` instruments Commiq stores with [OpenTelemetry](https://opentelemetry.io/) tracing. Each command becomes a span, and events emitted during that command are recorded as span events, giving you end-to-end visibility in any OTel-compatible backend.

## Installation

```bash
pnpm add @naikidev/commiq-otel @opentelemetry/api
```

`@opentelemetry/api` is a peer dependency.

## Basic Usage

```typescript
import { createStore, createCommand, sealStore } from "@naikidev/commiq";
import { instrumentStore } from "@naikidev/commiq-otel";

const store = createStore({ count: 0 });
store.addCommandHandler("increment", (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});

const uninstrument = instrumentStore(store, { storeName: "counter" });

const sealed = sealStore(store);
sealed.queue(createCommand("increment", undefined));
```

## API

### `instrumentStore(store, options)`

Subscribes to a store's event stream and creates OpenTelemetry spans for command processing.

Returns a cleanup function that ends active spans and unsubscribes the listener.

```typescript
function instrumentStore(
  store: StoreWithStream,
  options: InstrumentOptions,
): () => void;
```

### Options

| Option           | Type     | Default    | Description                    |
| ---------------- | -------- | ---------- | ------------------------------ |
| `storeName`      | `string` | (required) | Display name used in span attributes |
| `tracerName`     | `string` | `"commiq"` | OpenTelemetry tracer name      |
| `tracerVersion`  | `string` | —          | OpenTelemetry tracer version   |

## Tracing Model

### Spans

Each command creates a span that lives from `commandStarted` to `commandHandled` (or `commandHandlingError`):

```
commiq.command:increment  [============================]
  ├─ span event: stateChanged
  └─ span event: itemAdded (custom event)
```

State changes and custom events emitted during a command are recorded as **span events** on the parent command span. Events emitted outside a command create standalone spans.

### Span Attributes

**Command spans** (`commiq.command:{name}`):

| Attribute                      | Description                           |
| ------------------------------ | ------------------------------------- |
| `commiq.store`                 | Store name                            |
| `commiq.command.name`          | Command name                          |
| `commiq.command.correlation_id`| Unique correlation ID                 |
| `commiq.command.caused_by`     | Parent event ID (if applicable)       |

**Standalone event spans** (`commiq.event:{name}`):

| Attribute                      | Description                           |
| ------------------------------ | ------------------------------------- |
| `commiq.store`                 | Store name                            |
| `commiq.event.name`            | Event name                            |
| `commiq.event.correlation_id`  | Unique correlation ID                 |
| `commiq.event.caused_by`       | Parent event ID (if applicable)       |

## Error Handling

When a command handler throws, the command span is:

1. Set to `ERROR` status with the error message
2. The exception is recorded on the span via `span.recordException()`
3. The span is ended

## Cleanup

Call the returned function to stop instrumentation:

```typescript
const uninstrument = instrumentStore(store, { storeName: "counter" });

// Later...
uninstrument();
```

This ends any in-flight spans and removes the stream listener.

## Full Example

Using the OpenTelemetry Node SDK with a console exporter:

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { createStore, createCommand, sealStore } from "@naikidev/commiq";
import { instrumentStore } from "@naikidev/commiq-otel";

// Set up OTel SDK
const sdk = new NodeSDK({ traceExporter: new ConsoleSpanExporter() });
sdk.start();

// Create and instrument a store
const store = createStore({ count: 0 });
store.addCommandHandler("increment", (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});

const uninstrument = instrumentStore(store, {
  storeName: "counter",
  tracerName: "my-app",
});

const sealed = sealStore(store);
sealed.queue(createCommand("increment", undefined));

// Cleanup
uninstrument();
await sdk.shutdown();
```
