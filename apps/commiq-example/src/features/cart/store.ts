import { createStore, sealStore } from "@naikidev/commiq";
import { persistStore } from "@naikidev/commiq-persist";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

export type CartState = {
  items: CartItem[];
  savedAt: number | null;
};

export const products = [
  { id: "espresso", name: "Espresso", price: 3.5 },
  { id: "latte", name: "Caffè Latte", price: 5.0 },
  { id: "croissant", name: "Croissant", price: 4.25 },
  { id: "muffin", name: "Blueberry Muffin", price: 3.75 },
] as const;

export const initialState: CartState = { items: [], savedAt: null };

const _store = createStore<CartState>(initialState);

_store
  .addCommandHandler<{ productId: string }>("cart:add", (ctx, cmd) => {
    const product = products.find((p) => p.id === cmd.data.productId);
    if (!product) return;

    const existing = ctx.state.items.find((i) => i.id === cmd.data.productId);
    const items = existing
      ? ctx.state.items.map((i) =>
          i.id === cmd.data.productId ? { ...i, qty: i.qty + 1 } : i,
        )
      : [...ctx.state.items, { ...product, qty: 1 }];

    ctx.setState({ items, savedAt: Date.now() });
  })
  .addCommandHandler<{ productId: string }>("cart:remove", (ctx, cmd) => {
    ctx.setState({
      items: ctx.state.items.filter((i) => i.id !== cmd.data.productId),
      savedAt: Date.now(),
    });
  })
  .addCommandHandler<{ productId: string; qty: number }>(
    "cart:updateQty",
    (ctx, cmd) => {
      const { productId, qty } = cmd.data;
      if (qty <= 0) {
        ctx.setState({
          items: ctx.state.items.filter((i) => i.id !== productId),
          savedAt: Date.now(),
        });
      } else {
        ctx.setState({
          items: ctx.state.items.map((i) =>
            i.id === productId ? { ...i, qty } : i,
          ),
          savedAt: Date.now(),
        });
      }
    },
  )
  .addCommandHandler("cart:clear", (ctx) => {
    ctx.setState({ items: [], savedAt: Date.now() });
  });

export const persistedCartStore = persistStore(_store, {
  key: "commiq-cart",
});

export const cartStore = sealStore(_store);
