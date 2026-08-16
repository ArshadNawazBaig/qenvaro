import type { SalePaymentMethod } from "./schemas";

export interface PaymentAuthorization {
  status: "recorded";
  provider: "manual";
  externalReference: null;
}

export interface SalePaymentProvider {
  authorize(input: {
    method: SalePaymentMethod;
    tenderedMinor: number;
    currency: string;
  }): Promise<PaymentAuthorization>;
}

export class RecordedPaymentProvider implements SalePaymentProvider {
  async authorize(input: {
    method: SalePaymentMethod;
    tenderedMinor: number;
    currency: string;
  }): Promise<PaymentAuthorization> {
    void input;
    return {
      status: "recorded",
      provider: "manual",
      externalReference: null,
    };
  }
}
