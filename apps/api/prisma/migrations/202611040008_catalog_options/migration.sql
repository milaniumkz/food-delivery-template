CREATE TABLE "Category" (
 "id" UUID PRIMARY KEY,
 "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT,
 "nameRu" TEXT NOT NULL,
 "nameKk" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT TRUE,
 "position" INTEGER NOT NULL DEFAULT 0,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version">0)
);
CREATE INDEX "Category_branchId_active_position_idx" ON "Category"("branchId","active","position");
ALTER TABLE "Product" ADD COLUMN "categoryId" UUID REFERENCES "Category"("id") ON DELETE RESTRICT;
ALTER TABLE "Product" ADD COLUMN "configuration" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "OrderItem" ADD COLUMN "optionsSnapshot" JSONB NOT NULL DEFAULT '[]';
