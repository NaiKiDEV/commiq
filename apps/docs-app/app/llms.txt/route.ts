import { getCurrentPages } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  const lines: string[] = [];
  lines.push("# Commiq Documentation");
  lines.push("");
  lines.push(
    "Covers commiq 2.x. The site also hosts a frozen snapshot of the 1.x docs under /v1/, which is unmaintained and contains known inaccuracies; it is deliberately excluded here.",
  );
  lines.push("");
  for (const page of getCurrentPages()) {
    lines.push(
      `- [${page.data.title}](${page.url}): ${page.data.description ?? ""}`,
    );
  }
  return new Response(lines.join("\n"));
}
