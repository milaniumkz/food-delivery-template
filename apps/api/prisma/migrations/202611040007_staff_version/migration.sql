ALTER TABLE "StaffUser" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_version_positive" CHECK ("version" > 0);
