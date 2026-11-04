import {PaymentProvider} from './provider.mjs';
export class KaspiPaymentProvider extends PaymentProvider {
 constructor(){super();throw Error('Kaspi disabled: approved provider contract and source audit required');}
}
