import { describe, expect, it } from "vitest";
import { getDemoCustomers, queryDemoCustomers } from "./demo-data";
import { customerListQuerySchema } from "./schemas";

describe("customer demo projections", () => {
  it("returns detached records so callers cannot mutate the fixture", () => {
    const first = getDemoCustomers();
    first[0]!.address.city = "Changed";
    expect(getDemoCustomers()[0]!.address.city).toBe("New York");
  });

  it("searches customer identity, contact, company, and city", () => {
    for (const q of ["C-1001", "Cole Studio", "mira@", "555 0142", "York"])
      expect(
        queryDemoCustomers(customerListQuerySchema.parse({ q })).items[0],
      ).toMatchObject({ name: "Mira Cole" });
  });

  it("filters, sorts, and paginates with bounded query input", () => {
    const result = queryDemoCustomers(
      customerListQuerySchema.parse({
        status: "active",
        sort: "updatedAt",
        direction: "desc",
        pageSize: 5,
      }),
    );
    expect(result.total).toBe(4);
    expect(result.items.map((customer) => customer.name)).toEqual([
      "Mira Cole",
      "Owen Brooks",
      "Sana Iqbal",
      "Theo Grant",
    ]);
  });
});
