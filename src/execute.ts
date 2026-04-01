import { adminUrl } from "./auth.ts";
import { die, printJSON, EXIT_ERROR } from "./output.ts";
import type { Auth } from "./auth.ts";

const MAX_ERROR_BODY_BYTES = 4 * 1024; // 4 KB

async function readErrorBody(response: Response): Promise<string> {
  const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
  if (!isNaN(contentLength) && contentLength > MAX_ERROR_BODY_BYTES) {
    return `[response body too large (${contentLength} bytes), truncated]`;
  }
  const raw = await response.text().catch(() => "(unreadable body)");
  return raw.length > MAX_ERROR_BODY_BYTES
    ? raw.slice(0, MAX_ERROR_BODY_BYTES) + "… [truncated]"
    : raw;
}

export interface ExecuteOptions {
  query: string;
  variables?: Record<string, unknown>;
  auth: Auth;
}

export async function execute(options: ExecuteOptions): Promise<void> {
  const { query, variables, auth } = options;
  const url = adminUrl(auth);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": auth.token,
      },
      body: JSON.stringify({
        query,
        ...(variables ? { variables } : {}),
      }),
    });
  } catch (err: unknown) {
    die(EXIT_ERROR, "NETWORK_ERROR",
      `Failed to reach Shopify API: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    // Do NOT include response headers in error (would leak auth token reflection risk)
    const body = await readErrorBody(response);
    die(EXIT_ERROR, "HTTP_ERROR", `HTTP ${response.status} from Shopify API`, body);
  }

  const json = await response.json().catch(() => {
    die(EXIT_ERROR, "PARSE_ERROR", "Shopify API returned non-JSON response");
  }) as { data?: unknown; errors?: Array<{ message: string; locations?: unknown; extensions?: unknown }> };

  // API-level errors (inside the GraphQL response) are separate from HTTP errors.
  // A response can have BOTH data and errors — output both, but exit 1.
  // Agents need the full context — partial data may still be useful.
  if (json.errors?.length) {
    printJSON({
      data: json.data ?? null,
      errors: json.errors.map(e => ({
        message: e.message,
        locations: e.locations ?? [],
        extensions: e.extensions ?? {},
      })),
    });
    process.exit(EXIT_ERROR);
  }

  // Success — print just the data field
  printJSON(json.data ?? null);
}
