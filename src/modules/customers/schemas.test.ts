import { describe, expect, it } from "vitest";
import {
  createCustomerCode,
  createCustomerSchema,
  customerListQuerySchema,
  normalizeCustomerPhone,
  normalizeCustomerValue,
} from "./schemas";

describe("customer schemas", () => {
  it("normalizes searchable identity and contact values", () => {
    expect(normalizeCustomerValue("  Míra   COLE ")).toBe("míra cole");
    expect(normalizeCustomerPhone("+92 (300) 123-4567")).toBe("+923001234567");
    expect(createCustomerCode("cus_12345678abcdef90")).toBe("C-ABCDEF90");
  });

  it("parses optional customer contact and address fields", () => {
    const result = createCustomerSchema.parse({
      name: "  Mira Cole ",
      company: " Northstar Studio ",
      email: " MIRA@EXAMPLE.TEST ",
      phone: "+92 300 1234567",
      address: {
        line1: "12 Market Road",
        line2: "",
        city: "Karachi",
        region: "Sindh",
        postalCode: "74000",
        countryCode: "pk",
      },
      notes: " Prefers email. ",
    });

    expect(result).toMatchObject({
      name: "Mira Cole",
      company: "Northstar Studio",
      email: "mira@example.test",
      address: { countryCode: "PK" },
      notes: "Prefers email.",
    });
  });

  it("rejects malformed contact fields", () => {
    expect(() =>
      createCustomerSchema.parse({
        name: "Mira Cole",
        company: "",
        email: "not-an-email",
        phone: "call-me",
        address: {
          line1: "",
          line2: "",
          city: "",
          region: "",
          postalCode: "",
          countryCode: "Pakistan",
        },
        notes: "",
      }),
    ).toThrow();
  });

  it("bounds list state and falls back from unknown URL values", () => {
    expect(
      customerListQuerySchema.parse({
        page: "0",
        pageSize: "5000",
        status: "deleted",
        sort: "spend",
        direction: "sideways",
      }),
    ).toEqual({
      q: "",
      page: 1,
      pageSize: 10,
      status: "all",
      sort: "name",
      direction: "asc",
    });
  });
});
