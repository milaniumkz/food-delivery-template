import test from 'node:test';import assert from 'node:assert/strict';
import {MockPaymentProvider} from '../src/payments/mock.mjs';import {KaspiPaymentProvider} from '../src/payments/kaspi.mjs';
const input={orderId:'order-demo',amountMinor:249000,currency:'KZT',idempotencyKey:'request-1'};
test('retry is idempotent and different amount conflicts',async()=>{const p=new MockPaymentProvider();const a=await p.createPayment(input);assert.deepEqual(await p.createPayment(input),a);await assert.rejects(p.createPayment({...input,amountMinor:250000}),/conflict/);});
test('reject invalid money',async()=>{for(const amountMinor of [0,-1,1.2,NaN,Number.MAX_SAFE_INTEGER+1]) await assert.rejects(new MockPaymentProvider().createPayment({...input,amountMinor}),/money/);});
test('success is explicit and terminal, snapshots cannot mutate storage',async()=>{const p=new MockPaymentProvider();const a=await p.createPayment(input);a.status='paid';assert.equal((await p.getPayment(a.id)).status,'pending');assert.equal((await p.simulateSuccess(a.id)).status,'paid');await assert.rejects(p.simulateSuccess(a.id),/transition/);});
test('unverified notifications and real Kaspi are disabled',async()=>{await assert.rejects(new MockPaymentProvider().verifyNotification('fake',{}));assert.throws(()=>new KaspiPaymentProvider(),/disabled/);});
