export const LEGACY_SEGMENT = "v1";

const LEGACY_PREFIX = `/${LEGACY_SEGMENT}`;

export function isLegacySlug(slug: string[] | undefined): boolean {
  return slug?.[0] === LEGACY_SEGMENT;
}

export function isLegacyUrl(url: string): boolean {
  return url === LEGACY_PREFIX || url.startsWith(`${LEGACY_PREFIX}/`);
}

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const SEARCH_INDEX_URL = `${BASE_PATH}/api/search`;
