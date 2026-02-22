---
sidebar_position: 4
---

# Devtools

Commiq includes built-in instrumentation and a devtools package for debugging, event inspection, and state tracking.

## Instrumentation

Every event and command in Commiq carries instrumentation metadata automatically:

- **`timestamp`** — `Date.now()` when the event was emitted
- **`correlationId`** — unique identifier for each event/command
- **`causedBy`** — links to the parent command or event that triggered this one (`null` for user-initiated commands)

This enables full causality tracking: you can trace any event back through the chain of commands and events that caused it.

## Installation

```bash
npm install @naikidev/commiq-devtools
```

## Basic Usage

```typescript
import { createStore, createCommand } from "@naikidev/commiq";
import { createDevtools } from "@naikidev/commiq-devtools";

const store = createStore({ count: 0 });
store.addCommandHandler("increment", (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});

// Connect devtools
const devtools = createDevtools();
devtools.connect(store, "counter");

// Events are now tracked and sent to the browser extension bridge
store.queue(createCommand("increment", undefined));
```

## Query API

Even without a browser extension, you can query the devtools programmatically:

```typescript
// Get full event timeline
const timeline = devtools.getTimeline();

// Filter by store
const counterEvents = devtools.getTimeline("counter");

// Get causality chain for an event
const chain = devtools.getChain(someCorrelationId);

// Get state change history
const history = devtools.getStateHistory("counter");
```

## Console Logging

Enable structured console output for quick debugging:

```typescript
const devtools = createDevtools({ logToConsole: true });
devtools.connect(store, "counter");

// Console output:
// [12:34:56.789] counter | commandStarted a3K9mX7p
// [12:34:56.789] counter | stateChanged b7yP2nX1 (caused by a3K9mX7p)
// [12:34:56.790] counter | commandHandled c1zR4qW8 (caused by a3K9mX7p)
```

## Custom Transports

The default transport uses `window.postMessage` for browser extension communication. You can provide custom transports for other environments:

```typescript
import { createDevtools, memoryTransport } from "@naikidev/commiq-devtools";

// In-memory transport for testing
const transport = memoryTransport();
const devtools = createDevtools({ transport });
devtools.connect(store, "counter");

// Inspect captured messages
console.log(transport.messages);
```

### Implementing a Custom Transport

```typescript
import type { Transport, DevtoolsMessage } from "@naikidev/commiq-devtools";

const customTransport: Transport = {
  send(message: DevtoolsMessage) {
    // Send to your backend, WebSocket, etc.
  },
  onMessage(handler) {
    // Listen for incoming messages
    return () => {
      /* cleanup */
    };
  },
  destroy() {
    // Clean up resources
  },
};

const devtools = createDevtools({ transport: customTransport });
```

## Options

| Option         | Type        | Default                    | Description           |
| -------------- | ----------- | -------------------------- | --------------------- |
| `transport`    | `Transport` | `windowMessageTransport()` | Message transport     |
| `maxEvents`    | `number`    | `1000`                     | Ring buffer size      |
| `logToConsole` | `boolean`   | `false`                    | Log events to console |

## Cleanup

```typescript
// Disconnect a single store
devtools.disconnect("counter");

// Disconnect all stores and clean up
devtools.destroy();
```
