import Link from "next/link";
import { Callout } from "fumadocs-ui/components/callout";

export function LegacyDocsBanner() {
  return (
    <Callout type="warn" title="These are the v1 docs. They are not maintained.">
      <p>
        This page is a verbatim snapshot of the commiq 1.x documentation, kept
        for people still running 1.x. It is not corrected and not tested against
        any release. Several pages contain claims that were wrong when written:
        examples that do not run as printed, <code>sealStore</code> described as
        read-only when it was not, <code>handledEvent</code> presented as a
        working subscription pattern when it never matched, and effects
        described as swallowing only <code>AbortError</code> when they swallowed
        everything.
      </p>
      <p>
        Do not treat anything here as a statement about how commiq 2.x behaves.
      </p>
      <p>
        <Link href="/migration-v2">What changed in 2.0 and how to upgrade</Link>
        {" · "}
        <Link href="/">Current documentation</Link>
      </p>
      <p>
        Site search only indexes the current docs. Use the sidebar to browse
        these pages.
      </p>
    </Callout>
  );
}
