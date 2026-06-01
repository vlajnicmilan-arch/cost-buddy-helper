import { describe, it, expect } from "vitest";
import {
  resolveCheckoutOrigin,
  ALLOWED_CHECKOUT_ORIGINS,
  DEFAULT_CHECKOUT_ORIGIN,
} from "@/lib/checkoutOrigin";

describe("ALLOWED_CHECKOUT_ORIGINS", () => {
  it("contains all 4 production/preview domains", () => {
    expect(ALLOWED_CHECKOUT_ORIGINS.has("https://vmbalance.com")).toBe(true);
    expect(ALLOWED_CHECKOUT_ORIGINS.has("https://www.vmbalance.com")).toBe(true);
    expect(ALLOWED_CHECKOUT_ORIGINS.has("https://cost-buddy-helper.lovable.app")).toBe(true);
    expect(
      ALLOWED_CHECKOUT_ORIGINS.has(
        "https://id-preview--8a8fc612-0ac2-4902-a82e-29b5b800bc32.lovable.app",
      ),
    ).toBe(true);
    expect(ALLOWED_CHECKOUT_ORIGINS.size).toBe(4);
  });

  it("has vmbalance.com as default", () => {
    expect(DEFAULT_CHECKOUT_ORIGIN).toBe("https://vmbalance.com");
  });
});

describe("resolveCheckoutOrigin", () => {
  it("returns requested origin when in allowlist", () => {
    expect(resolveCheckoutOrigin("https://vmbalance.com")).toBe(
      "https://vmbalance.com",
    );
    expect(resolveCheckoutOrigin("https://www.vmbalance.com")).toBe(
      "https://www.vmbalance.com",
    );
  });

  it("falls back to default for unknown origin", () => {
    expect(resolveCheckoutOrigin("https://evil.example.com")).toBe(
      DEFAULT_CHECKOUT_ORIGIN,
    );
  });

  it("falls back for null", () => {
    expect(resolveCheckoutOrigin(null)).toBe(DEFAULT_CHECKOUT_ORIGIN);
  });

  it("falls back for empty string", () => {
    expect(resolveCheckoutOrigin("")).toBe(DEFAULT_CHECKOUT_ORIGIN);
  });

  it("falls back for undefined", () => {
    expect(resolveCheckoutOrigin(undefined)).toBe(DEFAULT_CHECKOUT_ORIGIN);
  });

  it("is case-sensitive (Origin headers are exact match)", () => {
    expect(resolveCheckoutOrigin("https://VMBALANCE.com")).toBe(
      DEFAULT_CHECKOUT_ORIGIN,
    );
  });

  it("rejects http:// variants of allowed domains", () => {
    expect(resolveCheckoutOrigin("http://vmbalance.com")).toBe(
      DEFAULT_CHECKOUT_ORIGIN,
    );
  });

  it("respects custom allowlist and fallback", () => {
    const custom = new Set(["https://a.test"]);
    expect(resolveCheckoutOrigin("https://a.test", custom, "https://fb.test")).toBe(
      "https://a.test",
    );
    expect(resolveCheckoutOrigin("https://b.test", custom, "https://fb.test")).toBe(
      "https://fb.test",
    );
  });
});
