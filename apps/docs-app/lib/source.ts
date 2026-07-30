import { loader, type InferPageType } from "fumadocs-core/source";
import { docs } from "fumadocs-mdx:collections/server";
import { isLegacyUrl, LEGACY_SEGMENT } from "./docs-version";

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});

export function getCurrentPages(): InferPageType<typeof source>[] {
  return source.getPages().filter((page) => !isLegacyUrl(page.url));
}

export function getVersionTabs() {
  const currentUrls = new Set<string>();
  const legacyUrls = new Set<string>();

  for (const page of source.getPages()) {
    if (isLegacyUrl(page.url)) {
      legacyUrls.add(page.url);
    } else {
      currentUrls.add(page.url);
    }
  }

  return [
    {
      title: "2.x",
      description: "Current release",
      url: "/",
      urls: currentUrls,
    },
    {
      title: "v1 (legacy)",
      description: "Unmaintained, kept for 1.x users",
      url: `/${LEGACY_SEGMENT}`,
      urls: legacyUrls,
    },
  ];
}

export const currentSource: typeof source = {
  ...source,
  getPages: getCurrentPages,
};

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText("processed");

  return `# ${page.data.title} (${page.url})

${processed}`;
}
