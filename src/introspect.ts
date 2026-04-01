import { getIntrospectionQuery } from "graphql";
import { writeFileSync } from "node:fs";
import { getAuth, adminUrl } from "./auth.ts";
import { readCache, writeCache, cacheFilePath } from "./cache.ts";
import { die, printSuccess, printJSON, printHelp, EXIT_ERROR } from "./output.ts";

const HELP = `
shopi introspect — Fetch and cache the Admin API GraphQL schema

USAGE
  shopi introspect [flags]

FLAGS
  --refresh           Force re-fetch even if cache is fresh
  --output <file>     Write schema JSON to a file instead of (or in addition to) caching
  --help              Show this help
`.trim();

export async function run(args: string[], flags: Record<string, string>): Promise<void> {
  if (args.includes("--help")) {
    printHelp(HELP);
    return;
  }

  const refresh = args.includes("--refresh");
  const outputIdx = args.indexOf("--output");
  const nextArg = outputIdx !== -1 ? args[outputIdx + 1] : undefined;
  const outputFile = nextArg && !nextArg.startsWith("--") ? nextArg : undefined;
  if (outputIdx !== -1 && !outputFile) {
    die(EXIT_ERROR, "INVALID_ARGS", "--output requires a file path argument");
  }

  const auth = getAuth(flags as any);
  const url = adminUrl(auth);

  // Check cache first (unless --refresh)
  if (!refresh) {
    const cached = readCache(auth.store, auth.apiVersion);
    if (cached) {
      printSuccess(`Schema already cached (use --refresh to re-fetch)`);
      if (outputFile) {
        writeFileSync(outputFile, JSON.stringify(cached, null, 2), "utf-8");
        printSuccess(`Schema written to ${outputFile}`);
      }
      return;
    }
  }

  // Fetch
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": auth.token,
      },
      body: JSON.stringify({ query: getIntrospectionQuery() }),
    });
  } catch (err: unknown) {
    die(EXIT_ERROR, "NETWORK_ERROR", `Failed to reach ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    const rawBody = await response.text().catch(() => "(unreadable body)");
    const body = rawBody.length > 4096 ? rawBody.slice(0, 4096) + "… [truncated]" : rawBody;
    die(EXIT_ERROR, "HTTP_ERROR", `HTTP ${response.status} from Shopify API`, body);
  }

  const json = await response.json() as { data?: object; errors?: unknown[] };

  if (json.errors?.length) {
    die(EXIT_ERROR, "GRAPHQL_ERROR", "Introspection query returned errors", json.errors);
  }

  if (!json.data) {
    die(EXIT_ERROR, "INVALID_RESPONSE", "Shopify API returned no data");
  }

  const introspectionResult = json.data as any;

  // Write to cache
  writeCache(auth.store, auth.apiVersion, introspectionResult);

  // Write to output file if requested
  if (outputFile) {
    writeFileSync(outputFile, JSON.stringify(introspectionResult, null, 2), "utf-8");
    printSuccess(`Schema written to ${outputFile}`);
  }

  // Print summary
  const allTypes: any[] = introspectionResult.__schema?.types ?? [];
  const userTypes = allTypes.filter((t: any) => !t.name.startsWith("__"));
  const objectTypes = userTypes.filter((t: any) => t.kind === "OBJECT");
  const inputTypes = userTypes.filter((t: any) => t.kind === "INPUT_OBJECT");
  const enumTypes = userTypes.filter((t: any) => t.kind === "ENUM");
  const mutationType = introspectionResult.__schema?.mutationType?.name;
  const mutationTypeDef = allTypes.find((t: any) => t.name === mutationType);
  const mutationCount = mutationTypeDef?.fields?.length ?? 0;

  printSuccess(`Schema cached for ${auth.store} (API ${auth.apiVersion})`);
  printJSON({
    store: auth.store,
    apiVersion: auth.apiVersion,
    types: {
      total: userTypes.length,
      objects: objectTypes.length,
      inputs: inputTypes.length,
      enums: enumTypes.length,
    },
    mutations: mutationCount,
    cachedAt: new Date().toISOString(),
    cachePath: cacheFilePath(auth.store, auth.apiVersion),
  });
}
