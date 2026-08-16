import type { CustomerListItem, CustomerListQuery } from "./schemas";

const demoCustomers: CustomerListItem[] = [
  {
    id: "cus_demo_mira",
    code: "C-1001",
    name: "Mira Cole",
    company: "Cole Studio",
    email: "mira@example.test",
    phone: "+1 212 555 0142",
    address: {
      line1: "48 Mercer Street",
      line2: "",
      city: "New York",
      region: "NY",
      postalCode: "10013",
      countryCode: "US",
    },
    notes: "Prefers email for order updates.",
    status: "active",
    version: 1,
    createdAt: "2026-01-18T09:00:00.000Z",
    updatedAt: "2026-08-14T14:30:00.000Z",
  },
  {
    id: "cus_demo_owen",
    code: "C-1002",
    name: "Owen Brooks",
    company: "Brooks Workshop",
    email: "owen@example.test",
    phone: "+1 718 555 0108",
    address: {
      line1: "18 Water Street",
      line2: "Suite 4",
      city: "Brooklyn",
      region: "NY",
      postalCode: "11201",
      countryCode: "US",
    },
    notes: "",
    status: "active",
    version: 2,
    createdAt: "2026-02-04T09:00:00.000Z",
    updatedAt: "2026-08-12T11:20:00.000Z",
  },
  {
    id: "cus_demo_sana",
    code: "C-1003",
    name: "Sana Iqbal",
    company: "",
    email: "sana@example.test",
    phone: "+92 300 555 0171",
    address: {
      line1: "",
      line2: "",
      city: "Karachi",
      region: "Sindh",
      postalCode: "",
      countryCode: "PK",
    },
    notes: "",
    status: "active",
    version: 1,
    createdAt: "2026-03-11T09:00:00.000Z",
    updatedAt: "2026-08-10T10:15:00.000Z",
  },
  {
    id: "cus_demo_theo",
    code: "C-1004",
    name: "Theo Grant",
    company: "Grant Retail Group",
    email: "",
    phone: "+44 20 7946 0532",
    address: {
      line1: "24 King Street",
      line2: "",
      city: "London",
      region: "",
      postalCode: "SW1Y 6QY",
      countryCode: "GB",
    },
    notes: "Phone contact only.",
    status: "active",
    version: 1,
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-08-08T15:45:00.000Z",
  },
  {
    id: "cus_demo_lina",
    code: "C-1005",
    name: "Lina Park",
    company: "",
    email: "lina@example.test",
    phone: "",
    address: {
      line1: "",
      line2: "",
      city: "Seattle",
      region: "WA",
      postalCode: "",
      countryCode: "US",
    },
    notes: "",
    status: "archived",
    version: 3,
    createdAt: "2025-11-28T09:00:00.000Z",
    updatedAt: "2026-07-19T08:00:00.000Z",
  },
];

export function getDemoCustomers(): CustomerListItem[] {
  return demoCustomers.map((customer) => ({
    ...customer,
    address: { ...customer.address },
  }));
}

export function queryDemoCustomers(query: CustomerListQuery): {
  items: CustomerListItem[];
  total: number;
} {
  const needle = query.q.toLowerCase();
  const customers = getDemoCustomers().filter(
    (customer) =>
      (query.status === "all" || customer.status === query.status) &&
      (!needle ||
        customer.name.toLowerCase().includes(needle) ||
        customer.code.toLowerCase().includes(needle) ||
        customer.company.toLowerCase().includes(needle) ||
        customer.email.toLowerCase().includes(needle) ||
        customer.phone.toLowerCase().includes(needle) ||
        customer.address.city.toLowerCase().includes(needle)),
  );
  const direction = query.direction === "asc" ? 1 : -1;
  customers.sort((left, right) => {
    if (query.sort === "createdAt" || query.sort === "updatedAt")
      return (
        left[query.sort].localeCompare(right[query.sort]) * direction ||
        left.name.localeCompare(right.name)
      );
    return (
      left.name.localeCompare(right.name) * direction ||
      left.id.localeCompare(right.id)
    );
  });
  const start = (query.page - 1) * query.pageSize;
  return {
    items: customers.slice(start, start + query.pageSize),
    total: customers.length,
  };
}
