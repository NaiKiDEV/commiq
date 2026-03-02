import { createCommand } from "@naikidev/commiq";

export const PipelineCommand = {
  placeOrder: (item: string, total: number) =>
    createCommand("order:place", { item, total }),
};
