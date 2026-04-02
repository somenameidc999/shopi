#!/usr/bin/env bun
/**
 * Standalone E2E runner — exercises shopi against the real Shopify Admin API.
 *
 * USAGE
 *   bun run tests/e2e/run.ts             # create + update, save IDs to state file
 *   bun run tests/e2e/run.ts --cleanup   # delete everything recorded in state file
 *   bun run tests/e2e/run.ts --full      # create + update + cleanup in one shot
 *
 * The state file (tests/e2e/.state.json) is written after each entity is
 * created, so a partial run can always be cleaned up with --cleanup.
 */

import { shopiQuery, assertNoUserErrors, log } from "./helpers.ts";
import {
  customerFixture, customerUpdateFixture, addressFixtures,
  productFixture, productUpdateFixture, variantFixtures,
  draftOrderFixture, draftOrderUpdateFixture,
  COUNT,
} from "./fixtures.ts";
import {
  emptyState, loadState, saveState, clearState,
  addCustomer, addProduct, addDraftOrder,
  type E2EState,
} from "./state.ts";

const ARGS = new Set(process.argv.slice(2));
const DO_CLEANUP = ARGS.has("--cleanup") || ARGS.has("--full");
const DO_CREATE  = !ARGS.has("--cleanup");
const RUN_ID     = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Mutations (same as test files — run.ts tests the CLI independently)
// ---------------------------------------------------------------------------

const CREATE_CUSTOMER   = `mutation CreateCustomer($input: CustomerInput!) { customerCreate(input: $input) { customer { id email } userErrors { field message } } }`;
const CREATE_ADDRESS    = `mutation CreateAddress($customerId: ID!, $address: MailingAddressInput!) { customerAddressCreate(customerId: $customerId, address: $address) { customerAddress { id } userErrors { field message } } }`;
const UPDATE_CUSTOMER   = `mutation UpdateCustomer($input: CustomerInput!) { customerUpdate(input: $input) { customer { id } userErrors { field message } } }`;
const DELETE_CUSTOMER   = `mutation DeleteCustomer($input: CustomerDeleteInput!) { customerDelete(input: $input) { deletedCustomerId userErrors { field message } } }`;

const CREATE_PRODUCT    = `mutation CreateProduct($product: ProductCreateInput!) { productCreate(product: $product) { product { id title variants(first: 1) { nodes { id } } } userErrors { field message } } }`;
const CREATE_VARIANTS   = `mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkCreate(productId: $productId, variants: $variants) { productVariants { id } userErrors { field message } } }`;
const UPDATE_PRODUCT    = `mutation UpdateProduct($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id } userErrors { field message } } }`;
const DELETE_PRODUCT    = `mutation DeleteProduct($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message } } }`;

const CREATE_DRAFT      = `mutation CreateDraftOrder($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name } userErrors { field message } } }`;
const UPDATE_DRAFT      = `mutation UpdateDraftOrder($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { id } userErrors { field message } } }`;
const DELETE_DRAFT      = `mutation DeleteDraftOrder($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { field message } } }`;

const VARIANTS = variantFixtures();

// ---------------------------------------------------------------------------
// Phase: create
// ---------------------------------------------------------------------------

async function createAll(state: E2EState): Promise<void> {
  // ── Customers ────────────────────────────────────────────────────────────
  log(`Creating ${COUNT} customers…`);
  for (let i = 0; i < COUNT; i++) {
    const data = await shopiQuery(CREATE_CUSTOMER, { input: customerFixture(i, state.runId) });
    assertNoUserErrors(data, "customerCreate");
    const id = (data as any).customerCreate.customer.id as string;
    addCustomer(state, id);

    for (const address of addressFixtures(i)) {
      await shopiQuery(CREATE_ADDRESS, { customerId: id, address });
    }
    process.stdout.write(".");
  }
  console.log(` ✓ ${state.customers.length} customers`);

  // ── Products ─────────────────────────────────────────────────────────────
  log(`Creating ${COUNT} products with ${VARIANTS.length} variants each…`);
  for (let i = 0; i < COUNT; i++) {
    const data = await shopiQuery(CREATE_PRODUCT, { product: productFixture(i, state.runId) });
    assertNoUserErrors(data, "productCreate");
    const productId = (data as any).productCreate.product.id as string;

    // Skip first combo — productCreate already auto-created that variant
    const varData = await shopiQuery(CREATE_VARIANTS, { productId, variants: VARIANTS.slice(1) });
    assertNoUserErrors(varData, "productVariantsBulkCreate");

    addProduct(state, productId);
    process.stdout.write(".");
  }
  console.log(` ✓ ${state.products.length} products`);

  // ── Draft orders ─────────────────────────────────────────────────────────
  log(`Creating ${COUNT} draft orders with metafields…`);
  for (let i = 0; i < COUNT; i++) {
    const data = await shopiQuery(CREATE_DRAFT, { input: draftOrderFixture(i, state.runId) });
    assertNoUserErrors(data, "draftOrderCreate");
    const id = (data as any).draftOrderCreate.draftOrder.id as string;
    addDraftOrder(state, id);
    process.stdout.write(".");
  }
  console.log(` ✓ ${state.draftOrders.length} draft orders`);
}

