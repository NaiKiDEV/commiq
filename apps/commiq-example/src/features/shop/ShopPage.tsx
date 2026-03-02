import React, { useEffect } from "react";
import { useInventory, useShopCart } from "./hooks";
import { Card, CardHeader, CardBody, Button, Badge } from "../../components/ui";
import { CodeExplorer } from "../../components/CodeExplorer";

import eventsRaw from "./events.ts?raw";
import commandsRaw from "./commands.ts?raw";
import storeRaw from "./store.ts?raw";
import hooksRaw from "./hooks.ts?raw";
import pageRaw from "./ShopPage.tsx?raw";

export function ShopPage() {
  const { products, reserveStock, releaseStock } = useInventory();
  const { items, lastError, total, remove, clearError } = useShopCart();

  useEffect(() => {
    if (lastError) {
      const t = setTimeout(clearError, 3000);
      return () => clearTimeout(t);
    }
  }, [lastError]);

  return (
    <CodeExplorer
      title="Store Dependencies"
      description="Two stores (Inventory + Cart) communicate through an Event Bus. Adding to cart reserves stock via a command on the inventory store, which emits stockReserved — the bus then routes it to add the item to the cart store."
      files={[
        { name: "events.ts", content: eventsRaw },
        { name: "commands.ts", content: commandsRaw },
        { name: "store.ts", content: storeRaw },
        { name: "hooks.ts", content: hooksRaw },
        { name: "ShopPage.tsx", content: pageRaw },
      ]}
    >
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
                        onClick={() => reserveStock(p.id)}
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
            <CardHeader title="Cart" badge="shopCartStore" />
            <CardBody className="space-y-3">
              {items.length === 0 && (
                <p className="text-sm text-zinc-400 text-center py-4">
                  Cart is empty
                </p>
              )}
              {items.map((item) => (
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
                        remove(item.productId);
                        releaseStock(item.productId, item.qty);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              {items.length > 0 && (
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>${total}</span>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </CodeExplorer>
  );
}
