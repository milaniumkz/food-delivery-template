/** Never instantiate a real provider until its source, rights and contract are audited. */
export class KaspiPaymentProvider {
  constructor() {
    throw new Error(
      "Kaspi disabled: approved provider contract and source audit required",
    );
  }
}
