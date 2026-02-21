import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Commiq",
  tagline: "Command & event driven state management",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://commiq.dev",
  baseUrl: "/",

  organizationName: "naikidev",
  projectName: "commiq",

  onBrokenLinks: "throw",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "docs",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Commiq",
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://github.com/naikidev/commiq",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Getting Started",
              to: "/docs/getting-started",
            },
            {
              label: "API Reference",
              to: "/docs/api/store",
            },
          ],
        },
        {
          title: "Examples",
          items: [
            {
              label: "Store Dependencies",
              to: "/docs/examples/store-dependencies",
            },
            {
              label: "Async Commands",
              to: "/docs/examples/async-commands",
            },
            {
              label: "Event Stream",
              to: "/docs/examples/event-stream",
            },
          ],
        },
        {
          title: "Packages",
          items: [
            {
              label: "@naikidev/commiq",
              to: "/docs/api/store",
            },
            {
              label: "@naikidev/commiq-react",
              to: "/docs/react/hooks",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} naikidev. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
