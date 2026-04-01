import { buildClientSchema, parse, validate, GraphQLError } from "graphql";
import { readCacheRaw } from "./cache.ts";
import { die, EXIT_NO_SCHEMA } from "./output.ts";

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    message: string;
    locations: Array<{ line: number; column: number }>;
  }>;
}

export function loadSchema(store: string, apiVersion: string) {
  const cached = readCacheRaw(store, apiVersion);
  if (!cached) {
    die(EXIT_NO_SCHEMA, "NO_SCHEMA", "Schema not cached. Run: shopi introspect");
  }
  let schema;
  try {
    schema = buildClientSchema(cached as any);
  } catch (err: unknown) {
    die(EXIT_NO_SCHEMA, "SCHEMA_CORRUPT",
      "Cached schema is corrupt or incomplete. Re-run: shopi introspect",
      err instanceof Error ? err.message : String(err)
    );
  }
  return schema;
}

export function validateQuery(queryString: string, store: string, apiVersion: string): ValidationResult {
  // Step 1: parse first — catches syntax errors WITHOUT needing the schema
  let document;
  try {
    document = parse(queryString, { maxTokens: 1000 });
  } catch (err: unknown) {
    const gqlErr = err as GraphQLError;
    return {
      valid: false,
      errors: [{
        message: gqlErr.message,
        locations: (gqlErr.locations ?? []).map(loc => ({ line: loc.line, column: loc.column })),
      }],
    };
  }

  // Step 2: load schema (only needed for semantic validation)
  const schema = loadSchema(store, apiVersion);

  // Step 3: semantic validation
  // graphql-js automatically includes "Did you mean X?" suggestions in error messages
  const errors = validate(schema, document);

  return {
    valid: errors.length === 0,
    errors: errors.map(e => ({
      message: e.message,
      locations: (e.locations ?? []).map(loc => ({ line: loc.line, column: loc.column })),
    })),
  };
}
