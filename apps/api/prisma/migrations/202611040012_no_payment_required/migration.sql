ALTER TYPE "PaymentStatus" ADD VALUE 'not_required';
ALTER TABLE "Order" DROP CONSTRAINT "Order_totalMinor_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_totalMinor_check" CHECK ("totalMinor">=0);
ALTER TABLE "Order" DROP CONSTRAINT "Order_paymentMethod_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentMethod_check" CHECK ("paymentMethod" IN ('mock','cash','no_payment_required'));
ALTER TABLE "Order" ADD CONSTRAINT "Order_free_payment_consistency" CHECK (
 ("totalMinor"=0 AND "paymentMethod"='no_payment_required' AND "paymentStatus"::text='not_required') OR
 ("totalMinor">0 AND "paymentMethod" IN ('mock','cash') AND "paymentStatus"::text<>'not_required')
);
