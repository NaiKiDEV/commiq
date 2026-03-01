import { createStore, createCommand, sealStore } from "@naikidev/commiq";
import { persistStore } from "@naikidev/commiq-persist";

export type CartItem = { id: string; name: string; price: number; qty: number };
export type CartState = { items: CartItem[]; savedAt: number | null };

export const products = [
  { id: "espresso", name: "Espresso", price: 3.5 },
  { id: "latte", name: "Caffè Latte", price: 5.0 },
  { id: "croissant", name: "Croissant", price: 4.25 },
  { id: "muffin", name: "Blueberry Muffin", price: 3.75 },
] as const;

export const addToCart = (productId: string) =>
  createCommand("addToCart", productId);
export const removeFromCart = (productId: string) =>
  createCommand("removeFromCart", productId);
export const updateQty = (productId: string, qty: number) =>
  createCommand("updateQty", { productId, qty });
export const clearCart = () => createCommand("clearCart", undefined);

const _cartStore = createStore<CartState>({ items: [], savedAt: null });

_cartStore
  .addCommandHandler<string>("addToCart", (ctx, cmd) => {
    const product = products.find((p) => p.id === cmd.data);
    if (!product) return;

    const existing = ctx.state.items.find((i) => i.id === cmd.data);
    const items = existing
      ? ctx.state.items.map((i) =>
          i.id === cmd.data ? { ...i, qty: i.qty + 1 } : i,
        )
      : [...ctx.state.items, { ...product, qty: 1 }];

    ctx.setState({ items, savedAt: Date.now() });
  })
  .addCommandHandler<string>("removeFromCart", (ctx, cmd) => {
    ctx.setState({
      items: ctx.state.items.filter((i) => i.id !== cmd.data),
      savedAt: Date.now(),
    });
  })
  .addCommandHandler<{ productId: string; qty: number }>(
    "updateQty",
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
  .addCommandHandler("clearCart", (ctx) => {
    ctx.setState({ items: [], savedAt: Date.now() });
  });

export const persistedCartStore = persistStore(_cartStore, {
  key: "commiq-cart",
});

export const cartPersistStore = sealStore(_cartStore);
