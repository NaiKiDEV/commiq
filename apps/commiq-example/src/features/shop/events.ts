import { createEvent } from "@naikidev/commiq";

export const InventoryEvent = {
  StockReserved: createEvent<{ productId: number; qty: number }>(
    "inventory:stock-reserved",
  ),
  StockReleased: createEvent<{ productId: number; qty: number }>(
    "inventory:stock-released",
  ),
  OutOfStock: createEvent<{ productId: number }>("inventory:out-of-stock"),
};
