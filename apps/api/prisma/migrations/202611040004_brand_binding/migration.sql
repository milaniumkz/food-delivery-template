CREATE TABLE "BrandSettings" ("id" INTEGER PRIMARY KEY CHECK ("id"=1),"slug" TEXT NOT NULL UNIQUE);
CREATE INDEX "PaymentAttempt_createdAt_idx" ON "PaymentAttempt"("createdAt");
