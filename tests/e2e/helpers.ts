import { join } from "node:path";

const SHOPI = join(import.meta.dir, "../../dist/shopi.js");
const CALL_DELAY_MS = 250; // conservative spacing to avoid Shopify rate limits

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run `shopi query <gql> [--variables <json>]` as a real subprocess.
 * Returns the parsed stdout data on success, throws on any non-zero exit.
 */
export async function shopiQuery(
  gql: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  await sleep(CALL_DELAY_MS);

  const cmd: string[] = ["bun", SHOPI, "query", gql];
  if (variables) cmd.push("--variables", JSON.stringify(variables));

  const proc = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });

  const stdout = proc.stdout?.toString() ?? "";
  const stderr = proc.stderr?.toString() ?? "";

  if (proc.exitCode !== 0) {
    // Exit 2 = validation failure: errors are on stdout as JSON.
    // Exit 1 = auth/network/API error: detail is on stderr.
    const raw = proc.exitCode === 2 ? stdout : stderr;
    let detail = raw;
    try { detail = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
    throw new Error(`shopi exited ${proc.exitCode}:\n${detail}`);
  }

  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`shopi returned non-JSON stdout: ${stdout.slice(0, 300)}`);
  }
}

/**
 * Throw if the GraphQL response payload contains userErrors.
 */
export function assertNoUserErrors(data: unknown, mutationKey: string): void {
  const payload = (data as Record<string, unknown>)[mutationKey] as Record<string, unknown> | undefined;
  if (!payload) throw new Error(`No payload at key "${mutationKey}" in response`);
  const errs = (payload.userErrors as unknown[]) ?? [];
  if (errs.length > 0) {
    throw new Error(`${mutationKey} returned userErrors:\n${JSON.stringify(errs, null, 2)}`);
  }
}

/**
 * Timestamped log line for run.ts output.
 */
export function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}
