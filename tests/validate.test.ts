import { describe, it, expect } from "bun:test";
import { validateQuery } from "../src/validate.ts";

// This test requires a cached schema — skip gracefully if none exists
const testStore = Bun.env.SHOPIFY_STORE ?? "test.myshopify.com";
const testVersion = Bun.env.SHOPIFY_API_VERSION ?? "2025-04";

describe("validateQuery", () => {
  it("returns valid:false for a syntactically invalid query", () => {
    // We test parse-level validation only (no schema needed for syntax)
    // A syntax error should always fail regardless of schema
    const result = validateQuery("{ not valid graphql !!!", testStore, testVersion);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toBeTruthy();
  });

  it("returns error with location for a syntax error", () => {
    const result = validateQuery("{ shop { name", testStore, testVersion);
    expect(result.valid).toBe(false);
    expect(result.errors[0].locations).toBeDefined();
  });

  it("error objects have message and locations fields", () => {
    const result = validateQuery("{ shop { name", testStore, testVersion);
    const err = result.errors[0];
    expect(typeof err.message).toBe("string");
    expect(Array.isArray(err.locations)).toBe(true);
  });
});
