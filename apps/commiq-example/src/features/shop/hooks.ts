import { useSelector, useQueue, shallowEqual } from "@naikidev/commiq-react";
import type { DeepReadonly } from "@naikidev/commiq";
import { inventoryStore, shopCartStore } from "./store";
import type { InventoryState, ShopCartState } from "./store";
import { InventoryCommand, ShopCartCommand } from "./commands";

function selectProducts(s: DeepReadonly<InventoryState>) {
  return s.products;
}

function selectShopCart(s: DeepReadonly<ShopCartState>) {
  return {
    items: s.items,
    lastError: s.lastError,
    total: s.items.reduce((sum, i) => sum + i.price * i.qty, 0),
  };
}

export function useInventory() {
  const products = useSelector(inventoryStore, selectProducts);
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
  const { items, lastError, total } = useSelector(
    shopCartStore,
    selectShopCart,
    shallowEqual,
  );
  const queue = useQueue(shopCartStore);

  return {
    items,
    lastError,
    total,
    remove: (productId: number) => queue(ShopCartCommand.remove(productId)),
    clearError: () => queue(ShopCartCommand.clearError()),
  };
}
