import { useSelector, useQueue } from "@naikidev/commiq-react";
import { cartStore } from "./store";
import { CartCommand } from "./commands";

export function useCart() {
  const items = useSelector(cartStore, (s) => s.items);
  const savedAt = useSelector(cartStore, (s) => s.savedAt);
  const queue = useQueue(cartStore);

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

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
