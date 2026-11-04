import {randomUUID} from 'node:crypto';
import {PaymentProvider,validatePayment} from './provider.mjs';
/** Test-only, in-memory. No real payments, no HTTP routes, no durable idempotency. */
export class MockPaymentProvider extends PaymentProvider {
 #payments=new Map(); #keys=new Map();
 async createPayment(input){
  validatePayment(input); const signature=JSON.stringify([input.orderId,input.amountMinor,input.currency]);
  if(this.#keys.has(input.idempotencyKey)){
   const existing=this.#keys.get(input.idempotencyKey);
   if(existing.signature!==signature) throw Error('Idempotency conflict');
   return this.getPayment(existing.id);
  }
  const payment={id:`mock_${randomUUID()}`,orderId:input.orderId,amountMinor:input.amountMinor,currency:input.currency,status:'pending',provider:'mock'};
  this.#payments.set(payment.id,payment);this.#keys.set(input.idempotencyKey,{id:payment.id,signature});return {...payment};
 }
 async getPayment(id){const p=this.#payments.get(id);if(!p) throw Error('Payment not found');return {...p};}
 async simulateSuccess(id){const p=await this.getPayment(id);if(p.status!=='pending') throw Error('Invalid transition');this.#payments.set(id,{...p,status:'paid'});return this.getPayment(id);}
 async refund(){throw Error('Refund requires implementation; mock does not move money');}
 async verifyNotification(){throw Error('Mock accepts no external payment notifications');}
}
