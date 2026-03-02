import { createCommand } from "@naikidev/commiq";

export const CartCommand = {
  add: (productId: string) => createCommand("cart:add", { productId }),
  remove: (productId: string) => createCommand("cart:remove", { productId }),
  updateQty: (productId: string, qty: number) =>
    createCommand("cart:updateQty", { productId, qty }),
  clear: () => createCommand("cart:clear", undefined),
};
