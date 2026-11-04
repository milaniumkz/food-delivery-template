ALTER TABLE "OtpChallenge" ALTER COLUMN "phone" DROP NOT NULL, ADD COLUMN "phoneHash" TEXT;
CREATE INDEX "OtpChallenge_phoneHash_createdAt_idx" ON "OtpChallenge"("phoneHash","createdAt");
