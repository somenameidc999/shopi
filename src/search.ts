import { getAuth } from "./auth.ts";
import { readCacheRaw } from "./cache.ts";
import { die, printJSON, printHelp, EXIT_NO_SCHEMA, EXIT_ERROR } from "./output.ts";

const HELP = `
shopi search — Search the schema for matching types or fields

USAGE
  shopi search <term> [flags]

EXAMPLES
  shopi search "discount"
  shopi search "fulfillment" --kind MUTATION
  shopi search "input" --kind INPUT_OBJECT

FLAGS
  --kind <kind>   Filter by type kind: OBJECT, INPUT_OBJECT, ENUM, SCALAR,
                  INTERFACE, UNION, MUTATION, QUERY
  --help          Show this help
`.trim();

// Reuse the same formatType from type.ts — copy it here (no shared util yet)
function formatType(typeRef: any, depth = 0): string {
  if (depth > 20) return "...";
  if (!typeRef) return "Unknown";
  if (typeRef.kind === "NON_NULL") return `${formatType(typeRef.ofType, depth + 1)}!`;
  if (typeRef.kind === "LIST") return `[${formatType(typeRef.ofType, depth + 1)}]`;
  return typeRef.name ?? "Unknown";
}

function formatArgSlim(arg: any): { name: string; type: string } {
  return {
    name: arg.name,
    type: formatType(arg.type),
  };
}

type MatchResult = {
  match: "type" | "field";
  name: string;
  kind: string;
  description: string | null;
  parent: string | null;
  parentKind?: string;
  type?: string;
  args?: Array<{ name: string; type: string }>;
  _rank: number; // 0=exact, 1=prefix, 2=contains — stripped before output
};

function rankMatch(name: string, term: string): number | null {
  const n = name.toLowerCase();
  const t = term.toLowerCase();
  if (n === t) return 0;
  if (n.startsWith(t)) return 1;
  if (n.includes(t)) return 2;
  return null;
}

export async function run(args: string[], flags: Record<string, string>): Promise<void> {
  if (args.includes("--help") || args.length === 0) {
    printHelp(HELP);
    return;
  }

  const kindIdx = args.indexOf("--kind");
  const kindFilter = kindIdx !== -1 ? args[kindIdx + 1]?.toUpperCase() : undefined;
  if (kindIdx !== -1 && (!kindFilter || kindFilter.startsWith("--"))) {
    die(EXIT_ERROR, "INVALID_ARGS", "--kind requires a value (e.g. --kind OBJECT)");
  }
  const VALID_KINDS = new Set(["OBJECT", "INPUT_OBJECT", "ENUM", "SCALAR", "INTERFACE", "UNION", "MUTATION", "QUERY"]);
  if (kindFilter && !VALID_KINDS.has(kindFilter)) {
    die(EXIT_ERROR, "INVALID_ARGS", `Invalid --kind "${kindFilter}". Valid values: OBJECT, INPUT_OBJECT, ENUM, SCALAR, INTERFACE, UNION, MUTATION, QUERY`);
  }

  const term = args.find(a => !a.startsWith("--"));
  if (!term) {
    die(EXIT_ERROR, "MISSING_ARG", "Usage: shopi search <term> [--kind <kind>]");
  }

  const auth = getAuth(flags as any);
  const cached = readCacheRaw(auth.store, auth.apiVersion);
  if (!cached) {
    die(EXIT_NO_SCHEMA, "NO_SCHEMA", "Schema not cached. Run: shopi introspect");
  }

  const schema = (cached as any).__schema;
  const allTypes: any[] = schema?.types ?? [];

  // Filter out built-in types (starting with __)
  const userTypes = allTypes.filter((t: any) => !t.name.startsWith("__"));

  const results: MatchResult[] = [];

  // MUTATION and QUERY are shorthands — search fields on the root type
  const isFieldSearch = kindFilter === "MUTATION" || kindFilter === "QUERY";

  if (isFieldSearch) {
    const rootTypeName = kindFilter === "MUTATION"
      ? schema?.mutationType?.name
      : schema?.queryType?.name;

    if (!rootTypeName) {
      die(EXIT_ERROR, "SCHEMA_ERROR", `Schema has no ${kindFilter.toLowerCase()} type`);
    }

    const rootType = allTypes.find((t: any) => t.name === rootTypeName);
    if (!rootType) {
      die(EXIT_ERROR, "SCHEMA_ERROR",
        `Schema declares ${kindFilter.toLowerCase()}Type as "${rootTypeName}" but it was not found in types. Re-run: shopi introspect`
      );
    }
    const fields: any[] = rootType.fields ?? [];

    for (const field of fields) {
      const rank = rankMatch(field.name, term);
      if (rank !== null) {
        results.push({
          match: "field",
          name: field.name,
          kind: kindFilter,
          description: field.description ?? null,
          parent: rootTypeName,
          parentKind: "OBJECT",
          type: formatType(field.type),
          args: (field.args ?? []).map(formatArgSlim),
          _rank: rank,
        });
      }
    }
  } else {
    // Search type names and field names within types
    const typeKindFilter = kindFilter; // e.g. "OBJECT", "INPUT_OBJECT", etc. or undefined

    for (const typeDef of userTypes) {
      if (typeKindFilter && typeDef.kind !== typeKindFilter) continue;

      // Match on type name
      const typeRank = rankMatch(typeDef.name, term);
      if (typeRank !== null) {
        results.push({
          match: "type",
          name: typeDef.name,
          kind: typeDef.kind,
          description: typeDef.description ?? null,
          parent: null,
          _rank: typeRank,
        });
      }

      // Also search field names within the type
      const fields = typeDef.fields ?? typeDef.inputFields ?? [];
      for (const field of fields) {
        const fieldRank = rankMatch(field.name, term);
        if (fieldRank !== null) {
          results.push({
            match: "field",
            name: field.name,
            kind: typeDef.kind,
            description: field.description ?? null,
            parent: typeDef.name,
            parentKind: typeDef.kind,
            type: formatType(field.type),
            _rank: fieldRank,
          });
        }
      }
    }
  }

  // Sort: by rank first (0=exact, 1=prefix, 2=contains), then alphabetically by name
  results.sort((a, b) => {
    if (a._rank !== b._rank) return a._rank - b._rank;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });

  // Strip _rank before output
  const output = results.map(({ _rank, ...rest }) => rest);

  printJSON(output);
}
