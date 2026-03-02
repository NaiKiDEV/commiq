import { useSelector, useQueue } from "@naikidev/commiq-react";
import { inventoryStore, shopCartStore } from "./store";
import { InventoryCommand, ShopCartCommand } from "./commands";

export function useInventory() {
  const products = useSelector(inventoryStore, (s) => s.products);
  const queue = useQueue(inventoryStore);

  return {
    products,
    reserveStock: (productId: number) =>
      queue(InventoryCommand.reserveStock(productId)),
    releaseStock: (productId: number, qty: number) =>
      queue(InventoryCommand.releaseStock(productId, qty)),
  };
}

export function useShopCart() {
  const items = useSelector(shopCartStore, (s) => s.items);
  const lastError = useSelector(shopCartStore, (s) => s.lastError);
  const queue = useQueue(shopCartStore);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  return {
    items,
    lastError,
    total,
    remove: (productId: number) => queue(ShopCartCommand.remove(productId)),
    clearError: () => queue(ShopCartCommand.clearError()),
  };
}
