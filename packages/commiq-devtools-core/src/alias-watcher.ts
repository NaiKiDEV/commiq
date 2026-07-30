import type { AliasReporter } from "./snapshot";
import type { DevtoolsErrorHandler } from "./types";

export const MAX_ALIAS_WARNINGS = 10;

export type AliasWatcher = {
  reporterFor(storeName: string, root: string): AliasReporter | undefined;
}

export function createAliasWatcher(onError: DevtoolsErrorHandler): AliasWatcher {
  const reported = new Set<string>();
  const reporters = new Map<string, AliasReporter>();

  const reporterFor = (storeName: string, root: string): AliasReporter | undefined => {
    if (reported.size >= MAX_ALIAS_WARNINGS) {
      reporters.clear();
      return undefined;
    }
    const scope = `${storeName} ${root}`;
    const cached = reporters.get(scope);
    if (cached) {
      return cached;
    }
    const reporter: AliasReporter = ({ path, kind }) => {
      if (reported.size >= MAX_ALIAS_WARNINGS) {
        return;
      }
      const location = path ? `${root}.${path}` : root;
      const key = `${scope} ${location}`;
      if (reported.has(key)) {
        return;
      }
      reported.add(key);
      onError(new Error(aliasMessage(storeName, location, kind)));
    };
    reporters.set(scope, reporter);
    return reporter;
  };

  return { reporterFor };
}

function aliasMessage(storeName: string, location: string, kind: string): string {
  return (
    `store "${storeName}": ${location} holds a ${kind} that snapshotMode "safe" captures by ` +
    "reference, so mutating it later rewrites already recorded history. " +
    'Use snapshotMode: "structured" to clone it, or set detectAliasedState: false to silence this.'
  );
}
