import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Manifest = {
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
};

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

const escapeForRegExp = (value: string) => value.replace(REGEXP_SPECIALS, "\\$&");

const readManifest = (configUrl: string): Manifest => {
  const packageDir = dirname(fileURLToPath(configUrl));
  return JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8")) as Manifest;
};

export const externalsFromManifest = (configUrl: string) => {
  const manifest = readManifest(configUrl);
  const names = [
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.dependencies ?? {}),
  ];

  if (names.length === 0) {
    return () => false;
  }

  const pattern = new RegExp(`^(${names.map(escapeForRegExp).join("|")})(/|$)`);

  return (id: string) => pattern.test(id);
};
