import {
  createStore,
  createCommand,
  createEventBus,
  sealStore,
} from "@naikidev/commiq";
import { createDevtools } from "@naikidev/commiq-devtools-core";
import { InventoryEvent } from "./events";

export type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
};

export type InventoryState = {
  products: Product[];
};

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
    "inventory:reserve-stock",
    (ctx, cmd) => {
      const { productId, qty } = cmd.data;
      const product = ctx.state.products.find((p) => p.id === productId);
      if (!product || product.stock < qty) {
        ctx.emit(InventoryEvent.OutOfStock, { productId });
        return;
      }
      ctx.setState({
        products: ctx.state.products.map((p) =>
          p.id === productId ? { ...p, stock: p.stock - qty } : p,
        ),
      });
      ctx.emit(InventoryEvent.StockReserved, { productId, qty });
    },
    { notify: true },
  )
  .addCommandHandler<{ productId: number; qty: number }>(
    "inventory:release-stock",
    (ctx, cmd) => {
      const { productId, qty } = cmd.data;
      ctx.setState({
        products: ctx.state.products.map((p) =>
          p.id === productId ? { ...p, stock: p.stock + qty } : p,
        ),
      });
      ctx.emit(InventoryEvent.StockReleased, { productId, qty });
    },
    { notify: true },
  );

export type ShopCartItem = {
  productId: number;
  name: string;
  price: number;
  qty: number;
};

export type ShopCartState = {
  items: ShopCartItem[];
  lastError: string;
};

const _cartStore = createStore<ShopCartState>({ items: [], lastError: "" });

_cartStore
  .addCommandHandler<{ productId: number; name: string; price: number }>(
    "shop-cart:add",
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
  .addCommandHandler<{ productId: number }>("shop-cart:remove", (ctx, cmd) => {
    ctx.setState({
      ...ctx.state,
      items: ctx.state.items.filter((i) => i.productId !== cmd.data.productId),
    });
  })
  .addCommandHandler<string>("shop-cart:set-error", (ctx, cmd) => {
    ctx.setState({ ...ctx.state, lastError: cmd.data });
  })
  .addCommandHandler("shop-cart:clear-error", (ctx) => {
    ctx.setState({ ...ctx.state, lastError: "" });
  });

const shopBus = createEventBus();
shopBus.connect(_inventoryStore);
shopBus.connect(_cartStore);

shopBus.on(InventoryEvent.StockReserved, (event) => {
  const product = _inventoryStore.state.products.find(
    (p) => p.id === event.data.productId,
  );
  if (!product) return;
  _cartStore.queue(
    createCommand("shop-cart:add", {
      productId: product.id,
      name: product.name,
      price: product.price,
    }),
  );
});

shopBus.on(InventoryEvent.OutOfStock, (event) => {
  const product = _inventoryStore.state.products.find(
    (p) => p.id === event.data.productId,
  );
  _cartStore.queue(
    createCommand(
      "shop-cart:set-error",
      `"${product?.name ?? "Product"}" is out of stock`,
    ),
  );
});

export const inventoryStore = sealStore(_inventoryStore);
export const shopCartStore = sealStore(_cartStore);

export const shopDevtools = createDevtools();
shopDevtools.connect(_inventoryStore, "INVENTORY_STORE");
shopDevtools.connect(_cartStore, "CART_STORE");
