// ---------------------------------------------------------------------------
// Deterministic test data generators.
//
// All generated records are tagged with "shopi-e2e-test" plus the runId so
// they can be found and cleaned up even if the state file is lost.
// ---------------------------------------------------------------------------

export const COUNT = 25;

// Product option combos: 2 × 2 × 2 = 8 variants per product
const COLORS    = ["Red", "Blue"] as const;
const SIZES     = ["S", "L"] as const;
const MATERIALS = ["Cotton", "Polyester"] as const;

// A small pool of realistic-feeling addresses
const ADDRESS_POOL = [
  { address1: "123 Main St",     city: "New York",    provinceCode: "NY", zip: "10001", countryCode: "US" },
  { address1: "456 Oak Ave",     city: "Los Angeles", provinceCode: "CA", zip: "90001", countryCode: "US" },
  { address1: "789 Pine Rd",     city: "Chicago",     provinceCode: "IL", zip: "60601", countryCode: "US" },
  { address1: "321 Elm Blvd",    city: "Houston",     provinceCode: "TX", zip: "77001", countryCode: "US" },
  { address1: "654 Maple Lane",  city: "Phoenix",     provinceCode: "AZ", zip: "85001", countryCode: "US" },
];

const FIRST_NAMES = ["Alex", "Blake", "Casey", "Dana", "Evan",
                     "Fran", "Gray", "Harper", "Iris", "Jordan",
                     "Kai", "Lee", "Morgan", "Noel", "Oakley",
                     "Page", "Quinn", "Reese", "Sage", "Taylor",
                     "Uma", "Val", "Wren", "Xen", "Yael"];

const LAST_NAMES  = ["Adams", "Brooks", "Chen", "Davis", "Evans",
                     "Foster", "Green", "Hall", "Ingram", "Jones",
                     "Kim", "Lewis", "Moore", "Nash", "Owen",
                     "Park", "Quinn", "Reed", "Stone", "Torres",
                     "Upton", "Vance", "Walsh", "Xu", "Young"];

// Pad an index to 3 digits: 1 → "001"
function pad(i: number): string {
  return String(i + 1).padStart(3, "0");
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function customerFixture(i: number, runId: string) {
  const n = pad(i);
  return {
    firstName: FIRST_NAMES[i],
    lastName: LAST_NAMES[i],
    email: `shopi-test-${runId}-${n}@example-shopi-e2e.com`,
    note: `E2E test customer ${n} — run ${runId}`,
    tags: ["shopi-e2e-test", `shopi-run-${runId}`],
  };
}

export function customerUpdateFixture(id: string, runId: string) {
  return {
    id,
    note: `Updated by E2E run ${runId}`,
    tags: ["shopi-e2e-test", `shopi-run-${runId}`, "updated"],
  };
}

/** Two varied addresses per customer */
export function addressFixtures(i: number) {
  const a = ADDRESS_POOL[i % ADDRESS_POOL.length];
  const b = ADDRESS_POOL[(i + 2) % ADDRESS_POOL.length];
  const first = FIRST_NAMES[i];
  const last  = LAST_NAMES[i];
  return [
    { ...a, firstName: first, lastName: last },
    { ...b, firstName: first, lastName: last, address2: `Apt ${i + 1}` },
  ];
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export function productFixture(i: number, runId: string) {
  const n = pad(i);
  return {
    title: `Shopi Test Product ${n} (${runId})`,
    vendor: "Shopi E2E",
    productType: "Test Apparel",
    tags: ["shopi-e2e-test", `shopi-run-${runId}`],
    status: "DRAFT",
    productOptions: [
      { name: "Color",    values: COLORS.map(v    => ({ name: v })) },
      { name: "Size",     values: SIZES.map(v     => ({ name: v })) },
      { name: "Material", values: MATERIALS.map(v => ({ name: v })) },
    ],
  };
}

/** 8 variants: all combinations of Color × Size × Material */
export function variantFixtures() {
  const variants = [];
  for (const color of COLORS) {
    for (const size of SIZES) {
      for (const material of MATERIALS) {
        variants.push({
          price: "29.99",
          optionValues: [
            { optionName: "Color",    name: color    },
            { optionName: "Size",     name: size     },
            { optionName: "Material", name: material },
          ],
        });
      }
    }
  }
  return variants; // 8 entries
}

export function productUpdateFixture(id: string, runId: string) {
  return {
    id,
    title: `Shopi Updated Product (${runId})`,
    tags: ["shopi-e2e-test", `shopi-run-${runId}`, "updated"],
  };
}

// ---------------------------------------------------------------------------
// Draft orders  (used as "orders" — draft orders can be deleted; completed
// orders cannot, so we deliberately never call draftOrderComplete in tests)
// ---------------------------------------------------------------------------

export function draftOrderFixture(i: number, runId: string) {
  const n = pad(i);
  return {
    note: `Shopi E2E draft order ${n} — run ${runId}`,
    lineItems: [
      {
        title: "Test Widget A",
        quantity: 2,
        originalUnitPriceWithCurrency: { amount: "15.00", currencyCode: "USD" },
        taxable: true,
        requiresShipping: true,
        sku: `E2E-A-${n}`,
      },
      {
        title: "Test Widget B",
        quantity: 1,
        originalUnitPriceWithCurrency: { amount: "25.00", currencyCode: "USD" },
        taxable: false,
        requiresShipping: false,
        sku: `E2E-B-${n}`,
      },
    ],
    metafields: [
      { namespace: "shopi_e2e", key: "run_id",     value: runId,      type: "single_line_text_field" },
      { namespace: "shopi_e2e", key: "order_index", value: String(i), type: "number_integer" },
    ],
  };
}

export function draftOrderUpdateFixture(runId: string) {
  return {
    note: `Updated by E2E run ${runId}`,
  };
}