// ---------------------------------------------------------------------------
// Phase: update
// ---------------------------------------------------------------------------

async function updateAll(state: E2EState): Promise<void> {
  log("Updating first 5 of each resource type…");

  for (const id of state.customers.slice(0, 5)) {
    const data = await shopiQuery(UPDATE_CUSTOMER, { input: customerUpdateFixture(id, state.runId) });
    assertNoUserErrors(data, "customerUpdate");
    process.stdout.write(".");
  }

  for (const id of state.products.slice(0, 5)) {
    const data = await shopiQuery(UPDATE_PRODUCT, { product: productUpdateFixture(id, state.runId) });
    assertNoUserErrors(data, "productUpdate");
    process.stdout.write(".");
  }

  for (const id of state.draftOrders.slice(0, 5)) {
    const data = await shopiQuery(UPDATE_DRAFT, { id, input: draftOrderUpdateFixture(state.runId) });
    assertNoUserErrors(data, "draftOrderUpdate");
    process.stdout.write(".");
  }

  console.log(" ✓");
}

// ---------------------------------------------------------------------------
// Phase: cleanup  (--cleanup flag required)
// ---------------------------------------------------------------------------

async function cleanupAll(state: E2EState): Promise<void> {
  log(`Deleting ${state.customers.length} customers…`);
  let ok = 0;
  for (const id of state.customers) {
    try {
      const data = await shopiQuery(DELETE_CUSTOMER, { input: { id } });
      assertNoUserErrors(data, "customerDelete");
      ok++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\n  ✗ ${id}: ${(err as Error).message}`);
    }
  }
  console.log(` ✓ ${ok}/${state.customers.length}`);

  log(`Deleting ${state.products.length} products…`);
  ok = 0;
  for (const id of state.products) {
    try {
      const data = await shopiQuery(DELETE_PRODUCT, { input: { id } });
      assertNoUserErrors(data, "productDelete");
      ok++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\n  ✗ ${id}: ${(err as Error).message}`);
    }
  }
  console.log(` ✓ ${ok}/${state.products.length}`);

  log(`Deleting ${state.draftOrders.length} draft orders…`);
  ok = 0;
  for (const id of state.draftOrders) {
    try {
      const data = await shopiQuery(DELETE_DRAFT, { input: { id } });
      assertNoUserErrors(data, "draftOrderDelete");
      ok++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\n  ✗ ${id}: ${(err as Error).message}`);
    }
  }
  console.log(` ✓ ${ok}/${state.draftOrders.length}`);

  clearState();
  log("State file cleared.");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (ARGS.has("--cleanup") && !ARGS.has("--full")) {
    // Cleanup-only mode: load existing state and delete
    const state = loadState();
    if (!state || (state.customers.length + state.products.length + state.draftOrders.length === 0)) {
      log("No state file found or nothing to clean up. Run without --cleanup first.");
      process.exit(0);
    }
    log(`Cleaning up run ${state.runId} (started ${state.startedAt})`);
    log(`  customers:    ${state.customers.length}`);
    log(`  products:     ${state.products.length}`);
    log(`  draft orders: ${state.draftOrders.length}`);
    await cleanupAll(state);
    return;
  }

  // Create + update (and optionally cleanup with --full)
  const state = emptyState(RUN_ID);
  saveState(state);
  log(`Starting E2E run ${RUN_ID}`);

  await createAll(state);
  await updateAll(state);

  if (ARGS.has("--full")) {
    await cleanupAll(state);
  } else {
    log(`\nDone. ${state.customers.length} customers, ${state.products.length} products, ${state.draftOrders.length} draft orders created.`);
    log(`Run with --cleanup to delete them:\n  bun run tests/e2e/run.ts --cleanup`);
  }
}

main().catch(err => {
  console.error(`\nFatal: ${(err as Error).message}`);
  process.exit(1);
});
