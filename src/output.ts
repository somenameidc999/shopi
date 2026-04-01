// Exit code constants
export const EXIT_SUCCESS = 0;
export const EXIT_ERROR = 1;       // auth/network/API error
export const EXIT_INVALID = 2;     // query validation failure
export const EXIT_NO_SCHEMA = 3;   // schema cache missing

// Detect color support
const useColorOut = Boolean(process.stdout.isTTY);
const useColorErr = Boolean(process.stderr.isTTY);

const green = (s: string) => useColorOut ? `\x1b[32m${s}\x1b[0m` : s;
const red   = (s: string) => useColorErr ? `\x1b[31m${s}\x1b[0m` : s;
const dim   = (s: string) => useColorOut ? `\x1b[2m${s}\x1b[0m`  : s;

export function printSuccess(msg: string): void {
  console.log(`${dim("✓")} ${green(msg)}`);
}

export function printJSON(obj: unknown): void {
  console.log(JSON.stringify(obj, null, 2));
}

// Errors always go to stderr as JSON — agent-friendly
export function printError(code: string, message: string, detail?: unknown): void {
  const payload: Record<string, unknown> = { error: message, code };
  if (detail !== undefined) payload.detail = detail;
  process.stderr.write(red(JSON.stringify(payload)) + "\n");
}

export function printValidationErrors(errors: Array<{ message: string; locations?: Array<{ line: number; column: number }> }>): void {
  printJSON({
    valid: false,
    errors: errors.map(e => ({
      message: e.message,
      locations: e.locations ?? [],
    })),
  });
}

export function printHelp(text: string): void {
  console.log(text);
}

export function die(code: number, errorCode: string, message: string, detail?: unknown): never {
  printError(errorCode, message, detail);
  process.exit(code);
}
