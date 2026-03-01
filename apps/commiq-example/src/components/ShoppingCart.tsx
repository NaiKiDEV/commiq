import React from "react";
import { useSelector, useQueue } from "@naikidev/commiq-react";
import {
  cartPersistStore,
  products,
  addToCart,
  removeFromCart,
  updateQty,
  clearCart,
} from "../stores/cart.store";
import { PageHeader, Card, CardHeader, CardBody, Button, Badge } from "./ui";

function formatPrice(cents: number) {
  return `$${cents.toFixed(2)}`;
}

function formatTime(ts: number | null) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleTimeString();
}

export function ShoppingCartPage() {
  const items = useSelector(cartPersistStore, (s) => s.items);
  const savedAt = useSelector(cartPersistStore, (s) => s.savedAt);
  const queue = useQueue(cartPersistStore);

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <>
      <PageHeader
        title="Persistent Cart"
        description="Shopping cart persisted to localStorage via commiq-persist. Add items, refresh the page — your cart survives."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-max">
          <CardHeader title="Products" badge="persistStore" />
          <CardBody className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex flex-col items-center gap-2 rounded-lg border border-zinc-100 dark:border-zinc-800 p-4"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatPrice(p.price)}
                </span>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => queue(addToCart(p.id))}
                >
                  Add to Cart
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cart" badge={`${itemCount} items`} />
          <CardBody className="space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-6">
                Your cart is empty. Add some items!
              </p>
            ) : (
              <>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatPrice(item.price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="xs"
                        onClick={() => queue(updateQty(item.id, item.qty - 1))}
                      >
                        −
                      </Button>
                      <span className="text-sm font-medium tabular-nums w-6 text-center">
                        {item.qty}
                      </span>
                      <Button
                        size="xs"
                        onClick={() => queue(updateQty(item.id, item.qty + 1))}
                      >
                        +
                      </Button>
                    </div>
                    <span className="text-sm font-semibold tabular-nums w-16 text-right">
                      {formatPrice(item.price * item.qty)}
                    </span>
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={() => queue(removeFromCart(item.id))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {formatPrice(total)}
                  </span>
                </div>
              </>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Last saved: {formatTime(savedAt)}
              </span>
              <Button
                size="xs"
                variant="danger"
                onClick={() => queue(clearCart())}
                disabled={items.length === 0}
              >
                Clear Cart
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
