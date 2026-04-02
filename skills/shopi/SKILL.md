# shopi — Shopify Admin GraphQL CLI

Use `shopi` when working with the Shopify Admin API: exploring the schema, writing or validating GraphQL queries, and executing operations against a store.

## Required environment

```
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
```

## Workflow

Always follow this order:

1. **Explore** available queries/mutations before writing anything:
   ```bash
   shopi type QueryRoot --fields
   shopi type Mutation --fields
   ```

2. **Inspect a type** to get exact field names (case-sensitive):
   ```bash
   shopi type Product
   shopi type OrderInput
   ```

3. **Search** when you don't know the exact name:
   ```bash
   shopi search "fulfillment" --kind MUTATION
   shopi search "discount" --kind INPUT_OBJECT
   ```

4. **Get a mutation's full signature** before writing it:
   ```bash
   shopi signature productCreate --expand
   shopi signature orderCreate --expand
   ```

5. **Validate** before executing (no network call to Shopify, exit 2 if invalid):
   ```bash
   shopi query "{ orders(first: 5) { nodes { id name } } }" --dry-run
   ```

6. **Execute**:
   ```bash
   shopi query "{ orders(first: 5) { nodes { id name } } }"
   shopi query "query GetProduct(\$id: ID!) { product(id: \$id) { title } }" \
     --variables '{"id": "gid://shopify/Product/1234567890"}'
   ```

## Exit codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | — |
| 1 | Auth / network / API error | Check `.env` credentials |
| 2 | Query failed schema validation | Read `errors[].message` and fix field names |
| 3 | Schema not cached | Run `shopi introspect` |

## Validation errors

Exit 2 prints to stdout:
```json
{
  "valid": false,
  "errors": [{ "message": "Cannot query field \"pricee\" on type \"Product\". Did you mean \"price\"?" }]
}
```
Read `errors[].message` — it includes "did you mean" hints. Fix the query and retry.

## Tips

- Pagination uses `nodes { ... }` not `edges { node { ... } }`.
- `shopi introspect --refresh` clears a corrupt cache.
- Pipe a file: `cat query.graphql | shopi query -`
