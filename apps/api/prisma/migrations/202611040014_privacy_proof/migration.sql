ALTER TABLE "AuthSession" ADD COLUMN "privacyVerifiedAt" timestamptz(3);
ALTER TABLE "OtpChallenge" ADD COLUMN "purpose" text NOT NULL DEFAULT 'login';
ALTER TABLE "OtpChallenge" ADD COLUMN "sessionId" uuid;
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_purpose_check" CHECK ("purpose" IN ('login','deletion','privacy'));
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_scope_check" CHECK (("purpose"='login' AND "sessionId" IS NULL) OR ("purpose"<>'login' AND "sessionId" IS NOT NULL));
