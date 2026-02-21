import React, { useEffect } from "react";
import { useSelector, useQueue, useEvent } from "@naikidev/commiq-react";
import {
  inventoryStore,
  cartStore,
  reserveStock,
  removeFromCart,
  releaseStock,
  clearError,
  outOfStock,
} from "../stores/shop.store";
import { PageHeader, Card, CardHeader, CardBody, Button, Badge } from "./ui";

export function StoreDepsPage() {
  const products = useSelector(inventoryStore, (s) => s.products);
  const cartItems = useSelector(cartStore, (s) => s.items);
  const lastError = useSelector(cartStore, (s) => s.lastError);
  const queueInventory = useQueue(inventoryStore);
  const queueCart = useQueue(cartStore);

  useEffect(() => {
    if (lastError) {
      const t = setTimeout(() => queueCart(clearError()), 3000);
      return () => clearTimeout(t);
    }
  }, [lastError]);

  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <>
      <PageHeader
        title="Store Dependencies"
        description="Two stores (Inventory + Cart) communicate through an Event Bus. Adding to cart reserves stock via a command on the inventory store, which emits stockReserved — the bus then routes it to add the item to the cart store."
      />

      {lastError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {lastError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader title="Inventory" badge="inventoryStore" />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 dark:border-zinc-800 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-zinc-400">${p.price}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge color={p.stock > 0 ? "green" : "red"}>
                        {p.stock} left
                      </Badge>
                      <Button
                        size="xs"
                        variant="primary"
                        disabled={p.stock === 0}
                        onClick={() => queueInventory(reserveStock(p.id))}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Cart" badge="cartStore" />
            <CardBody className="space-y-3">
              {cartItems.length === 0 && (
                <p className="text-sm text-zinc-400 text-center py-4">
                  Cart is empty
                </p>
              )}
              {cartItems.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-zinc-400 ml-1">× {item.qty}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-zinc-500">
                      ${item.price * item.qty}
                    </span>
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={() => {
                        queueCart(removeFromCart(item.productId));
                        queueInventory(releaseStock(item.productId, item.qty));
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              {cartItems.length > 0 && (
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>${total}</span>
                </div>
              )}
            </CardBody>
          </Card>

          <div className="mt-4 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-4 text-xs text-zinc-500 dark:text-zinc-400 font-mono space-y-1">
            <p>flow: Add button → inventoryStore.queue(reserveStock)</p>
            <p>→ handler emits stockReserved event</p>
            <p>→ eventBus.on(stockReserved) → cartStore.queue(addToCart)</p>
          </div>
        </div>
      </div>
    </>
  );
}
