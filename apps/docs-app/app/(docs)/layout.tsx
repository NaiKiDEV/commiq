import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{ title: "Commiq Docs" }}
      links={[
        {
          text: "Commiq Examples",
          url: "https://naikidev.github.io/commiq/",
          external: true,
        },
        {
          text: "GitHub",
          url: "https://github.com/naikidev/commiq",
          external: true,
        },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
