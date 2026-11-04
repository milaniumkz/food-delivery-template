import "reflect-metadata";
import { PrivacyController } from "./privacy.js";
import { CustomersController } from "./customers.js";
import { SystemController } from "./system.js";
import { ReportsController } from "./reports.js";
import { MediaController } from "./media.js";
import { CatalogSettingsController } from "./catalog-settings.js";
import { StaffController } from "./staff.js";
import { enrichContract } from "./api-schemas.js";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { Database } from "./database.js";
import { HealthController } from "./health.js";
import { ApiErrors } from "./errors.js";
import { ProfileController } from "./profile.js";
import { Tenant } from "./tenant.js";
import { AdminSettingsController } from "./admin-settings.js";
import { NotificationController } from "./outbox.js";
import { OrderController, OrderService } from "./orders.js";
import { QuoteController, QuoteService } from "./quotes.js";
import { AdminCatalogController } from "./admin-catalog.js";
import { AuthController, AuthService, DevSmsProvider } from "./auth.js";
import { Branding, PublicController } from "./public.js";
@Module({
  controllers: [
    PrivacyController,
    CustomersController,
    SystemController,
    ReportsController,
    MediaController,
    CatalogSettingsController,
    StaffController,
    ProfileController,
    AdminSettingsController,
    NotificationController,
    OrderController,
    QuoteController,
    HealthController,
    PublicController,
    AuthController,
    AdminCatalogController,
  ],
  providers: [
    Tenant,
    OrderService,
    QuoteService,
    Database,
    Branding,
    AuthService,
    DevSmsProvider,
  ],
})
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
    bodyParser: false,
  });
  const { default: express } = await import("express");
  const origins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
      throw new Error("CORS_ALLOWED_ORIGINS must contain explicit URL origins");
  }
  if (origins.length)
    app.enableCors({
      origin: origins,
      credentials: false,
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      methods: ["GET", "POST", "PATCH", "DELETE"],
      exposedHeaders: ["X-Request-Id"],
    });
  app.use(helmet());
  app.use(
    (
      _req: unknown,
      res: { setHeader(k: string, v: string): void },
      next: () => void,
    ) => {
      res.setHeader("x-request-id", randomUUID());
      res.setHeader("Cache-Control", "no-store");
      next();
    },
  );
  app.use(express.json({ limit: "32kb" }));
  app.setGlobalPrefix("v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiErrors());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Food Delivery API")
      .setVersion("0.2.0")
      .build(),
  );
  enrichContract(document);
  SwaggerModule.setup("docs", app, document, {
    jsonDocumentUrl: "openapi.json",
  });
  app.enableShutdownHooks();
  return app;
}
