# @naikidev/commiq

Command and event driven state management for JavaScript and TypeScript.

## Install

```bash
pnpm add @naikidev/commiq
```

## Usage

```typescript
import { createStore, createCommand, sealStore } from "@naikidev/commiq";

const store = createStore({ count: 0 });

store.addCommandHandler("increment", (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});

const sealed = sealStore(store);
sealed.queue(createCommand("increment", undefined));
```

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
