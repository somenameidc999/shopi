import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { shopiQuery, assertNoUserErrors } from "./helpers.ts";
import { customerFixture, customerUpdateFixture, addressFixtures, COUNT } from "./fixtures.ts";

// Set SHOPI_E2E_CLEANUP=1 to delete created customers in afterAll.
// Default: leave them in the store for manual inspection.
const CLEANUP = Bun.env.SHOPI_E2E_CLEANUP === "1";

// Short run ID unique to this test run
const RUN_ID = Date.now().toString(36);

// ---------------------------------------------------------------------------
// GraphQL operations
// ---------------------------------------------------------------------------

const CREATE_CUSTOMER = `
  mutation CreateCustomer($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id email firstName lastName }
      userErrors { field message }
    }
  }
`;

const CREATE_ADDRESS = `
  mutation CreateAddress($customerId: ID!, $address: MailingAddressInput!) {
    customerAddressCreate(customerId: $customerId, address: $address) {
      address { id }
      userErrors { field message }
    }
  }
`;

const UPDATE_CUSTOMER = `
  mutation UpdateCustomer($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer { id email tags note }
      userErrors { field message }
    }
  }
`;

const DELETE_CUSTOMER = `
  mutation DeleteCustomer($input: CustomerDeleteInput!) {
    customerDelete(input: $input) {
      deletedCustomerId
      userErrors { field message }
    }
  }
`;

const GET_CUSTOMER = `
  query GetCustomer($id: ID!) {
    customer(id: $id) {
      id email tags note
      addresses { id address1 city }
    }
  }
`;

// ---------------------------------------------------------------------------
// State — populated in beforeAll, consumed in afterAll / test bodies
// ---------------------------------------------------------------------------

interface CreatedCustomer {
  id: string;
  email: string;
  addressIds: string[];
}

let created: CreatedCustomer[] = [];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  console.log(`\n▶ Creating ${COUNT} customers (runId=${RUN_ID})…`);

  for (let i = 0; i < COUNT; i++) {
    // Create customer
    const data = await shopiQuery(CREATE_CUSTOMER, { input: customerFixture(i, RUN_ID) });
    assertNoUserErrors(data, "customerCreate");
    const customer = (data as any).customerCreate.customer as { id: string; email: string };

    // Create 2 addresses per customer
    const addrs = addressFixtures(i);
    const addressIds: string[] = [];
    for (const address of addrs) {
      const addrData = await shopiQuery(CREATE_ADDRESS, { customerId: customer.id, address });
      assertNoUserErrors(addrData, "customerAddressCreate");
      const addrId = (addrData as any).customerAddressCreate.address.id as string;
      addressIds.push(addrId);
    }

    created.push({ id: customer.id, email: customer.email, addressIds });
    process.stdout.write(".");
  }
  console.log(` done (${created.length}/${COUNT})`);
}, 120_000);

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe("customers", () => {
  it(`creates all ${COUNT} customers`, () => {
    expect(created).toHaveLength(COUNT);
    for (const c of created) {
      expect(c.id).toStartWith("gid://shopify/Customer/");
      expect(c.email).toContain("@example-shopi-e2e.com");
    }
  });

  it("each customer has 2 addresses", () => {
    for (const c of created) {
      expect(c.addressIds).toHaveLength(2);
      for (const addrId of c.addressIds) {
        expect(addrId).toStartWith("gid://shopify/MailingAddress/");
      }
    }
  });

  it("can fetch each customer back with addresses", async () => {
    // Spot-check first and last
    for (const idx of [0, COUNT - 1]) {
      const data = await shopiQuery(GET_CUSTOMER, { id: created[idx].id });
      const cust = (data as any).customer;
      expect(cust).not.toBeNull();
      expect(cust.addresses.length).toBeGreaterThanOrEqual(2);
    }
  }, 30_000);

  it("can update customer tags and note on a subset", async () => {
    const subset = created.slice(0, 5);
    for (const c of subset) {
      const data = await shopiQuery(UPDATE_CUSTOMER, { input: customerUpdateFixture(c.id, RUN_ID) });
      assertNoUserErrors(data, "customerUpdate");
      const updated = (data as any).customerUpdate.customer;
      expect(updated.tags).toContain("updated");
      expect(updated.note).toContain("Updated");
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterAll(async () => {
  if (!CLEANUP) {
    console.log(`\n  ℹ️  Customers left in store (set SHOPI_E2E_CLEANUP=1 to auto-delete)`);
    return;
  }
  console.log(`\n▶ Deleting ${created.length} customers…`);
  let deleted = 0;
  for (const c of created) {
    try {
      const data = await shopiQuery(DELETE_CUSTOMER, { input: { id: c.id } });
      assertNoUserErrors(data, "customerDelete");
      deleted++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\n  ✗ Could not delete customer ${c.id}: ${(err as Error).message}`);
    }
  }
  console.log(` done (${deleted}/${created.length})`);
}, 120_000);
