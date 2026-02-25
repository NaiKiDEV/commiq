import {
  createStore,
  createCommand,
  createEvent,
  createEventBus,
  sealStore,
} from "@naikidev/commiq";
import { createDevtools } from "@naikidev/commiq-devtools";

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
}

export interface InventoryState {
  products: Product[];
}

export const stockReserved = createEvent<{ productId: number; qty: number }>(
  "stockReserved",
);
export const stockReleased = createEvent<{ productId: number; qty: number }>(
  "stockReleased",
);
export const outOfStock = createEvent<{ productId: number }>("outOfStock");

const _inventoryStore = createStore<InventoryState>({
  products: [
    { id: 1, name: "Wireless Keyboard", price: 79, stock: 3 },
    { id: 2, name: "USB-C Hub", price: 45, stock: 5 },
    { id: 3, name: "Monitor Stand", price: 120, stock: 1 },
    { id: 4, name: "Desk Lamp", price: 35, stock: 0 },
  ],
});

_inventoryStore
  .addCommandHandler<{ productId: number; qty: number }>(
    "reserveStock",
    (ctx, cmd) => {
      const { productId, qty } = cmd.data;
      const product = ctx.state.products.find((p) => p.id === productId);
      if (!product || product.stock < qty) {
        ctx.emit(outOfStock, { productId });
        return;
      }
      ctx.setState({
        products: ctx.state.products.map((p) =>
          p.id === productId ? { ...p, stock: p.stock - qty } : p,
        ),
      });
      ctx.emit(stockReserved, { productId, qty });
    },
    { notify: true },
  )
  .addCommandHandler<{ productId: number; qty: number }>(
    "releaseStock",
    (ctx, cmd) => {
      const { productId, qty } = cmd.data;
      ctx.setState({
        products: ctx.state.products.map((p) =>
          p.id === productId ? { ...p, stock: p.stock + qty } : p,
        ),
      });
      ctx.emit(stockReleased, { productId, qty });
    },
    { notify: true },
  );

export const inventoryStore = sealStore(_inventoryStore);

export interface CartItem {
  productId: number;
  name: string;
  price: number;
  qty: number;
}

export interface CartState {
  items: CartItem[];
  lastError: string;
}

const _cartStore = createStore<CartState>({ items: [], lastError: "" });

_cartStore
  .addCommandHandler<{ productId: number; name: string; price: number }>(
    "addToCart",
    (ctx, cmd) => {
      const { productId, name, price } = cmd.data;
      const existing = ctx.state.items.find((i) => i.productId === productId);
      if (existing) {
        ctx.setState({
          ...ctx.state,
          items: ctx.state.items.map((i) =>
            i.productId === productId ? { ...i, qty: i.qty + 1 } : i,
          ),
        });
      } else {
        ctx.setState({
          ...ctx.state,
          items: [...ctx.state.items, { productId, name, price, qty: 1 }],
        });
      }
    },
  )
  .addCommandHandler<{ productId: number }>("removeFromCart", (ctx, cmd) => {
    const item = ctx.state.items.find(
      (i) => i.productId === cmd.data.productId,
    );
    if (!item) return;
    ctx.setState({
      ...ctx.state,
      items: ctx.state.items.filter((i) => i.productId !== cmd.data.productId),
    });
  })
  .addCommandHandler<string>("setError", (ctx, cmd) => {
    ctx.setState({ ...ctx.state, lastError: cmd.data });
  })
  .addCommandHandler("clearError", (ctx) => {
    ctx.setState({ ...ctx.state, lastError: "" });
  });

export const cartStore = sealStore(_cartStore);

const shopBus = createEventBus();
shopBus.connect(_inventoryStore);
shopBus.connect(_cartStore);

shopBus.on(stockReserved, (event) => {
  const product = _inventoryStore.state.products.find(
    (p) => p.id === event.data.productId,
  );
  if (!product) return;
  _cartStore.queue(
    createCommand("addToCart", {
      productId: product.id,
      name: product.name,
      price: product.price,
    }),
  );
});

shopBus.on(outOfStock, (event) => {
  const product = _inventoryStore.state.products.find(
    (p) => p.id === event.data.productId,
  );
  _cartStore.queue(
    createCommand(
      "setError",
      `"${product?.name ?? "Product"}" is out of stock`,
    ),
  );
});

export const shopDevtools = createDevtools();
shopDevtools.connect(_inventoryStore, "INVENTORY_STORE");
shopDevtools.connect(_cartStore, "CART_STORE");

export const reserveStock = (productId: number) =>
  createCommand("reserveStock", { productId, qty: 1 });
export const releaseStock = (productId: number, qty: number) =>
  createCommand("releaseStock", { productId, qty });
export const removeFromCart = (productId: number) =>
  createCommand("removeFromCart", { productId });
export const clearError = () => createCommand("clearError", undefined);
