// NOTE: We use draft orders throughout — they support metafields, can be
// updated, and crucially can be deleted. draftOrderComplete is intentionally
// never called here because completed orders are permanent in Shopify and
// cannot be removed, which would break the --cleanup guarantee.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { shopiQuery, assertNoUserErrors } from "./helpers.ts";
import { draftOrderFixture, draftOrderUpdateFixture, COUNT } from "./fixtures.ts";

const CLEANUP = Bun.env.SHOPI_E2E_CLEANUP === "1";
const RUN_ID = Date.now().toString(36);

// ---------------------------------------------------------------------------
// GraphQL operations
// ---------------------------------------------------------------------------

const CREATE_DRAFT_ORDER = `
  mutation CreateDraftOrder($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id name }
      userErrors { field message }
    }
  }
`;

const UPDATE_DRAFT_ORDER = `
  mutation UpdateDraftOrder($id: ID!, $input: DraftOrderInput!) {
    draftOrderUpdate(id: $id, input: $input) {
      draftOrder { id name note2 }
      userErrors { field message }
    }
  }
`;

const DELETE_DRAFT_ORDER = `
  mutation DeleteDraftOrder($input: DraftOrderDeleteInput!) {
    draftOrderDelete(input: $input) {
      deletedId
      userErrors { field message }
    }
  }
`;

const GET_DRAFT_ORDER = `
  query GetDraftOrder($id: ID!) {
    draftOrder(id: $id) {
      id name note2
      lineItems(first: 5) { nodes { title quantity originalUnitPriceSet { presentmentMoney { amount } } } }
      metafields(first: 5, namespace: "shopi_e2e") { nodes { key value } }
    }
  }
`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface CreatedDraftOrder {
  id: string;
  name: string;
}

let created: CreatedDraftOrder[] = [];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  console.log(`\n▶ Creating ${COUNT} draft orders with metafields (runId=${RUN_ID})…`);

  for (let i = 0; i < COUNT; i++) {
    const data = await shopiQuery(CREATE_DRAFT_ORDER, { input: draftOrderFixture(i, RUN_ID) });
    assertNoUserErrors(data, "draftOrderCreate");
    const draft = (data as any).draftOrderCreate.draftOrder as { id: string; name: string };
    created.push({ id: draft.id, name: draft.name });
    process.stdout.write(".");
  }
  console.log(` done (${created.length}/${COUNT})`);
}, 120_000);

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe("orders (draft)", () => {
  it(`creates all ${COUNT} draft orders`, () => {
    expect(created).toHaveLength(COUNT);
    for (const d of created) {
      expect(d.id).toStartWith("gid://shopify/DraftOrder/");
      expect(d.name).toBeTruthy();
    }
  });

  it("each draft order has 2 line items and 2 metafields", async () => {
    for (const idx of [0, 5, COUNT - 1]) {
      const data = await shopiQuery(GET_DRAFT_ORDER, { id: created[idx].id });
      const draft = (data as any).draftOrder;
      expect(draft).not.toBeNull();
      expect(draft.lineItems.nodes).toHaveLength(2);
      expect(draft.metafields.nodes).toHaveLength(2);
      const metaKeys = draft.metafields.nodes.map((m: any) => m.key);
      expect(metaKeys).toContain("run_id");
      expect(metaKeys).toContain("order_index");
    }
  }, 60_000);

  it("can update draft order note on a subset", async () => {
    const subset = created.slice(0, 5);
    for (const d of subset) {
      const data = await shopiQuery(UPDATE_DRAFT_ORDER, {
        id: d.id,
        input: draftOrderUpdateFixture(RUN_ID),
      });
      assertNoUserErrors(data, "draftOrderUpdate");
      const updated = (data as any).draftOrderUpdate.draftOrder;
      expect(updated.note2).toContain("Updated");
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterAll(async () => {
  if (!CLEANUP) {
    console.log(`\n  ℹ️  Draft orders left in store (set SHOPI_E2E_CLEANUP=1 to auto-delete)`);
    return;
  }
  console.log(`\n▶ Deleting ${created.length} draft orders…`);
  let deleted = 0;
  for (const d of created) {
    try {
      const data = await shopiQuery(DELETE_DRAFT_ORDER, { input: { id: d.id } });
      assertNoUserErrors(data, "draftOrderDelete");
      deleted++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\n  ✗ Could not delete draft order ${d.id}: ${(err as Error).message}`);
    }
  }
  console.log(` done (${deleted}/${created.length})`);
}, 120_000);
