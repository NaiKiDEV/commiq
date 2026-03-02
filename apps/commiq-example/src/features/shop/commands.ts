import { createCommand } from "@naikidev/commiq";

export const InventoryCommand = {
  reserveStock: (productId: number) =>
    createCommand("inventory:reserve-stock", { productId, qty: 1 }),
  releaseStock: (productId: number, qty: number) =>
    createCommand("inventory:release-stock", { productId, qty }),
};

export const ShopCartCommand = {
  remove: (productId: number) =>
    createCommand("shop-cart:remove", { productId }),
  clearError: () => createCommand("shop-cart:clear-error", undefined),
};
