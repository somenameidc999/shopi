import { getAuth } from "./auth.ts";
import { readCacheRaw } from "./cache.ts";
import { die, printJSON, printHelp, EXIT_NO_SCHEMA, EXIT_ERROR } from "./output.ts";

const HELP = `
shopi signature — Show the full call signature of a mutation or query

USAGE
  shopi signature <operationName> [flags]

EXAMPLES
  shopi signature productCreate
  shopi signature productCreate --kind MUTATION
  shopi signature productCreate --expand
  shopi signature orderCreate --expand
  shopi signature collectionCreate --expand
  shopi signature customerUpdate --expand
  shopi signature products --kind QUERY

FLAGS
  --kind <MUTATION|QUERY>   Restrict search to one root type (default: tries MUTATION then QUERY)
  --expand                  Embed inputFields for each INPUT_OBJECT arg inline
  --help                    Show this help
`.trim();

function formatType(typeRef: any, depth = 0): string {
  if (depth > 20) return "...";
  if (!typeRef) return "Unknown";
  if (typeRef.kind === "NON_NULL") return `${formatType(typeRef.ofType, depth + 1)}!`;
  if (typeRef.kind === "LIST") return `[${formatType(typeRef.ofType, depth + 1)}]`;
  return typeRef.name ?? "Unknown";
}

// Walk the typeRef tree to get the base named type (ignores NON_NULL/LIST wrappers)
function namedType(typeRef: any, depth = 0): string | null {
  if (depth > 20) return null;
  if (!typeRef) return null;
  if (typeRef.kind === "NON_NULL" || typeRef.kind === "LIST") return namedType(typeRef.ofType, depth + 1);
  return typeRef.name ?? null;
}

function buildGqlSignature(name: string, rawArgs: any[], returnType: string): string {
  if (rawArgs.length === 0) return `${name}: ${returnType}`;
  const argStr = rawArgs.map((a: any) => `${a.name}: ${formatType(a.type)}`).join(", ");
  return `${name}(${argStr}): ${returnType}`;
}

export async function run(args: string[], flags: Record<string, string>): Promise<void> {
  if (args.includes("--help") || args.length === 0) {
    printHelp(HELP);
    return;
  }

  const kindIdx = args.indexOf("--kind");
  const kindFilter = kindIdx !== -1 ? args[kindIdx + 1]?.toUpperCase() : undefined;
  if (kindIdx !== -1 && (!kindFilter || kindFilter.startsWith("--"))) {
    die(EXIT_ERROR, "INVALID_ARGS", "--kind requires MUTATION or QUERY");
  }
  if (kindFilter && kindFilter !== "MUTATION" && kindFilter !== "QUERY") {
    die(EXIT_ERROR, "INVALID_ARGS", `--kind must be MUTATION or QUERY, got "${kindFilter}"`);
  }

  const expand = args.includes("--expand");
  const operationName = args.find(a => !a.startsWith("--"));

  if (!operationName) {
    die(EXIT_ERROR, "MISSING_ARG", "Usage: shopi signature <operationName> [--kind MUTATION|QUERY] [--expand]");
  }

  const auth = getAuth(flags as any);
  const cached = readCacheRaw(auth.store, auth.apiVersion);
  if (!cached) {
    die(EXIT_NO_SCHEMA, "NO_SCHEMA", "Schema not cached. Run: shopi introspect");
  }

  const schema = (cached as any).__schema;
  const allTypes: any[] = schema?.types ?? [];

  function findInRoot(kind: "MUTATION" | "QUERY"): { field: any; kind: string; rootName: string } | null {
    const rootName = kind === "MUTATION"
      ? schema?.mutationType?.name
      : schema?.queryType?.name;
    if (!rootName) return null;
    const rootType = allTypes.find((t: any) => t.name === rootName);
    if (!rootType) return null;
    const field = (rootType.fields ?? []).find((f: any) => f.name === operationName);
    if (!field) return null;
    return { field, kind, rootName };
  }

  let found: { field: any; kind: string; rootName: string } | null = null;
  if (kindFilter) {
    found = findInRoot(kindFilter as "MUTATION" | "QUERY");
  } else {
    found = findInRoot("MUTATION") ?? findInRoot("QUERY");
  }

  if (!found) {
    const searchedKinds = kindFilter ?? "MUTATION and QUERY";
    die(
      EXIT_ERROR,
      "OP_NOT_FOUND",
      `"${operationName}" not found in ${searchedKinds}. Try: shopi search "${operationName}" --kind MUTATION`
    );
  }

  const { field, kind } = found;
  const returnType = formatType(field.type);
  const gqlSignature = buildGqlSignature(field.name, field.args ?? [], returnType);

  const formattedArgs = (field.args ?? []).map((a: any) => {
    const base: any = {
      name: a.name,
      type: formatType(a.type),
      description: a.description ?? null,
      defaultValue: a.defaultValue ?? null,
    };

    if (expand) {
      const baseTypeName = namedType(a.type);
      if (baseTypeName) {
        const inputTypeDef = allTypes.find(
          (t: any) => t.name === baseTypeName && t.kind === "INPUT_OBJECT" && !t.name.startsWith("__")
        );
        if (inputTypeDef) {
          base.inputFields = (inputTypeDef.inputFields ?? []).map((f: any) => ({
            name: f.name,
            type: formatType(f.type),
            description: f.description ?? null,
            defaultValue: f.defaultValue ?? null,
          }));
        }
      }
    }

    return base;
  });

  printJSON({
    name: field.name,
    kind,
    description: field.description ?? null,
    gqlSignature,
    args: formattedArgs,
    returnType,
  });
}
