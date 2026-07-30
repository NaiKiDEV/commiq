import { getCurrentPages, getLLMText } from "@/lib/source";

export const revalidate = false;

const PREAMBLE = `# Commiq Documentation (full text)

Covers commiq 2.x. The frozen 1.x snapshot under /v1/ is unmaintained and contains known inaccuracies, so it is excluded from this file.`;

export async function GET() {
  const scan = getCurrentPages().map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response([PREAMBLE, ...scanned].join("\n\n"));
}
