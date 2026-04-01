# shopi — agent context

`shopi` is a Shopify Admin GraphQL CLI. Use it to introspect the schema, validate queries, and execute operations against the Shopify Admin API.

---

## Setup (one-time)

```bash
bun run build       # dist/shopi.js  (requires Bun runtime)
bun run compile     # dist/shopi-bin (standalone, faster startup)

cp .env.example .env
# Fill in:
#   SHOPIFY_STORE=your-store.myshopify.com   ← must be *.myshopify.com
#   SHOPIFY_ACCESS_TOKEN=shpat_...
```

Auth resolution order: `--flag` > environment variable > `.env` file.

---

## Invocation

```bash
bun run dist/shopi.js <command>   # source build
./dist/shopi-bin <command>        # compiled binary
```

---

## Recommended workflow

Follow this order every time you need to interact with Shopify:

1. **Explore** — see what top-level queries exist:
   ```bash
   shopi type QueryRoot --fields
   ```

2. **Inspect a type** — check exact field names and types before writing a query:
   ```bash
   shopi type Order
   shopi type OrderInput
   ```

3. **Search when unsure** — find types or fields by keyword:
   ```bash
   shopi search "fulfillment"
   shopi search "discount" --kind MUTATION
   ```

4. **Get a mutation's full signature before writing it** — shows args and return type in one shot:
   ```bash
   shopi signature productCreate --expand
   ```

5. **Validate before executing** — free (no network call to Shopify), exits `2` if invalid:
   ```bash
   shopi query "{ orders(first: 5) { nodes { id name } } }" --dry-run
   ```

6. **Execute** — schema is auto-fetched if not cached:
   ```bash
   shopi query "{ orders(first: 5) { nodes { id name } } }"
   ```

---

## Command reference

### `shopi introspect`
Fetch and cache the Admin API schema. Cache lives at `~/.shopi/cache/<hash>/schema.json`, TTL 24h.

```bash
shopi introspect              # fetch and cache
shopi introspect --refresh    # force re-fetch
shopi introspect --output schema.json
```

### `shopi type <TypeName>`
Look up a type from the cached schema. Use this before writing any query.

```bash
shopi type Product                  # full type definition
shopi type ProductInput             # input type fields
shopi type QueryRoot --fields       # top-level query fields only
shopi type Mutation --fields        # all mutations
```

`--fields` returns the bare array (fields / inputFields / enumValues) with no wrapper object.  
`Query` is an alias for `QueryRoot`. `Mutation` resolves to the schema's actual mutation type.

`--field <fieldName>` returns a single field with its full `args` array — useful for drilling into one mutation or query without scrolling through the entire type:

```bash
shopi type Mutation --field productCreate
shopi type Mutation --field orderCreate
```

### `shopi query`
Validate and execute a GraphQL query or mutation.

```bash
shopi query "{ shop { name } }"
shopi query "{ shop { name } }" --dry-run
shopi query "query GetProduct(\$id: ID!) { product(id: \$id) { title } }" \
  --variables '{"id": "gid://shopify/Product/1234567890"}'
cat query.graphql | shopi query -
```

### `shopi search`
Search type names and field names in the cached schema. Results ranked: exact > prefix > contains.

```bash
shopi search "discount"
shopi search "fulfillment" --kind MUTATION
shopi search "address" --kind INPUT_OBJECT
```

Valid `--kind` values: `OBJECT`, `INPUT_OBJECT`, `ENUM`, `SCALAR`, `INTERFACE`, `UNION`, `MUTATION`, `QUERY`

When `--kind MUTATION` or `--kind QUERY` is used, each result includes an `args` array so you can see argument names and types without a follow-up lookup:

```json
{ "name": "productCreate", "args": [{ "name": "input", "type": "ProductCreateInput!" }], ... }
```

### `shopi signature <operationName>`
Show the full call signature of any mutation or query: argument names, argument types, return type, and a ready-to-read `gqlSignature` string.

```bash
shopi signature productCreate                  # signature only
shopi signature productCreate --expand         # inline inputFields of all INPUT_OBJECT args
shopi signature orderCreate --kind MUTATION    # restrict search to mutations
shopi signature shop --kind QUERY              # restrict search to queries
```

`--expand` embeds the `inputFields` of every `INPUT_OBJECT` argument inline, eliminating the need for a follow-up `shopi type` call.  
Searches MUTATION first, then QUERY if not found. Restrict with `--kind MUTATION` or `--kind QUERY`.  
On miss: the error suggests `shopi search <name> --kind MUTATION` to find the correct name.

---

## Discovering mutations

Use `shopi signature --expand` as the single entry point for any mutation you haven't written before. It gives you argument names, their types, and (with `--expand`) every input field in one output — no iterative `shopi type` calls needed.

```bash
# Get everything needed to write the mutation in one step
shopi signature productCreate --expand

# Same pattern works for any domain
shopi signature orderCreate --expand
shopi signature customerUpdate --expand
shopi signature collectionCreate --expand
shopi signature draftOrderCreate --expand
shopi signature fulfillmentCreateV2 --expand
shopi signature metafieldsSet --expand
shopi signature inventoryAdjustQuantity --expand
shopi signature webhookSubscriptionCreate --expand
```

If the name isn't found, fall back to search:

```bash
shopi search "fulfillment" --kind MUTATION
```

---

## Output contract

- **stdout** — success data, always JSON
- **stderr** — errors, always JSON: `{ "error": "<message>", "code": "<CODE>" }`

| Exit code | Meaning |
|-----------|---------|
| `0` | Success |
| `1` | Auth / network / API error |
| `2` | Query failed schema validation |
| `3` | Schema not cached |

**Validation error shape** (exit `2`, printed to stdout):
```json
{
  "valid": false,
  "errors": [
    {
      "message": "Cannot query field \"pricee\" on type \"Product\". Did you mean \"price\"?",
      "locations": [{ "line": 1, "column": 14 }]
    }
  ]
}
```

The "did you mean" hint is inside `errors[].message` — read it and correct the query.

---

## Error recovery

| Code | Meaning | Action |
|------|---------|--------|
| `NO_SCHEMA` | Schema not cached | Run `shopi introspect` (or just re-run `shopi query` — it auto-introspects) |
| `SCHEMA_CORRUPT` | Cache is broken | Run `shopi introspect --refresh` |
| `AUTH_MISSING` | Credentials not set | Check `.env` has `SHOPIFY_STORE` and `SHOPIFY_ACCESS_TOKEN` |
| `INVALID_STORE` | Bad store domain | Must be `*.myshopify.com` — no IP addresses, no custom domains |
| `NETWORK_ERROR` | Can't reach Shopify | Check network and store domain |
| `HTTP_ERROR` | Shopify returned 4xx/5xx | Check token scopes and API version |
| `VALIDATION_ERROR` (exit `2`) | Query is wrong | Read `errors[].message`, fix field names or types |
| `TYPE_NOT_FOUND` | Type doesn't exist | Use `shopi search <term>` to find the correct name |

---

## Query writing tips

- Always run `shopi type <TypeName>` before referencing a type — field names are exact and case-sensitive.
- Modern Shopify pagination is `nodes { ... }` not `edges { node { ... } }`.
- Find mutations at `shopi type Mutation --fields` before writing a mutation, or use `shopi signature <name> --expand` to get the full signature and input fields in one step.
- `--dry-run` makes no network call to Shopify — always validate mutations before executing them.
