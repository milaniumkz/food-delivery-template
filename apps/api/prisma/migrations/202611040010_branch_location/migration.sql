ALTER TABLE "Branch" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Branch" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Branch" ADD COLUMN "addressRu" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Branch" ADD COLUMN "addressKk" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_location_pair" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude">=-90 AND "latitude"<=90 AND "longitude">=-180 AND "longitude"<=180));
