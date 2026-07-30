declare module "react-dom/server" {
  import type { ReactNode } from "react";

  export function renderToString(element: ReactNode): string;
}
