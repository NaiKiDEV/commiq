import type { ReactNode } from "react";
import "./globals.css";
import { Provider } from "./provider";

export const metadata = {
  title: "Commiq",
  description:
    "Lightweight command & event driven state management for TypeScript",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
