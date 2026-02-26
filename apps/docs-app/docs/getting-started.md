---
sidebar_position: 2
---

# Getting Started

## Installation

```bash
# Core library
pnpm add @naikidev/commiq

# React bindings (optional)
pnpm add @naikidev/commiq-react
```

## Your First Store

### 1. Define the state

```ts
interface CounterState {
  count: number;
}
```

### 2. Create the store and add handlers

```ts
import { createStore, createCommand, sealStore } from "@naikidev/commiq";

const _store = createStore<CounterState>({ count: 0 });

_store
  .addCommandHandler("increment", (ctx) => {
    ctx.setState({ count: ctx.state.count + 1 });
  })
  .addCommandHandler("decrement", (ctx) => {
    ctx.setState({ count: ctx.state.count - 1 });
  });
```

### 3. Seal the store

Sealing prevents direct access to `addCommandHandler` and `addEventHandler`, ensuring consumers can only read state and queue commands.

```ts
export const counterStore = sealStore(_store);
```

### 4. Use it

```ts
counterStore.queue(createCommand("increment", undefined));
console.log(counterStore.state.count); // 1
```

## Using with React

```tsx
import { CommiqProvider, useSelector, useQueue } from "@naikidev/commiq-react";
import { counterStore } from "./stores/counter";
import { createCommand } from "@naikidev/commiq";

function App() {
  return (
    <CommiqProvider stores={{ counter: counterStore }}>
      <Counter />
    </CommiqProvider>
  );
}

function Counter() {
  const count = useSelector(counterStore, (s) => s.count);
  const queue = useQueue(counterStore);

  return (
    <div>
      <p>{count}</p>
      <button onClick={() => queue(createCommand("increment", undefined))}>
        +1
      </button>
    </div>
  );
}
```

## Add Devtools

During development, drop in the `CommiqDevtools` component to see store activity, trace causality chains, and inspect state:

```bash
pnpm add @naikidev/commiq-devtools
```

```tsx
import { CommiqDevtools } from "@naikidev/commiq-devtools";
import { counterStore } from "./stores/counter";

function App() {
  return (
    <>
      <Counter />
      <CommiqDevtools stores={{ counter: counterStore }} />
    </>
  );
}
```
