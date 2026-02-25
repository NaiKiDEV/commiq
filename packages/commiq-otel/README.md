# @naikidev/commiq-otel

OpenTelemetry tracing integration for Commiq stores. Creates spans for commands and records events as span events.

## Install

```bash
pnpm add @naikidev/commiq-otel @opentelemetry/api
```

## Usage

```typescript
import { instrumentStore } from "@naikidev/commiq-otel";

const uninstrument = instrumentStore(store, { storeName: "counter" });

// Later...
uninstrument();
```

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
