#!/usr/bin/env bun
import { die, EXIT_ERROR, EXIT_SUCCESS } from "../src/output.ts";

const VERSION = "0.0.1";

const HELP = `
shopi — Shopify Admin GraphQL CLI

USAGE
  shopi <command> [options]

COMMANDS
  introspect                   Fetch and cache the Admin API GraphQL schema
  type <TypeName>              Look up a type's fields from the cached schema
  query <gql>                  Validate and execute a GraphQL query or mutation (--dry-run to validate only)
  search <term>                Search the schema for matching types or fields
  signature <operationName>    Show the full call signature of a mutation or query

GLOBAL FLAGS
  --store       <domain>   Shopify store domain (overrides SHOPIFY_STORE)
  --token       <token>    Access token (overrides SHOPIFY_ACCESS_TOKEN)
  --api-version <ver>      API version (overrides SHOPIFY_API_VERSION)
  --help                   Show help for a command
  --version                Show shopi version

AUTH
  Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN in your environment or .env file.
  See .env.example for the full list of supported variables.

EXIT CODES
  0  Success
  1  Auth / network / API error
  2  Query validation error
  3  Schema not found — run: shopi introspect
`.trim();

async function main() {
  const args = process.argv.slice(2);

  // Parse global flags
  let showHelp = false;
  let showVersion = false;
  const globalFlags: Record<string, string> = {};
  const filtered: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help") {
      showHelp = true;
    } else if (args[i] === "--version") {
      showVersion = true;
    } else if ((args[i] === "--store" || args[i] === "--token") && args[i + 1]) {
      globalFlags[args[i].slice(2)] = args[++i];
    } else if (args[i] === "--api-version" && args[i + 1]) {
      globalFlags["apiVersion"] = args[++i];
    } else {
      filtered.push(args[i]);
    }
  }

  // Handle --version and --help after flag parsing
  if (showVersion) {
    console.log(VERSION);
    process.exit(EXIT_SUCCESS);
  }
  // Show top-level help only when no subcommand is present;
  // otherwise forward --help to the subcommand via rest.
  const hasSubcommand = filtered.length > 0;
  if (args.length === 0 || (showHelp && !hasSubcommand)) {
    console.log(HELP);
    process.exit(EXIT_SUCCESS);
  }
  if (showHelp) {
    filtered.push("--help");
  }

  const [command, ...rest] = filtered;

  switch (command) {
    case "introspect": {
      const { run } = await import("../src/introspect.ts");
      await run(rest, globalFlags);
      break;
    }
    case "type": {
      const { run } = await import("../src/type.ts");
      await run(rest, globalFlags);
      break;
    }
    case "query": {
      const { run } = await import("../src/query.ts");
      await run(rest, globalFlags);
      break;
    }
    case "search": {
      const { run } = await import("../src/search.ts");
      await run(rest, globalFlags);
      break;
    }
    case "signature": {
      const { run } = await import("../src/signature.ts");
      await run(rest, globalFlags);
      break;
    }
    default:
      die(EXIT_ERROR, "UNKNOWN_COMMAND", `Unknown command: "${command}". Run shopi --help for usage.`);
  }
}

main().catch(err => {
  die(EXIT_ERROR, "UNEXPECTED", err?.message ?? String(err));
});
