import { die, EXIT_ERROR } from "./output.ts";

export interface Auth {
  store: string;
  token: string;
  apiVersion: string;
}

const DEFAULT_API_VERSION = "2025-04";

// Validate store domain — allowlist ONLY .myshopify.com subdomains (or bare subdomain)
// This prevents SSRF via IP addresses, internal hostnames, metadata endpoints, etc.
function validateStoreDomain(store: string): void {
  // Allowlist: only <subdomain>.myshopify.com
  // The store may be provided as "my-store" (bare) or "my-store.myshopify.com" (full)
  // Either form is acceptable; adminUrl() always builds the full https:// URL
  const ALLOWED = /^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}(\.myshopify\.com)?$/;

  // Reject known reserved hostnames even if they pass the pattern
  const RESERVED = new Set(["localhost", "local", "internal", "intranet"]);
  const baseName = store.endsWith(".myshopify.com")
    ? store.slice(0, -".myshopify.com".length)
    : store;

  if (!ALLOWED.test(store) || store.includes("..") || RESERVED.has(baseName.toLowerCase())) {
    die(
      EXIT_ERROR,
      "INVALID_STORE",
      `Invalid store domain: "${store}". Must be a .myshopify.com domain (e.g. my-store.myshopify.com).`
    );
  }
}

export function getAuth(overrides: Partial<Auth> = {}): Auth {
  const store   = overrides.store       ?? Bun.env.SHOPIFY_STORE;
  const token   = overrides.token       ?? Bun.env.SHOPIFY_ACCESS_TOKEN;
  const version = overrides.apiVersion  ?? Bun.env.SHOPIFY_API_VERSION ?? DEFAULT_API_VERSION;

  if (!store)  die(EXIT_ERROR, "AUTH_MISSING", "SHOPIFY_STORE is not set. Set it in .env or pass --store.");
  if (!token)  die(EXIT_ERROR, "AUTH_MISSING", "SHOPIFY_ACCESS_TOKEN is not set. Set it in .env or pass --token.");

  // Normalize store: strip protocol and trailing slash
  const normalizedStore = store.replace(/^https?:\/\//, "").replace(/\/$/, "");

  validateStoreDomain(normalizedStore);

  return { store: normalizedStore, token, apiVersion: version };
}

export function adminUrl(auth: Auth): string {
  // Ensure the store domain always has .myshopify.com suffix
  const storeDomain = auth.store.endsWith(".myshopify.com")
    ? auth.store
    : `${auth.store}.myshopify.com`;
  return `https://${storeDomain}/admin/api/${auth.apiVersion}/graphql.json`;
}
