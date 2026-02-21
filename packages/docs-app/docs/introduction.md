---
slug: /
sidebar_position: 1
---

# Introduction

**Commiq** is a lightweight, command & event driven state management library for TypeScript and React.

Instead of directly mutating state, you describe _what should happen_ via **commands**, and the store's handlers decide _how_ the state changes. Handlers can emit **events** to notify other parts of your application — enabling clean, decoupled architectures.

## Key Concepts

| Concept         | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| **Command**     | A request to do something — dispatched via `queue()`           |
| **Handler**     | A function that processes a command and updates state           |
| **Event**       | A notification that something happened — emitted by handlers   |
| **Store**       | Holds state, routes commands to handlers, broadcasts events    |
| **Sealed Store**| A read-only proxy exposing only `state`, `queue`, and streams  |
| **Event Bus**   | Routes events between multiple stores                          |

## Packages

- **`@naikidev/commiq`** — Core library (framework-agnostic)
- **`@naikidev/commiq-react`** — React bindings (`useSelector`, `useQueue`, `useEvent`, `CommiqProvider`)

## Quick Example

```ts
import { createStore, createCommand, sealStore } from "@naikidev/commiq";

const store = createStore({ count: 0 });

store.addCommandHandler("increment", (ctx) => {
  ctx.setState({ count: ctx.state.count + 1 });
});

const sealed = sealStore(store);
sealed.queue(createCommand("increment", undefined));
```
