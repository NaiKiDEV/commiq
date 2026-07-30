import { useSelector, useQueue, shallowEqual } from "@naikidev/commiq-react";
import type { DeepReadonly } from "@naikidev/commiq";
import { cartStore } from "./store";
import type { CartState } from "./store";
import { CartCommand } from "./commands";

function selectCart(s: DeepReadonly<CartState>) {
  return {
    items: s.items,
    savedAt: s.savedAt,
    total: s.items.reduce((sum, i) => sum + i.price * i.qty, 0),
    itemCount: s.items.reduce((sum, i) => sum + i.qty, 0),
  };
}

export function useCart() {
  const { items, savedAt, total, itemCount } = useSelector(
    cartStore,
    selectCart,
    shallowEqual,
  );
  const queue = useQueue(cartStore);

  return {
    items,
    savedAt,
    total,
    itemCount,
    add: (productId: string) => queue(CartCommand.add(productId)),
    remove: (productId: string) => queue(CartCommand.remove(productId)),
    updateQty: (productId: string, qty: number) =>
      queue(CartCommand.updateQty(productId, qty)),
    clear: () => queue(CartCommand.clear()),
  };
}
