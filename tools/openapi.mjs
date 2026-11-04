import { writeFileSync } from "node:fs";
import {
  SwaggerModule,
  DocumentBuilder,
} from "../apps/api/node_modules/@nestjs/swagger/dist/index.js";
import { enrichContract } from "../apps/api/dist/api-schemas.js";
import { createApp } from "../apps/api/dist/app.js";
// Run with apps/api as cwd so BRAND_CONFIG resolves exactly as during API startup.
const app = await createApp();
try {
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Food Delivery API")
      .setVersion("0.2.0")
      .build(),
  );
  writeFileSync(
    "../../packages/contracts/openapi.json",
    JSON.stringify(enrichContract(doc), null, 2) + "\n",
  );
} finally {
  await app.close();
}
