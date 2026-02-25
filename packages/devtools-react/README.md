# @naikidev/commiq-devtools-react

Embedded devtools panel for React applications. Inspect events, trace causality, view state, and monitor performance.

## Install

```bash
pnpm add @naikidev/commiq-devtools-react @naikidev/commiq-devtools
```

Peer dependencies: `@naikidev/commiq`, `react`, `react-dom`.

## Usage

```tsx
import { CommiqDevtools } from "@naikidev/commiq-devtools-react";

function App() {
  return (
    <>
      <YourApp />
      <CommiqDevtools stores={{ counter: counterStore }} />
    </>
  );
}
```

Auto-hides in production. Override with `enabled={true}` or `enabled={false}`.

## Documentation

Full docs at [naikidev.github.io/commiq](https://naikidev.github.io/commiq).

## License

MIT
