"use client";

import { use, useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(
  key: string,
  setPromise: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(
    cachePromise("mermaid", () => import("mermaid")),
  );

  const isDark = resolvedTheme === "dark";

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    fontFamily: "inherit",
    theme: "base",
    themeVariables: {
      // Background and text
      background: isDark ? "#18181b" : "#ffffff",
      primaryTextColor: isDark ? "#fafafa" : "#18181b",
      secondaryTextColor: isDark ? "#a1a1aa" : "#52525b",

      // Primary colors - subtle, not in-your-face
      primaryColor: isDark ? "#27272a" : "#f4f4f5",
      primaryBorderColor: isDark ? "#52525b" : "#d4d4d8",

      // Secondary colors
      secondaryColor: isDark ? "#3f3f46" : "#e4e4e7",
      secondaryBorderColor: isDark ? "#52525b" : "#a1a1aa",

      // Tertiary colors
      tertiaryColor: isDark ? "#27272a" : "#fafafa",
      tertiaryBorderColor: isDark ? "#3f3f46" : "#e4e4e7",

      // Lines and borders
      lineColor: isDark ? "#71717a" : "#a1a1aa",

      // Flowchart specific
      nodeBorder: isDark ? "#52525b" : "#d4d4d8",
      clusterBkg: isDark ? "#27272a" : "#fafafa",
      clusterBorder: isDark ? "#3f3f46" : "#e4e4e7",

      // Edge labels
      edgeLabelBackground: isDark ? "#27272a" : "#ffffff",

      // Note styling
      noteBkgColor: isDark ? "#3f3f46" : "#fafaf9",
      noteBorderColor: isDark ? "#52525b" : "#d4d4d8",
      noteTextColor: isDark ? "#fafafa" : "#18181b",
    },
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () =>
      mermaid.render(id, chart.replaceAll("\\n", "\n")),
    ),
  );

  return (
    <div
      className="my-6 flex justify-center overflow-x-auto rounded-lg border bg-fd-card p-4"
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
