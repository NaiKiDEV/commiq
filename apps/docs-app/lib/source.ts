import { loader, type InferPageType } from "fumadocs-core/source";
import { docs } from "fumadocs-mdx:collections/server";
import { isLegacyUrl } from "./docs-version";

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});

export function getCurrentPages(): InferPageType<typeof source>[] {
  return source.getPages().filter((page) => !isLegacyUrl(page.url));
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
