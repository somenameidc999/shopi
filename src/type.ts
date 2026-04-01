import { getAuth } from "./auth.ts";
import { readCacheRaw } from "./cache.ts";
import { die, printJSON, printHelp, EXIT_NO_SCHEMA, EXIT_ERROR } from "./output.ts";

const HELP = `
shopi type — Look up a GraphQL type from the cached schema

USAGE
  shopi type <TypeName> [flags]

EXAMPLES
  shopi type Product
  shopi type ProductInput
  shopi type WeightUnit
  shopi type QueryRoot --fields              # all top-level query fields
  shopi type Mutation --fields               # all top-level mutations
  shopi type Mutation --field productCreate  # single mutation with full args
  shopi type Mutation --field orderCreate    # single mutation with full args
  shopi type Mutation --field customerUpdate # single mutation with full args

FLAGS
  --fields              Return only the fields/inputFields/values array
  --field <fieldName>   Return a single named field with full args (works on OBJECT/INTERFACE types)
  --help                Show this help
`.trim();

function formatType(typeRef: any, depth = 0): string {
  if (depth > 20) return "...";
  if (!typeRef) return "Unknown";
  if (typeRef.kind === "NON_NULL") return `${formatType(typeRef.ofType, depth + 1)}!`;
  if (typeRef.kind === "LIST") return `[${formatType(typeRef.ofType, depth + 1)}]`;
  return typeRef.name ?? "Unknown";
}

function formatArg(arg: any): object {
  return {
    name: arg.name,
    type: formatType(arg.type),
    description: arg.description ?? null,
    defaultValue: arg.defaultValue ?? null,
  };
}

export async function run(args: string[], flags: Record<string, string>): Promise<void> {
  if (args.includes("--help") || args.length === 0) {
    printHelp(HELP);
    return;
  }

  const fieldsOnly = args.includes("--fields");
  const fieldIdx = args.indexOf("--field");
  const singleField = fieldIdx !== -1 ? args[fieldIdx + 1] : undefined;
  if (fieldIdx !== -1 && (!singleField || singleField.startsWith("--"))) {
    die(EXIT_ERROR, "INVALID_ARGS", "--field requires a field name argument (e.g. --field productCreate)");
  }
  const typeName = args.find(a => !a.startsWith("--"));

  if (!typeName) {
    die(EXIT_ERROR, "MISSING_ARG", "Usage: shopi type <TypeName> [--fields]");
  }

  const auth = getAuth(flags as any);
  const cached = readCacheRaw(auth.store, auth.apiVersion);

  if (!cached) {
    die(EXIT_NO_SCHEMA, "NO_SCHEMA", "Schema not cached. Run: shopi introspect");
  }

  const schema = (cached as any).__schema;
  const types: any[] = schema?.types ?? [];

  // Handle alias: "Mutation" -> actual mutation type name from schema
  let resolvedName = typeName;
  if (typeName === "Mutation") {
    resolvedName = schema?.mutationType?.name ?? "Mutation";
  }
  if (typeName === "Query") {
    resolvedName = schema?.queryType?.name ?? "QueryRoot";
  }

  const typeDef = types.find((t: any) => t.name === resolvedName);

  if (!typeDef) {
    die(
      EXIT_ERROR,
      "TYPE_NOT_FOUND",
      resolvedName !== typeName
        ? `Type "${typeName}" (resolved to "${resolvedName}") not found in schema`
        : `Type "${typeName}" not found in schema`
    );
  }

  // Build output based on type kind
  let result: any;

  switch (typeDef.kind) {
    case "OBJECT":
    case "INTERFACE": {
      const fields = (typeDef.fields ?? []).map((f: any) => ({
        name: f.name,
        type: formatType(f.type),
        description: f.description ?? null,
        isDeprecated: f.isDeprecated ?? false,
        deprecationReason: f.deprecationReason ?? null,
        args: (f.args ?? []).map(formatArg),
      }));

      // --field <name>: return exactly one field with full args
      if (singleField) {
        const match = fields.find((f: any) => f.name === singleField);
        if (!match) {
          die(
            EXIT_ERROR,
            "FIELD_NOT_FOUND",
            `Field "${singleField}" not found on type "${typeDef.name}". Run: shopi type ${typeDef.name} --fields`
          );
        }
        printJSON(match);
        return;
      }

      if (fieldsOnly) {
        printJSON(fields);
        return;
      }
      result = { name: typeDef.name, kind: typeDef.kind, description: typeDef.description ?? null, fields };
      break;
    }

    case "INPUT_OBJECT": {
      const inputFields = (typeDef.inputFields ?? []).map((f: any) => ({
        name: f.name,
        type: formatType(f.type),
        description: f.description ?? null,
        defaultValue: f.defaultValue ?? null,
      }));
      if (fieldsOnly) {
        printJSON(inputFields);
        return;
      }
      result = { name: typeDef.name, kind: typeDef.kind, description: typeDef.description ?? null, inputFields };
      break;
    }

    case "ENUM": {
      const values = (typeDef.enumValues ?? []).map((v: any) => ({
        name: v.name,
        description: v.description ?? null,
        isDeprecated: v.isDeprecated ?? false,
        deprecationReason: v.deprecationReason ?? null,
      }));
      if (fieldsOnly) {
        printJSON(values);
        return;
      }
      result = { name: typeDef.name, kind: typeDef.kind, description: typeDef.description ?? null, values };
      break;
    }

    case "SCALAR":
    case "UNION":
    default: {
      if (fieldsOnly) {
        printJSON([]);
        return;
      }
      result = { name: typeDef.name, kind: typeDef.kind, description: typeDef.description ?? null };
      if (typeDef.kind === "UNION") {
        result.possibleTypes = (typeDef.possibleTypes ?? []).map((t: any) => t.name);
      }
      break;
    }
  }

  printJSON(result);
}
