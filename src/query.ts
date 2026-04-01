import { getAuth } from "./auth.ts";
import { cacheExists } from "./cache.ts";
import { execute } from "./execute.ts";
import { run as introspectRun } from "./introspect.ts";
import { validateQuery } from "./validate.ts";
import { die, printJSON, printHelp, printValidationErrors, EXIT_INVALID, EXIT_ERROR } from "./output.ts";

const HELP = `
shopi query — Validate and execute a GraphQL query or mutation

USAGE
  shopi query "<gql>"            Execute a query inline
  shopi query - < file.graphql   Read query from stdin
  shopi query "<gql>" --dry-run  Validate only, do not execute

FLAGS
  --dry-run                 Validate against schema without executing
  --variables '<json>'      JSON object of query variables
  --store <domain>          Override SHOPIFY_STORE
  --token <token>           Override SHOPIFY_ACCESS_TOKEN
  --api-version <version>   Override SHOPIFY_API_VERSION
  --help                    Show this help

EXIT CODES
  0  Valid query (dry-run) or successful execution
  2  Query failed schema validation
  3  Schema not cached — run: shopi introspect
`.trim();

const MAX_QUERY_BYTES = 64 * 1024; // 64 KB

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_QUERY_BYTES) {
      die(EXIT_ERROR, "QUERY_TOO_LARGE", `Query input exceeds maximum size of ${MAX_QUERY_BYTES} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function run(args: string[], flags: Record<string, string>): Promise<void> {
  if (args.includes("--help") || args.length === 0) {
    printHelp(HELP);
    return;
  }

  const dryRun = args.includes("--dry-run");

  // Parse --variables flag
  // variables is parsed and validated here but passed to execute() in Phase 5
  const varIdx = args.indexOf("--variables");
  let variables: Record<string, unknown> | undefined;
  if (varIdx !== -1) {
    const varArg = args[varIdx + 1];
    if (!varArg || varArg.startsWith("--")) {
      die(EXIT_ERROR, "INVALID_ARGS", "--variables requires a JSON string argument");
    }
    try {
      const parsed = JSON.parse(varArg);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        die(EXIT_ERROR, "INVALID_ARGS", "--variables must be a JSON object (not array or null)");
      }
      variables = parsed as Record<string, unknown>;
    } catch {
      die(EXIT_ERROR, "INVALID_ARGS", "--variables must be valid JSON");
    }
  }

  // Resolve auth early — fail fast before blocking on stdin
  const auth = getAuth(flags as any);

  // Get the query string (first non-flag arg)
  const queryArg = args.find(a => !a.startsWith("--"));

  let queryString: string;
  if (!queryArg || queryArg === "-") {
    // Read from stdin
    queryString = await readStdin();
  } else {
    queryString = queryArg;
  }

  if (!queryString.trim()) {
    die(EXIT_ERROR, "MISSING_ARG", "Query string is empty");
  }

  // Auto-introspect if schema is not cached
  if (!cacheExists(auth.store, auth.apiVersion)) {
    process.stderr.write(JSON.stringify({ message: "Schema not cached. Running shopi introspect automatically..." }) + "\n");
    await introspectRun([], { store: auth.store, token: auth.token, apiVersion: auth.apiVersion });
  }

  // Validate
  const result = validateQuery(queryString, auth.store, auth.apiVersion);

  if (!result.valid) {
    printValidationErrors(result.errors);
    process.exit(EXIT_INVALID);
  }

  if (dryRun) {
    printJSON({ valid: true, errors: [] });
    return;
  }

  // Execute the query
  await execute({
    query: queryString,
    variables,
    auth,
  });
}
