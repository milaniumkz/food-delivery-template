CREATE TABLE "CustomerRestriction" (
 "customerId" uuid NOT NULL REFERENCES "Customer"(id) ON DELETE RESTRICT,
 "branchId" uuid NOT NULL REFERENCES "Branch"(id) ON DELETE RESTRICT,
 "blocked" boolean NOT NULL,
 "reason" varchar(300) NOT NULL CHECK (length("reason")<=300),
 "version" integer NOT NULL DEFAULT 1 CHECK ("version">0),
 "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("customerId","branchId")
);
ALTER TABLE "AuditLog" ADD COLUMN "details" jsonb;
