# shopi

A Shopify Admin GraphQL CLI for coding agents. Schema-aware, agent-friendly, single binary.

---

`shopi` is built for coding agents, not humans. It exposes the full Shopify Admin GraphQL API through schema introspection commands that let an agent discover types, validate queries, and execute mutations without guessing. All output is JSON. All errors go to stderr. Pre-execution schema validation means bad queries fail locally before touching the network.

---

## Installation

### From source (Bun)

```bash
git clone https://github.com/somenameidc999/shopi.git
cd shopi
bun install
bun run build        # produces dist/shopi.js (requires Bun runtime)
```

### Single binary (no runtime dependency)

```bash
bun run compile      # produces dist/shopi-bin (standalone executable)
cp dist/shopi-bin /usr/local/bin/shopi
```

---

## Auth setup

Copy `.env.example` and fill in your credentials:

```bash
cp .env.example .env
```

```bash
# Required
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxx

# Optional — defaults to 2025-04
SHOPIFY_API_VERSION=2025-04
```

**Auth resolution priority:** flags > environment variables > `.env` file

> **IMPORTANT:** `SHOPIFY_STORE` must be a `.myshopify.com` domain (e.g. `my-store.myshopify.com` or bare `my-store`). IP addresses, custom domains, and other hostnames are rejected.

---

## Commands

### `shopi introspect`

Fetches the Shopify Admin GraphQL schema from the API and caches it locally. Subsequent commands read from the cache — no re-fetch unless the cache is stale or `--refresh` is passed.

**Cache location:** `~/.shopi/cache/<hash>/schema.json`  
**Cache TTL:** 24 hours

```
USAGE
  shopi introspect [flags]

FLAGS
  --refresh           Force re-fetch even if cache is fresh
  --output <file>     Write schema JSON to a file
  --help              Show this help
```

```bash
# Warm the cache
shopi introspect

# Force a fresh fetch
shopi introspect --refresh

# Save schema to disk
shopi introspect --output schema.json
```

**Example output:**

```json
{
  "store": "my-store.myshopify.com",
  "apiVersion": "2025-04",
  "types": {
    "total": 892,
    "objects": 241,
    "inputs": 198,
    "enums": 143
  },
  "mutations": 174,
  "cachedAt": "2026-04-01T12:00:00.000Z",
  "cachePath": "/Users/you/.shopi/cache/a3f9c2/schema.json"
}
```

---

### `shopi type <TypeName>`

Looks up a type from the cached schema and returns its fields, input fields, or enum values depending on the type kind. This is the primary agent affordance — use it before writing a query to confirm field names and types.

```
USAGE
  shopi type <TypeName> [flags]

FLAGS
  --fields    Return only the fields/inputFields/values array (no wrapper object)
  --help      Show this help
```

```bash
# Inspect an object type
shopi type Product

# Inspect an input type
shopi type ProductInput

# List all top-level query fields
shopi type QueryRoot --fields

# List all top-level mutations
shopi type Mutation --fields
```

**Example output** (`shopi type Product`):

```json
{
  "name": "Product",
  "kind": "OBJECT",
  "description": "Represents a product in a store.",
  "fields": [
    {
      "name": "id",
      "type": "ID!",
      "description": "A globally-unique ID.",
      "isDeprecated": false,
      "deprecationReason": null,
      "args": []
    },
    {
      "name": "title",
      "type": "String!",
      "description": "The name of the product.",
      "isDeprecated": false,
      "deprecationReason": null,
      "args": []
    },
    {
      "name": "variants",
      "type": "ProductVariantConnection!",
      "description": "A list of variants associated with the product.",
      "isDeprecated": false,
      "deprecationReason": null,
      "args": [
        {
          "name": "first",
          "type": "Int",
          "description": "Returns up to the first `n` elements.",
          "defaultValue": null
        }
      ]
    }
  ]
}
```

**Type aliases:** `shopi type Query` resolves to `QueryRoot`. `shopi type Mutation` resolves to the schema's actual mutation type name.

---

### `shopi query`

Validates a GraphQL query or mutation against the cached schema, then executes it. Use `--dry-run` to validate without executing.

Exit code `2` means the query failed schema validation — the network was never contacted.

```
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
```

