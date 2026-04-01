import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(store: string, apiVersion: string): string {
  return createHash("sha256").update(`${store}:${apiVersion}`).digest("hex");
}

export function cacheDir(store: string, apiVersion: string): string {
  const key = cacheKey(store, apiVersion);
  return join(homedir(), ".shopi", "cache", key);
}

export function cacheFilePath(store: string, apiVersion: string): string {
  return join(cacheDir(store, apiVersion), "schema.json");
}

export function readCache(store: string, apiVersion: string): object | null {
  const filePath = cacheFilePath(store, apiVersion);
  if (!existsSync(filePath)) return null;

  // Check TTL
  const stat = statSync(filePath);
  const age = Date.now() - stat.mtimeMs;
  if (age > CACHE_TTL_MS) return null;

  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export function readCacheRaw(store: string, apiVersion: string): object | null {
  // Like readCache but ignores TTL — used when the user knows they want the cached data
  const filePath = cacheFilePath(store, apiVersion);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export function writeCache(store: string, apiVersion: string, schema: object): void {
  const home = homedir();
  const shopiDir = join(home, ".shopi");
  const cacheBaseDir = join(shopiDir, "cache");
  const dir = cacheDir(store, apiVersion);

  // Create each directory level with owner-only permissions (700)
  for (const d of [shopiDir, cacheBaseDir, dir]) {
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: false, mode: 0o700 });
    }
  }

  // Write schema with owner-only read/write (600)
  writeFileSync(
    cacheFilePath(store, apiVersion),
    JSON.stringify(schema),
    { encoding: "utf-8", mode: 0o600 }
  );
}

export function cacheExists(store: string, apiVersion: string): boolean {
  return existsSync(cacheFilePath(store, apiVersion));
}
