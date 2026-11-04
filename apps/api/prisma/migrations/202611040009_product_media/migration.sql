CREATE TABLE "MediaAsset" (
 "id" UUID PRIMARY KEY,
 "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT,
 "filename" TEXT NOT NULL UNIQUE,
 "mime" TEXT NOT NULL CHECK ("mime"='image/webp'),
 "width" INTEGER NOT NULL CHECK ("width">0 AND "width"<=1200),
 "height" INTEGER NOT NULL CHECK ("height">0 AND "height"<=1200),
 "bytes" INTEGER NOT NULL CHECK ("bytes">0 AND "bytes"<=5242880),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Product" ADD COLUMN "imageId" UUID REFERENCES "MediaAsset"("id") ON DELETE RESTRICT;