```bash
# Validate and execute inline
shopi query "{ shop { name currencyCode } }"

# Validate only (no network request)
shopi query "{ shop { name } }" --dry-run

# Pass variables
shopi query "query GetProduct(\$id: ID!) { product(id: \$id) { title } }" \
  --variables '{"id": "gid://shopify/Product/1234567890"}'

# Read query from stdin
cat product.graphql | shopi query -

# Execute a mutation
shopi query "mutation { productCreate(input: { title: \"Test\" }) { product { id } userErrors { field message } } }"
```

**Successful dry-run output:**

```json
{
  "valid": true,
  "errors": []
}
```

**Validation failure output (exit code 2):**

```json
{
  "error": "VALIDATION_ERROR",
  "errors": [
    {
      "message": "Cannot query field \"pricee\" on type \"Product\". Did you mean \"price\"?",
      "locations": [{ "line": 1, "column": 24 }]
    }
  ]
}
```

---

### `shopi search`

Searches type names and field names in the cached schema. Results are ranked by match quality: exact > prefix > contains, then alphabetically.

```
USAGE
  shopi search <term> [flags]

FLAGS
  --kind <kind>   Filter results by kind: OBJECT, INPUT_OBJECT, ENUM, SCALAR,
                  INTERFACE, UNION, MUTATION, QUERY
  --help          Show this help
```

```bash
# Search for anything matching "discount"
shopi search "discount"

# Find mutations related to fulfillment
shopi search "fulfillment" --kind MUTATION

# Find all input types matching "input"
shopi search "input" --kind INPUT_OBJECT
```

**Example output** (`shopi search "discount" --kind MUTATION`):

```json
[
  {
    "match": "field",
    "name": "discountAutomaticActivate",
    "kind": "MUTATION",
    "description": "Activates an automatic discount.",
    "parent": "Mutation",
    "parentKind": "OBJECT",
    "type": "DiscountAutomaticActivatePayload!"
  },
  {
    "match": "field",
    "name": "discountAutomaticCreate",
    "kind": "MUTATION",
    "description": "Creates an automatic discount.",
    "parent": "Mutation",
    "parentKind": "OBJECT",
    "type": "DiscountAutomaticCreatePayload!"
  }
]
```

---

## Output contract

All successful output goes to **stdout** as JSON. All errors go to **stderr** as JSON.

| Exit code | Meaning |
|-----------|---------|
| `0` | Success |
| `1` | Auth / network / API error |
| `2` | Query failed schema validation |
| `3` | Schema not cached — run `shopi introspect` |

---

## Agent workflow

Recommended usage pattern for coding agents (e.g. Claude Code):

1. **Warm the cache** — run `shopi introspect` once per session (or per store/version combination).
2. **Discover top-level queries** — run `shopi type QueryRoot --fields` to see all available query entry points.
3. **Explore types before writing** — run `shopi type <TypeName>` to confirm field names, types, and args before composing a query.
4. **Search when unsure** — run `shopi search <term>` when you don't know the exact type or field name.
5. **Validate before executing** — run `shopi query "..." --dry-run` to catch errors locally (exit code 2 = invalid, no network call made).
6. **Execute** — run `shopi query "..."` to hit the API and get results.

```bash
# Typical session
shopi introspect
shopi type QueryRoot --fields
shopi type Order
shopi search "fulfillmentOrder" --kind QUERY
shopi query "{ orders(first: 5) { edges { node { id name } } } }" --dry-run
shopi query "{ orders(first: 5) { edges { node { id name } } } }"
```

---

## Global flags

These flags are accepted by all commands and override environment variables.

| Flag | Description |
|------|-------------|
| `--store <domain>` | Shopify store domain (overrides `SHOPIFY_STORE`) |
| `--token <token>` | Admin API access token (overrides `SHOPIFY_ACCESS_TOKEN`) |
| `--api-version <ver>` | API version string (overrides `SHOPIFY_API_VERSION`) |
| `--help` | Show help for the current command |
| `--version` | Print the `shopi` version and exit |

---

## Tech stack

- **[Bun](https://bun.sh)** — runtime, bundler, and compiler (>=1.3.0 required)
- **TypeScript** — all source in `src/` and `bin/`
- **[graphql](https://www.npmjs.com/package/graphql)** — used for local schema validation only; no Apollo, no codegen
