/** Money is integer minor units. Interface is asynchronous for real provider compatibility. */
export class PaymentProvider {
 async createPayment(input){ throw Error('Not implemented'); }
 async getPayment(id){ throw Error('Not implemented'); }
 async refund(input){ throw Error('Not implemented'); }
 async verifyNotification(rawBody,headers){ throw Error('Not implemented'); }
}
export function validatePayment(input){
 if(!input||typeof input.orderId!=='string'||!input.orderId||typeof input.idempotencyKey!=='string'||!input.idempotencyKey) throw Error('Order and idempotency key required');
 if(input.currency!=='KZT'||!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0) throw Error('Invalid money');
}
