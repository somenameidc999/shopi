import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { shopiQuery, assertNoUserErrors } from "./helpers.ts";
import { productFixture, productUpdateFixture, variantFixtures, COUNT } from "./fixtures.ts";

const CLEANUP = Bun.env.SHOPI_E2E_CLEANUP === "1";
const RUN_ID = Date.now().toString(36);

// ---------------------------------------------------------------------------
// GraphQL operations
// ---------------------------------------------------------------------------

const CREATE_PRODUCT = `
  mutation CreateProduct($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id title status
        options { id name optionValues { id name } }
        variants(first: 1) { nodes { id } }
      }
      userErrors { field message }
    }
  }
`;

const CREATE_VARIANTS = `
  mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id title price }
      userErrors { field message }
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation UpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title tags }
      userErrors { field message }
    }
  }
`;

const DELETE_PRODUCT = `
  mutation DeleteProduct($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

const GET_PRODUCT = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id title status tags
      options { name optionValues { name } }
      variants(first: 10) { nodes { id title price } }
    }
  }
`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface CreatedProduct {
  id: string;
  title: string;
  variantIds: string[];
}

let created: CreatedProduct[] = [];
const VARIANTS = variantFixtures(); // 8 combinations

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  console.log(`\n▶ Creating ${COUNT} products with 3 options + ${VARIANTS.length} variants each (runId=${RUN_ID})…`);

  for (let i = 0; i < COUNT; i++) {
    // Create the product with options declared
    const data = await shopiQuery(CREATE_PRODUCT, { product: productFixture(i, RUN_ID) });
    assertNoUserErrors(data, "productCreate");
    const product = (data as any).productCreate.product as { id: string; title: string };

    // productCreate auto-creates one variant from the first option values (Red/S/Cotton).
    // Bulk-create the remaining 7 to reach all 8 combinations.
    const autoVariantId = (product as any).variants.nodes[0].id as string;

    const varData = await shopiQuery(CREATE_VARIANTS, {
      productId: product.id,
      variants: VARIANTS.slice(1), // skip the already-created first combination
    });
    assertNoUserErrors(varData, "productVariantsBulkCreate");
    const bulkVariantIds = (varData as any).productVariantsBulkCreate.productVariants
      .map((v: { id: string }) => v.id) as string[];

    created.push({ id: product.id, title: product.title, variantIds: [autoVariantId, ...bulkVariantIds] });
    process.stdout.write(".");
  }
  console.log(` done (${created.length}/${COUNT})`);
}, 180_000);

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe("products", () => {
  it(`creates all ${COUNT} products`, () => {
    expect(created).toHaveLength(COUNT);
    for (const p of created) {
      expect(p.id).toStartWith("gid://shopify/Product/");
      expect(p.title).toContain("Shopi Test Product");
    }
  });

  it(`each product gets ${VARIANTS.length} variants`, () => {
    for (const p of created) {
      expect(p.variantIds).toHaveLength(VARIANTS.length);
      for (const vid of p.variantIds) {
        expect(vid).toStartWith("gid://shopify/ProductVariant/");
      }
    }
  });

  it("can fetch product back with 3 options and variants", async () => {
    for (const idx of [0, COUNT - 1]) {
      const data = await shopiQuery(GET_PRODUCT, { id: created[idx].id });
      const product = (data as any).product;
      expect(product).not.toBeNull();
      expect(product.options).toHaveLength(3);
      expect(product.options.map((o: any) => o.name)).toEqual(
        expect.arrayContaining(["Color", "Size", "Material"])
      );
      expect(product.options[0].optionValues.length).toBeGreaterThan(0);
      expect(product.variants.nodes.length).toBe(VARIANTS.length);
      expect(product.status).toBe("DRAFT");
    }
  }, 30_000);

  it("can update product title and tags on a subset", async () => {
    const subset = created.slice(0, 5);
    for (const p of subset) {
      const data = await shopiQuery(UPDATE_PRODUCT, { product: productUpdateFixture(p.id, RUN_ID) });
      assertNoUserErrors(data, "productUpdate");
      const updated = (data as any).productUpdate.product;
      expect(updated.tags).toContain("updated");
      expect(updated.title).toContain("Updated");
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterAll(async () => {
  if (!CLEANUP) {
    console.log(`\n  ℹ️  Products left in store as DRAFT (set SHOPI_E2E_CLEANUP=1 to auto-delete)`);
    return;
  }
  console.log(`\n▶ Deleting ${created.length} products…`);
  let deleted = 0;
  for (const p of created) {
    try {
      const data = await shopiQuery(DELETE_PRODUCT, { input: { id: p.id } });
      assertNoUserErrors(data, "productDelete");
      deleted++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\n  ✗ Could not delete product ${p.id}: ${(err as Error).message}`);
    }
  }
  console.log(` done (${deleted}/${created.length})`);
}, 120_000);
