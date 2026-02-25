# @naikidev/commiq-devtools

Instrumentation and debugging tools for Commiq stores. Tracks events, causality chains, state history, and supports pluggable transports.

## Install

```bash
pnpm add @naikidev/commiq-devtools
```

## Usage

```typescript
import { createDevtools } from "@naikidev/commiq-devtools";

const devtools = createDevtools();
devtools.connect(store, "counter");

// Query the timeline
const timeline = devtools.getTimeline();
const chain = devtools.getChain(correlationId);
const history = devtools.getStateHistory("counter");
```

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
