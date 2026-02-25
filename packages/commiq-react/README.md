# @naikidev/commiq-react

React bindings for Commiq.

## Install

```bash
pnpm add @naikidev/commiq @naikidev/commiq-react
```

## Usage

```tsx
import { useSelector, useQueue } from "@naikidev/commiq-react";
import { createCommand } from "@naikidev/commiq";

function Counter() {
  const count = useSelector(counterStore, (s) => s.count);
  const queue = useQueue(counterStore);

  return (
    <button onClick={() => queue(createCommand("increment", undefined))}>
      Count: {count}
    </button>
  );
}
```

Hooks: `useSelector`, `useQueue`, `useEvent`, `CommiqProvider`.

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
