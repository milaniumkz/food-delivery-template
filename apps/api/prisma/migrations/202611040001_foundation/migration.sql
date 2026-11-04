CREATE TABLE "Branch" (
 "id" UUID NOT NULL, "nameRu" TEXT NOT NULL, "nameKk" TEXT NOT NULL,
 "timeZone" TEXT NOT NULL DEFAULT 'Asia/Almaty', "acceptingOrders" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Product" (
 "id" UUID NOT NULL, "branchId" UUID NOT NULL, "nameRu" TEXT NOT NULL, "nameKk" TEXT NOT NULL,
 "descriptionRu" TEXT NOT NULL DEFAULT '', "descriptionKk" TEXT NOT NULL DEFAULT '',
 "priceMinor" INTEGER NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Product_priceMinor_check" CHECK ("priceMinor" > 0),
 CONSTRAINT "Product_version_check" CHECK ("version" > 0),
 CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Product_branchId_active_id_idx" ON "Product"("branchId", "active", "id");
