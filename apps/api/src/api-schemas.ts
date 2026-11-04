import { customerSchemas } from "./customers.js";
import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
export const apiSchemas: Record<string, SchemaObject> = {
  PrivacyExportPage: {
    type: "object",
    additionalProperties: false,
    required: ["section", "items", "nextCursor", "generatedAt"],
    properties: {
      section: {
        type: "string",
        enum: [
          "profile",
          "orders",
          "quotes",
          "sessions",
          "restrictions",
          "notifications",
        ],
      },
      items: {
        type: "array",
        maxItems: 10,
        items: { type: "object", additionalProperties: true },
      },
      nextCursor: { type: "string", format: "uuid", nullable: true },
      generatedAt: { type: "string", format: "date-time" },
    },
  },
  ...(customerSchemas as Record<string, SchemaObject>),
  BrandConfig: {
    title: "Public Brand v1",
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "id",
      "displayName",
      "applicationId",
      "apiBaseUrl",
      "currency",
      "locales",
      "defaultLocale",
      "timeZone",
      "primaryColor",
      "onPrimary",
      "surfaceColor",
      "textColor",
      "logoAsset",
      "supportEmail",
    ],
    properties: {
      schemaVersion: {
        enum: [1],
      },
      id: {
        type: "string",
        pattern: "^[a-z][a-z0-9-]{1,39}$",
      },
      displayName: {
        type: "string",
        minLength: 1,
        maxLength: 40,
        pattern: "\\S",
      },
      applicationId: {
        type: "string",
        pattern: "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*){2,}$",
      },
      apiBaseUrl: {
        type: "string",
        format: "uri",
        maxLength: 300,
      },
      currency: {
        enum: ["KZT"],
      },
      locales: {
        type: "array",
        items: {
          enum: ["ru", "kk"],
        },
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
      },
      defaultLocale: {
        enum: ["ru", "kk"],
      },
      timeZone: {
        type: "string",
        minLength: 1,
        maxLength: 80,
      },
      logoAsset: {
        type: "string",
        pattern: "^assets/[a-zA-Z0-9_/-]+\\.svg$",
      },
      supportEmail: {
        type: "string",
        format: "email",
        maxLength: 254,
      },
      primaryColor: {
        type: "string",
        pattern: "^#[0-9A-Fa-f]{6}$",
      },
      onPrimary: {
        type: "string",
        pattern: "^#[0-9A-Fa-f]{6}$",
      },
      surfaceColor: {
        type: "string",
        pattern: "^#[0-9A-Fa-f]{6}$",
      },
      textColor: {
        type: "string",
        pattern: "^#[0-9A-Fa-f]{6}$",
      },
    },
  },
  BootstrapResponse: {
    type: "object",
    additionalProperties: false,
    required: ["brand", "features"],
    properties: {
      brand: {
        $ref: "#/components/schemas/BrandConfig",
      },
      features: {
        type: "object",
        additionalProperties: false,
        required: ["ordering", "paymentProvider"],
        properties: {
          ordering: {
            type: "boolean",
          },
          paymentProvider: {
            type: "string",
            enum: ["mock"],
          },
        },
      },
    },
  },
  PublicBranch: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "nameRu",
      "nameKk",
      "timeZone",
      "acceptingOrders",
      "openNow",
      "allowCash",
      "preparationMinutes",
      "minimumPickupMinor",
    ],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      nameRu: {
        type: "string",
      },
      nameKk: {
        type: "string",
      },
      timeZone: {
        type: "string",
      },
      acceptingOrders: {
        type: "boolean",
      },
      openNow: {
        type: "boolean",
      },
      allowCash: {
        type: "boolean",
      },
      preparationMinutes: {
        type: "integer",
        minimum: 1,
        maximum: 180,
      },
      minimumPickupMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
    },
  },
  BranchesResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/PublicBranch",
        },
      },
    },
  },
  CatalogProduct: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "branchId",
      "name",
      "description",
      "priceMinor",
      "currency",
      "version",
    ],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      branchId: {
        type: "string",
        format: "uuid",
      },
      name: {
        type: "string",
      },
      description: {
        type: "string",
      },
      priceMinor: {
        type: "integer",
        minimum: 1,
        maximum: 100000000,
      },
      currency: {
        type: "string",
        enum: ["KZT"],
      },
      version: {
        type: "integer",
        minimum: 1,
      },
    },
  },
  CatalogPage: {
    type: "object",
    additionalProperties: false,
    required: ["items", "nextCursor"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/CatalogProduct",
        },
      },
      nextCursor: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
    },
  },
  OtpRequest: {
    type: "object",
    additionalProperties: false,
    required: ["phone"],
    properties: {
      phone: {
        type: "string",
        pattern: "^\\+[1-9][0-9]{7,14}$",
      },
    },
  },
  OtpChallengeResponse: {
    type: "object",
    additionalProperties: false,
    required: ["challengeId", "expiresIn", "retryAfter"],
    properties: {
      challengeId: {
        type: "string",
        format: "uuid",
      },
      expiresIn: {
        type: "integer",
        minimum: 1,
      },
      retryAfter: {
        type: "integer",
        minimum: 1,
      },
    },
  },
  OtpVerifyRequest: {
    type: "object",
    additionalProperties: false,
    required: ["challengeId", "code"],
    properties: {
      challengeId: {
        type: "string",
        format: "uuid",
      },
      code: {
        type: "string",
        pattern: "^[0-9]{6}$",
      },
    },
  },
  TokensResponse: {
    type: "object",
    additionalProperties: false,
    required: ["accessToken", "refreshToken", "expiresIn"],
    properties: {
      accessToken: {
        type: "string",
        pattern: "^[0-9a-f]{64}$",
      },
      refreshToken: {
        type: "string",
        pattern: "^[0-9a-f]{64}$",
      },
      expiresIn: {
        type: "integer",
        minimum: 1,
      },
    },
  },
  RefreshRequest: {
    type: "object",
    additionalProperties: false,
    required: ["refreshToken"],
    properties: {
      refreshToken: {
        type: "string",
        pattern: "^[0-9a-f]{64}$",
      },
    },
  },
  OkResponse: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: {
        type: "boolean",
        enum: [true],
      },
    },
  },
  EmptyRequest: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  CustomerProfile: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "phone", "locale"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      name: {
        type: "string",
        nullable: true,
      },
      phone: {
        type: "string",
        nullable: true,
      },
      locale: {
        type: "string",
        enum: ["ru", "kk"],
      },
    },
  },
  ProfileRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: {
        type: "string",
        maxLength: 80,
        nullable: true,
      },
      locale: {
        type: "string",
        enum: ["ru", "kk"],
      },
    },
  },
  AddressRequest: {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: {
      label: {
        type: "string",
        maxLength: 80,
      },
      text: {
        type: "string",
        minLength: 5,
        maxLength: 300,
      },
      latitude: {
        type: "number",
        minimum: -90,
        maximum: 90,
        nullable: true,
      },
      longitude: {
        type: "number",
        minimum: -180,
        maximum: 180,
        nullable: true,
      },
    },
  },
  AddressUpdateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedVersion", "text"],
    properties: {
      label: {
        type: "string",
        maxLength: 80,
      },
      text: {
        type: "string",
        minLength: 5,
        maxLength: 300,
      },
      latitude: {
        type: "number",
        minimum: -90,
        maximum: 90,
        nullable: true,
      },
      longitude: {
        type: "number",
        minimum: -180,
        maximum: 180,
        nullable: true,
      },
      expectedVersion: {
        type: "integer",
        minimum: 1,
      },
    },
  },
  VersionRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedVersion"],
    properties: {
      expectedVersion: {
        type: "integer",
        minimum: 1,
      },
    },
  },
  SavedAddress: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "customerId",
      "label",
      "text",
      "latitude",
      "longitude",
      "version",
      "createdAt",
    ],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      customerId: {
        type: "string",
        format: "uuid",
      },
      label: {
        type: "string",
      },
      text: {
        type: "string",
      },
      latitude: {
        type: "number",
        nullable: true,
      },
      longitude: {
        type: "number",
        nullable: true,
      },
      version: {
        type: "integer",
        minimum: 1,
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
    },
  },
  AddressesResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/SavedAddress",
        },
      },
    },
  },
  DeliveryAddress: {
    type: "object",
    additionalProperties: false,
    required: ["text", "latitude", "longitude"],
    properties: {
      text: {
        type: "string",
        minLength: 5,
        maxLength: 300,
      },
      latitude: {
        type: "number",
        minimum: -90,
        maximum: 90,
      },
      longitude: {
        type: "number",
        minimum: -180,
        maximum: 180,
      },
    },
  },
  QuoteLineRequest: {
    type: "object",
    additionalProperties: false,
    required: ["productId", "quantity"],
    properties: {
      productId: {
        type: "string",
        format: "uuid",
      },
      quantity: {
        type: "integer",
        minimum: 1,
        maximum: 99,
      },
    },
  },
  QuoteRequest: {
    type: "object",
    additionalProperties: false,
    required: ["branchId", "fulfilment", "items"],
    properties: {
      branchId: {
        type: "string",
        format: "uuid",
      },
      fulfilment: {
        type: "string",
        enum: ["pickup", "delivery"],
      },
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/QuoteLineRequest",
        },
        minItems: 1,
        maxItems: 100,
      },
      address: {
        $ref: "#/components/schemas/DeliveryAddress",
      },
      promoCode: {
        type: "string",
        pattern: "^[a-zA-Z0-9_-]{3,32}$",
      },
      comment: {
        type: "string",
        maxLength: 500,
      },
    },
  },
  QuotedItem: {
    type: "object",
    additionalProperties: false,
    required: [
      "productId",
      "nameRu",
      "nameKk",
      "quantity",
      "unitPriceMinor",
      "lineTotalMinor",
      "version",
    ],
    properties: {
      productId: {
        type: "string",
        format: "uuid",
      },
      nameRu: {
        type: "string",
      },
      nameKk: {
        type: "string",
      },
      quantity: {
        type: "integer",
        minimum: 1,
        maximum: 99,
      },
      unitPriceMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      lineTotalMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      version: {
        type: "integer",
        minimum: 1,
      },
    },
  },
  QuoteResponse: {
    type: "object",
    additionalProperties: false,
    required: [
      "quoteId",
      "expiresAt",
      "pricingVersion",
      "signature",
      "items",
      "subtotalMinor",
      "discountMinor",
      "deliveryFeeMinor",
      "totalMinor",
      "currency",
      "zoneId",
      "promotionId",
      "preparationMinutes",
    ],
    properties: {
      quoteId: {
        type: "string",
        format: "uuid",
      },
      expiresAt: {
        type: "string",
        format: "date-time",
      },
      pricingVersion: {
        type: "string",
      },
      signature: {
        type: "string",
      },
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/QuotedItem",
        },
      },
      subtotalMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      discountMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      deliveryFeeMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      totalMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      currency: {
        type: "string",
        enum: ["KZT"],
      },
      zoneId: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
      promotionId: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
      preparationMinutes: {
        type: "integer",
        minimum: 1,
        maximum: 180,
      },
    },
  },
  CreateOrderRequest: {
    type: "object",
    additionalProperties: false,
    required: ["quoteId", "paymentMethod"],
    properties: {
      quoteId: {
        type: "string",
        format: "uuid",
      },
      paymentMethod: {
        type: "string",
        enum: ["mock", "cash"],
      },
    },
  },
  ReasonRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedVersion", "reason"],
    properties: {
      expectedVersion: {
        type: "integer",
        minimum: 1,
      },
      reason: {
        type: "string",
        minLength: 3,
        maxLength: 500,
      },
    },
  },
  MockResultRequest: {
    type: "object",
    additionalProperties: false,
    required: ["outcome"],
    properties: {
      outcome: {
        type: "string",
        enum: ["paid", "failed", "timeout"],
      },
    },
  },
  RefundResponse: {
    type: "object",
    additionalProperties: false,
    required: ["id", "status", "amountMinor", "provider"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      status: {
        type: "string",
      },
      amountMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      provider: {
        type: "string",
      },
    },
  },
  OrderPayment: {
    type: "object",
    additionalProperties: false,
    required: ["id", "provider", "status", "amountMinor", "refund"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      provider: {
        type: "string",
      },
      status: {
        type: "string",
      },
      amountMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      refund: {
        allOf: [
          {
            $ref: "#/components/schemas/RefundResponse",
          },
        ],
        nullable: true,
      },
    },
  },
  OrderItem: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "productId",
      "nameRu",
      "nameKk",
      "quantity",
      "unitPriceMinor",
      "lineTotalMinor",
    ],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      productId: {
        type: "string",
        format: "uuid",
      },
      nameRu: {
        type: "string",
      },
      nameKk: {
        type: "string",
      },
      quantity: {
        type: "integer",
        minimum: 1,
        maximum: 99,
      },
      unitPriceMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      lineTotalMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
    },
  },
  OrderEvent: {
    type: "object",
    additionalProperties: false,
    required: ["id", "action", "version", "createdAt", "reason"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      action: {
        type: "string",
      },
      version: {
        type: "integer",
        minimum: 1,
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
      reason: {
        type: "string",
        nullable: true,
      },
    },
  },
  KitchenItem: {
    type: "object",
    additionalProperties: false,
    required: ["id", "productId", "nameRu", "nameKk", "quantity"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      productId: {
        type: "string",
        format: "uuid",
      },
      nameRu: {
        type: "string",
      },
      nameKk: {
        type: "string",
      },
      quantity: {
        type: "integer",
        minimum: 1,
        maximum: 99,
      },
    },
  },
  CustomerOrder: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "branchId",
      "fulfilment",
      "status",
      "version",
      "preparationMinutes",
      "createdAt",
      "items",
      "comment",
      "paymentMethod",
      "paymentStatus",
      "currency",
      "subtotalMinor",
      "discountMinor",
      "deliveryFeeMinor",
      "totalMinor",
      "address",
      "courierId",
      "courierAccepted",
      "pickupCode",
      "payments",
      "events",
    ],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      branchId: {
        type: "string",
        format: "uuid",
      },
      fulfilment: {
        type: "string",
        enum: ["pickup", "delivery"],
      },
      status: {
        type: "string",
        enum: [
          "awaiting_payment",
          "placed",
          "accepted",
          "preparing",
          "ready",
          "out_for_delivery",
          "delivered",
          "completed",
          "rejected",
          "cancelled",
          "expired",
        ],
      },
      version: {
        type: "integer",
        minimum: 1,
      },
      preparationMinutes: {
        type: "integer",
        nullable: true,
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/OrderItem",
        },
      },
      comment: {
        type: "string",
      },
      paymentMethod: {
        type: "string",
        enum: ["mock", "cash"],
      },
      paymentStatus: {
        type: "string",
        enum: [
          "unpaid",
          "pending",
          "paid",
          "failed",
          "expired",
          "refund_pending",
          "refunded",
          "manual_review",
        ],
      },
      currency: {
        type: "string",
        enum: ["KZT"],
      },
      subtotalMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      discountMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      deliveryFeeMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      totalMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      address: {
        allOf: [
          {
            $ref: "#/components/schemas/DeliveryAddress",
          },
        ],
        nullable: true,
      },
      courierId: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
      courierAccepted: {
        type: "boolean",
      },
      pickupCode: {
        type: "string",
        pattern: "^[0-9]{6}$",
        nullable: true,
      },
      payments: {
        type: "array",
        items: {
          $ref: "#/components/schemas/OrderPayment",
        },
      },
      events: {
        type: "array",
        items: {
          $ref: "#/components/schemas/OrderEvent",
        },
      },
    },
  },
  Contact: {
    type: "object",
    additionalProperties: false,
    required: ["name", "phone"],
    properties: {
      name: {
        type: "string",
        nullable: true,
      },
      phone: {
        type: "string",
        nullable: true,
      },
    },
  },
  OperationsOrder: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "branchId",
      "fulfilment",
      "status",
      "version",
      "preparationMinutes",
      "createdAt",
      "items",
      "comment",
      "paymentMethod",
      "paymentStatus",
      "currency",
      "subtotalMinor",
      "discountMinor",
      "deliveryFeeMinor",
      "totalMinor",
      "address",
      "courierId",
      "courierAccepted",
      "pickupCode",
      "payments",
      "events",
      "contact",
    ],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      branchId: {
        type: "string",
        format: "uuid",
      },
      fulfilment: {
        type: "string",
        enum: ["pickup", "delivery"],
      },
      status: {
        type: "string",
        enum: [
          "awaiting_payment",
          "placed",
          "accepted",
          "preparing",
          "ready",
          "out_for_delivery",
          "delivered",
          "completed",
          "rejected",
          "cancelled",
          "expired",
        ],
      },
      version: {
        type: "integer",
        minimum: 1,
      },
      preparationMinutes: {
        type: "integer",
        nullable: true,
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/OrderItem",
        },
      },
      comment: {
        type: "string",
      },
      paymentMethod: {
        type: "string",
        enum: ["mock", "cash"],
      },
      paymentStatus: {
        type: "string",
        enum: [
          "unpaid",
          "pending",
          "paid",
          "failed",
          "expired",
          "refund_pending",
          "refunded",
          "manual_review",
        ],
      },
      currency: {
        type: "string",
        enum: ["KZT"],
      },
      subtotalMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      discountMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      deliveryFeeMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      totalMinor: {
        type: "integer",
        minimum: 0,
        maximum: 100000000,
      },
      address: {
        allOf: [
          {
            $ref: "#/components/schemas/DeliveryAddress",
          },
        ],
        nullable: true,
      },
      courierId: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
      courierAccepted: {
        type: "boolean",
      },
      pickupCode: {
        type: "string",
        pattern: "^[0-9]{6}$",
        nullable: true,
      },
      payments: {
        type: "array",
        items: {
          $ref: "#/components/schemas/OrderPayment",
        },
      },
      events: {
        type: "array",
        items: {
          $ref: "#/components/schemas/OrderEvent",
        },
      },
      contact: {
        $ref: "#/components/schemas/Contact",
      },
    },
  },
  KitchenOrder: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "branchId",
      "fulfilment",
      "status",
      "version",
      "preparationMinutes",
      "createdAt",
      "items",
      "comment",
    ],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      branchId: {
        type: "string",
        format: "uuid",
      },
      fulfilment: {
        type: "string",
        enum: ["pickup", "delivery"],
      },
      status: {
        type: "string",
        enum: [
          "awaiting_payment",
          "placed",
          "accepted",
          "preparing",
          "ready",
          "out_for_delivery",
          "delivered",
          "completed",
          "rejected",
          "cancelled",
          "expired",
        ],
      },
      version: {
        type: "integer",
        minimum: 1,
      },
      preparationMinutes: {
        type: "integer",
        nullable: true,
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/KitchenItem",
        },
      },
      comment: {
        type: "string",
      },
    },
  },
  StaffOrder: {
    oneOf: [
      {
        $ref: "#/components/schemas/OperationsOrder",
      },
      {
        $ref: "#/components/schemas/KitchenOrder",
      },
    ],
  },
  OrdersPage: {
    type: "object",
    additionalProperties: false,
    required: ["items", "nextCursor"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/CustomerOrder",
        },
      },
      nextCursor: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
    },
  },
  StaffOrdersPage: {
    type: "object",
    additionalProperties: false,
    required: ["items", "nextCursor"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/StaffOrder",
        },
      },
      nextCursor: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
    },
  },
  CourierPage: {
    type: "object",
    additionalProperties: false,
    required: ["items", "nextCursor"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/OperationsOrder",
        },
      },
      nextCursor: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
    },
  },
  CourierDoneResponse: {
    type: "object",
    additionalProperties: false,
    required: ["id", "status", "version"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      status: {
        type: "string",
      },
      version: {
        type: "integer",
        minimum: 1,
      },
    },
  },
  StaffLoginRequest: {
    type: "object",
    additionalProperties: false,
    required: ["email", "password", "code"],
    properties: {
      email: {
        type: "string",
        format: "email",
        maxLength: 254,
      },
      password: {
        type: "string",
        minLength: 16,
        maxLength: 128,
      },
      code: {
        type: "string",
        pattern: "^[0-9]{6}$",
      },
    },
  },
  RoleBindingInfo: {
    type: "object",
    additionalProperties: false,
    required: ["role", "branchId", "refundAllowed"],
    properties: {
      role: {
        type: "string",
        enum: [
          "owner",
          "manager",
          "operator",
          "kitchen",
          "dispatcher",
          "courier",
          "analyst",
        ],
      },
      branchId: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
      refundAllowed: {
        type: "boolean",
      },
    },
  },
  StaffInfo: {
    type: "object",
    additionalProperties: false,
    required: ["id", "email"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      email: {
        type: "string",
      },
      roles: {
        type: "array",
        items: {
          $ref: "#/components/schemas/RoleBindingInfo",
        },
      },
    },
  },
  StaffSession: {
    type: "object",
    additionalProperties: false,
    required: ["csrfToken", "user"],
    properties: {
      csrfToken: {
        type: "string",
        pattern: "^[0-9a-f]{64}$",
      },
      user: {
        $ref: "#/components/schemas/StaffInfo",
      },
    },
  },
  Notification: {
    type: "object",
    additionalProperties: false,
    required: ["id", "orderId", "type", "provider", "createdAt"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      orderId: {
        type: "string",
        format: "uuid",
      },
      type: {
        type: "string",
      },
      provider: {
        type: "string",
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
    },
  },
  NotificationsResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/Notification",
        },
      },
    },
  },
  LiveResponse: {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: ["ok"],
      },
    },
  },
  ReadyResponse: {
    type: "object",
    additionalProperties: false,
    required: ["status", "database", "migrations"],
    properties: {
      status: {
        type: "string",
        enum: ["ok"],
      },
      database: {
        type: "string",
        enum: ["ready"],
      },
      migrations: {
        type: "string",
        enum: ["ready"],
      },
    },
  },
  ApiError: {
    type: "object",
    additionalProperties: false,
    required: ["code", "message", "requestId", "details", "fieldErrors"],
    properties: {
      code: {
        type: "string",
      },
      message: {
        type: "string",
      },
      requestId: {
        type: "string",
        format: "uuid",
      },
      details: {
        type: "object",
        nullable: true,
        additionalProperties: true,
      },
      fieldErrors: {
        type: "array",
        items: {
          type: "string",
        },
      },
    },
  },
  AdminResource: {
    type: "object",
    additionalProperties: true,
  },
  AdminResources: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/components/schemas/AdminResource",
        },
      },
      nextCursor: {
        type: "string",
        format: "uuid",
        nullable: true,
      },
    },
  },
};
apiSchemas.NullableRefundResponse = {
  ...apiSchemas.RefundResponse,
  nullable: true,
};
apiSchemas.NullableDeliveryAddress = {
  ...apiSchemas.DeliveryAddress,
  nullable: true,
};
apiSchemas.OrderPayment.properties!.refund = {
  $ref: "#/components/schemas/NullableRefundResponse",
};
apiSchemas.CustomerOrder.properties!.address = {
  $ref: "#/components/schemas/NullableDeliveryAddress",
};
apiSchemas.OperationsOrder.properties!.address = {
  $ref: "#/components/schemas/NullableDeliveryAddress",
};
apiSchemas.FeatureFlags = {
  type: "object",
  additionalProperties: false,
  required: ["ordering", "paymentProvider"],
  properties: {
    ordering: { type: "boolean" },
    paymentProvider: { type: "string", enum: ["mock"] },
  },
};
apiSchemas.BootstrapResponse.properties!.features = {
  $ref: "#/components/schemas/FeatureFlags",
};
// Public catalog selections are typed; prices and validation remain server authoritative.
Object.assign(apiSchemas, {
  ProductVariant: {
    type: "object",
    additionalProperties: false,
    required: ["id", "nameRu", "nameKk", "priceMinor", "active"],
    properties: {
      id: { type: "string", format: "uuid" },
      nameRu: { type: "string" },
      nameKk: { type: "string" },
      priceMinor: { type: "integer", minimum: 1, maximum: 100000000 },
      active: { type: "boolean" },
    },
  },
  ProductChoice: {
    type: "object",
    additionalProperties: false,
    required: ["id", "nameRu", "nameKk", "deltaMinor", "active"],
    properties: {
      id: { type: "string", format: "uuid" },
      nameRu: { type: "string" },
      nameKk: { type: "string" },
      deltaMinor: { type: "integer", minimum: 0, maximum: 100000000 },
      active: { type: "boolean" },
    },
  },
  ProductGroup: {
    type: "object",
    additionalProperties: false,
    required: ["id", "nameRu", "nameKk", "minimum", "maximum", "choices"],
    properties: {
      id: { type: "string", format: "uuid" },
      nameRu: { type: "string" },
      nameKk: { type: "string" },
      minimum: { type: "integer", minimum: 0, maximum: 30 },
      maximum: { type: "integer", minimum: 1, maximum: 30 },
      choices: {
        type: "array",
        items: { $ref: "#/components/schemas/ProductChoice" },
      },
    },
  },
  ProductConfiguration: {
    type: "object",
    additionalProperties: false,
    required: ["variants", "groups"],
    properties: {
      variants: {
        type: "array",
        items: { $ref: "#/components/schemas/ProductVariant" },
      },
      groups: {
        type: "array",
        items: { $ref: "#/components/schemas/ProductGroup" },
      },
    },
  },
  SelectedOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "nameRu", "nameKk", "deltaMinor"],
    properties: {
      id: { type: "string", format: "uuid" },
      nameRu: { type: "string" },
      nameKk: { type: "string" },
      deltaMinor: { type: "integer", minimum: 0, maximum: 100000000 },
    },
  },
  ProductCategory: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "position"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      position: { type: "integer", minimum: 0, maximum: 10000 },
    },
    nullable: true,
  },
});
Object.assign(apiSchemas.CatalogProduct.properties!, {
  configuration: { $ref: "#/components/schemas/ProductConfiguration" },
  category: { $ref: "#/components/schemas/ProductCategory" },
});
Object.assign(apiSchemas.QuoteLineRequest.properties!, {
  variantId: { type: "string", format: "uuid" },
  choiceIds: {
    type: "array",
    maxItems: 100,
    items: { type: "string", format: "uuid" },
  },
});
apiSchemas.QuotedItem.properties!.options = {
  type: "array",
  items: { $ref: "#/components/schemas/SelectedOption" },
};
apiSchemas.KitchenItem.properties!.options = {
  type: "array",
  items: { $ref: "#/components/schemas/SelectedOption" },
};
apiSchemas.OrderItem.properties!.options = {
  type: "array",
  items: { $ref: "#/components/schemas/SelectedOption" },
};
apiSchemas.CatalogProduct.properties!.imageUrl = {
  type: "string",
  nullable: true,
};
apiSchemas.BrandConfig.properties!.applicationId = {
  type: "string",
  pattern: "^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*){2,}$",
};
Object.assign(apiSchemas.PublicBranch.properties!, {
  latitude: { type: "number", nullable: true },
  longitude: { type: "number", nullable: true },
  addressRu: { type: "string" },
  addressKk: { type: "string" },
});
// Private responses are explicit projections; credentials occur only in the owner create response.
Object.assign(apiSchemas, {
  AdminConfiguration: {
    type: "object",
    additionalProperties: false,
    properties: {
      variants: {
        type: "array",
        items: { $ref: "#/components/schemas/ProductVariant" },
      },
      groups: {
        type: "array",
        items: { $ref: "#/components/schemas/ProductGroup" },
      },
    },
  },
  AdminBranch: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
      version: { type: "integer", minimum: 1 },
      nameRu: { type: "string" },
      nameKk: { type: "string" },
      timeZone: { type: "string" },
      acceptingOrders: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
      schedule: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            startMinute: { type: "integer", minimum: 0, maximum: 1439 },
            endMinute: { type: "integer", minimum: 1, maximum: 1440 },
            day: { type: "integer", minimum: 0, maximum: 6 },
          },
          required: ["startMinute", "endMinute", "day"],
        },
      },
      holidays: {
        type: "object",
        additionalProperties: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              startMinute: { type: "integer", minimum: 0, maximum: 1439 },
              endMinute: { type: "integer", minimum: 1, maximum: 1440 },
            },
            required: ["startMinute", "endMinute"],
          },
        },
      },
      preparationMinutes: { type: "integer", minimum: 1 },
      maxActiveOrders: { type: "integer", minimum: 1 },
      allowCash: { type: "boolean" },
      minimumPickupMinor: { type: "integer", minimum: 0 },
      latitude: { type: "number", nullable: true },
      longitude: { type: "number", nullable: true },
      addressRu: { type: "string" },
      addressKk: { type: "string" },
    },
    required: [
      "id",
      "version",
      "nameRu",
      "nameKk",
      "timeZone",
      "acceptingOrders",
      "createdAt",
      "schedule",
      "holidays",
      "preparationMinutes",
      "maxActiveOrders",
      "allowCash",
      "minimumPickupMinor",
      "latitude",
      "longitude",
      "addressRu",
      "addressKk",
    ],
  },
  AdminProduct: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
      version: { type: "integer", minimum: 1 },
      branchId: { type: "string", format: "uuid" },
      nameRu: { type: "string" },
      nameKk: { type: "string" },
      descriptionRu: { type: "string" },
      descriptionKk: { type: "string" },
      priceMinor: { type: "integer", minimum: 1 },
      stockQuantity: { type: "integer", minimum: 0, nullable: true },
      active: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
      categoryId: { type: "string", format: "uuid", nullable: true },
      imageId: { type: "string", format: "uuid", nullable: true },
      configuration: { $ref: "#/components/schemas/AdminConfiguration" },
    },
    required: [
      "id",
      "version",
      "branchId",
      "nameRu",
      "nameKk",
      "descriptionRu",
      "descriptionKk",
      "priceMinor",
      "stockQuantity",
      "active",
      "createdAt",
      "updatedAt",
      "categoryId",
      "imageId",
      "configuration",
    ],
  },
  AdminCategory: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
      version: { type: "integer", minimum: 1 },
      branchId: { type: "string", format: "uuid" },
      nameRu: { type: "string" },
      nameKk: { type: "string" },
      active: { type: "boolean" },
      position: { type: "integer", minimum: 0 },
    },
    required: [
      "id",
      "version",
      "branchId",
      "nameRu",
      "nameKk",
      "active",
      "position",
    ],
  },
  AdminZone: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
      version: { type: "integer", minimum: 1 },
      branchId: { type: "string", format: "uuid" },
      name: { type: "string" },
      polygon: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            latitude: { type: "number" },
            longitude: { type: "number" },
          },
          required: ["latitude", "longitude"],
        },
      },
      priority: { type: "integer" },
      feeMinor: { type: "integer", minimum: 0 },
      minimumMinor: { type: "integer", minimum: 0 },
      freeThresholdMinor: { type: "integer", minimum: 0, nullable: true },
      active: { type: "boolean" },
    },
    required: [
      "id",
      "version",
      "branchId",
      "name",
      "polygon",
      "priority",
      "feeMinor",
      "minimumMinor",
      "freeThresholdMinor",
      "active",
    ],
  },
  AdminPromotion: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
      version: { type: "integer", minimum: 1 },
      branchId: { type: "string", format: "uuid" },
      code: { type: "string" },
      basisPoints: { type: "integer", minimum: 1, nullable: true },
      fixedMinor: { type: "integer", minimum: 1, nullable: true },
      maxDiscountMinor: { type: "integer", minimum: 1, nullable: true },
      minimumMinor: { type: "integer", minimum: 0 },
      totalLimit: { type: "integer", minimum: 1, nullable: true },
      customerLimit: { type: "integer", minimum: 1, nullable: true },
      startsAt: { type: "string", format: "date-time" },
      endsAt: { type: "string", format: "date-time" },
      active: { type: "boolean" },
    },
    required: [
      "id",
      "version",
      "branchId",
      "code",
      "basisPoints",
      "fixedMinor",
      "maxDiscountMinor",
      "minimumMinor",
      "totalLimit",
      "customerLimit",
      "startsAt",
      "endsAt",
      "active",
    ],
  },
  AdminStaffMember: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
      version: { type: "integer", minimum: 1 },
      email: { type: "string", format: "email" },
      active: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
      roles: {
        type: "array",
        items: { $ref: "#/components/schemas/RoleBindingInfo" },
      },
    },
    required: ["id", "version", "email", "active", "createdAt", "roles"],
  },
  StaffCredentialsOnce: {
    type: "object",
    additionalProperties: false,
    properties: {
      staff: { $ref: "#/components/schemas/AdminStaffMember" },
      credentials: {
        type: "object",
        additionalProperties: false,
        properties: {
          password: { type: "string", format: "password" },
          totpSecret: { type: "string" },
        },
        required: ["password", "totpSecret"],
      },
    },
    required: ["staff", "credentials"],
  },
  SystemStatus: {
    type: "object",
    additionalProperties: false,
    properties: {
      asOf: { type: "string", format: "date-time" },
      provider: { type: "string", enum: ["local-demo"] },
      workers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["expiry", "notifications"] },
            lastSeenAt: { type: "string", format: "date-time", nullable: true },
            healthy: { type: "boolean" },
          },
          required: ["kind", "lastSeenAt", "healthy"],
        },
      },
      outbox: {
        type: "object",
        additionalProperties: false,
        properties: {
          pending: { type: "integer", minimum: 0 },
          deadLetters: { type: "integer", minimum: 0 },
          oldestAgeSeconds: { type: "integer", minimum: 0, nullable: true },
        },
        required: ["pending", "deadLetters", "oldestAgeSeconds"],
      },
    },
    required: ["asOf", "provider", "workers", "outbox"],
  },
  OutboxStatus: {
    type: "object",
    additionalProperties: false,
    properties: {
      pending: { type: "integer", minimum: 0 },
      deadLetters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", format: "uuid" },
            type: { type: "string" },
            attempts: { type: "integer", minimum: 0 },
            createdAt: { type: "string", format: "date-time" },
          },
          required: ["id", "type", "attempts", "createdAt"],
        },
      },
    },
    required: ["pending", "deadLetters"],
  },
  CohortReport: {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["orders_created_cohort_snapshot"] },
      asOf: { type: "string", format: "date-time" },
      branchId: { type: "string", format: "uuid" },
      timeZone: { type: "string" },
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
      currency: { type: "string", enum: ["KZT"] },
      statuses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string" },
            count: { type: "integer", minimum: 0 },
            totalMinor: { type: "integer", minimum: 0 },
          },
          required: ["status", "count", "totalMinor"],
        },
      },
      chargedMinor: { type: "integer", minimum: 0 },
      refundedMinor: { type: "integer", minimum: 0 },
      cashReceivedMinor: { type: "integer", minimum: 0 },
      netReceivedMinor: { type: "integer" },
      manualReviewCount: { type: "integer", minimum: 0 },
      days: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            day: { type: "string", format: "date" },
            count: { type: "integer", minimum: 0 },
            totalMinor: { type: "integer", minimum: 0 },
          },
          required: ["day", "count", "totalMinor"],
        },
      },
    },
    required: [
      "kind",
      "asOf",
      "branchId",
      "timeZone",
      "from",
      "to",
      "currency",
      "statuses",
      "chargedMinor",
      "refundedMinor",
      "cashReceivedMinor",
      "netReceivedMinor",
      "manualReviewCount",
      "days",
    ],
  },
  AdminBranchList: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/AdminBranch" },
      },
    },
    required: ["items"],
  },
  AdminProductList: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/AdminProduct" },
      },
      nextCursor: { type: "string", format: "uuid", nullable: true },
    },
    required: ["items", "nextCursor"],
  },
  AdminCategoryList: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/AdminCategory" },
      },
    },
    required: ["items"],
  },
  AdminZoneList: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/AdminZone" },
      },
    },
    required: ["items"],
  },
  AdminPromotionList: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/AdminPromotion" },
      },
    },
    required: ["items"],
  },
  AdminStaffMemberList: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/AdminStaffMember" },
      },
    },
    required: ["items"],
  },
  CourierList: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
          },
          required: ["id", "email"],
        },
      },
    },
    required: ["items"],
  },
});
for (const name of ["QuoteResponse", "CustomerOrder", "OperationsOrder"])
  if (apiSchemas[name]?.properties?.totalMinor)
    apiSchemas[name].properties!.totalMinor = {
      type: "integer",
      minimum: 0,
      maximum: 100000000,
    };
for (const name of ["CustomerOrder", "OperationsOrder"]) {
  apiSchemas[name].properties!.paymentMethod = {
    type: "string",
    enum: ["mock", "cash", "no_payment_required"],
  };
  apiSchemas[name].properties!.paymentStatus = {
    type: "string",
    enum: [
      "unpaid",
      "pending",
      "paid",
      "failed",
      "expired",
      "refund_pending",
      "refunded",
      "manual_review",
      "not_required",
    ],
  };
}
const responses: Record<string, string> = {
  PrivacyController_challenge: "OtpChallengeResponse",
  PrivacyController_confirm: "OkResponse",
  PrivacyController_export: "PrivacyExportPage",
  CustomersController_list: "AdminCustomerList",
  CustomersController_restrict: "CustomerRestriction",
  SystemController_get: "SystemStatus",
  ReportsController_get: "CohortReport",
  ReportsController_export: "AdminResource",
  MediaController_upload: "AdminProduct",
  MediaController_remove: "AdminProduct",
  MediaController_get: "AdminResource",
  CatalogSettingsController_categories: "AdminCategoryList",
  CatalogSettingsController_category: "AdminCategory",
  CatalogSettingsController_updateCategory: "AdminCategory",
  CatalogSettingsController_configuration: "AdminProduct",
  StaffController_list: "AdminStaffMemberList",
  StaffController_create: "StaffCredentialsOnce",
  StaffController_update: "AdminStaffMember",
  PublicController_bootstrap: "BootstrapResponse",
  PublicController_branches: "BranchesResponse",
  PublicController_catalog: "CatalogPage",
  HealthController_live: "LiveResponse",
  HealthController_ready: "ReadyResponse",
  AuthController_requestOtp: "OtpChallengeResponse",
  AuthController_deletionChallenge: "OtpChallengeResponse",
  AuthController_verifyOtp: "TokensResponse",
  AuthController_refresh: "TokensResponse",
  AuthController_me: "CustomerProfile",
  ProfileController_update: "CustomerProfile",
  AuthController_logout: "OkResponse",
  AuthController_logoutAll: "OkResponse",
  AuthController_delete: "OkResponse",
  AuthController_staffLogout: "OkResponse",
  ProfileController_remove: "OkResponse",
  NotificationController_retry: "OkResponse",
  AuthController_staffLogin: "StaffSession",
  AuthController_session: "StaffSession",
  ProfileController_addresses: "AddressesResponse",
  ProfileController_create: "SavedAddress",
  ProfileController_address: "SavedAddress",
  QuoteController_quote: "QuoteResponse",
  OrderController_create: "CustomerOrder",
  OrderController_lookup: "CustomerOrder",
  OrderController_get: "CustomerOrder",
  OrderController_cancel: "CustomerOrder",
  OrderController_retry: "CustomerOrder",
  OrderController_result: "CustomerOrder",
  OrderController_mine: "OrdersPage",
  OrderController_list: "StaffOrdersPage",
  OrderController_staffGet: "StaffOrder",
  OrderController_accept: "StaffOrder",
  OrderController_prepare: "StaffOrder",
  OrderController_ready: "StaffOrder",
  OrderController_reject: "StaffOrder",
  OrderController_staffCancel: "StaffOrder",
  OrderController_pickup: "StaffOrder",
  OrderController_assign: "StaffOrder",
  OrderController_assignments: "CourierPage",
  OrderController_courierAccept: "OperationsOrder",
  OrderController_collect: "OperationsOrder",
  OrderController_deliver: "CourierDoneResponse",
  OrderController_refund: "RefundResponse",
  NotificationController_mine: "NotificationsResponse",
  AdminSettingsController_couriers: "CourierList",
  AdminSettingsController_zones: "AdminZoneList",
  AdminSettingsController_promotions: "AdminPromotionList",
  AdminCatalogController_branches: "AdminBranchList",
  AdminCatalogController_products: "AdminProductList",
  AdminSettingsController_branch: "AdminBranch",
  AdminSettingsController_stock: "AdminProduct",
  AdminSettingsController_zone: "AdminZone",
  AdminSettingsController_updateZone: "AdminZone",
  AdminSettingsController_promo: "AdminPromotion",
  AdminSettingsController_updatePromo: "AdminPromotion",
  AdminCatalogController_create: "AdminProduct",
  AdminCatalogController_update: "AdminProduct",
  AdminCatalogController_updateBranch: "AdminBranch",
  NotificationController_pending: "OutboxStatus",
};
const bodies: Record<string, string> = {
  PrivacyController_confirm: "OtpVerifyRequest",
  PrivacyController_challenge: "EmptyRequest",
  AuthController_requestOtp: "OtpRequest",
  AuthController_verifyOtp: "OtpVerifyRequest",
  AuthController_refresh: "RefreshRequest",
  AuthController_staffLogin: "StaffLoginRequest",
  AuthController_logout: "EmptyRequest",
  AuthController_staffLogout: "EmptyRequest",
  AuthController_logoutAll: "EmptyRequest",
  AuthController_deletionChallenge: "EmptyRequest",
  AuthController_delete: "OtpVerifyRequest",
  ProfileController_update: "ProfileRequest",
  ProfileController_create: "AddressRequest",
  ProfileController_address: "AddressUpdateRequest",
  ProfileController_remove: "VersionRequest",
  QuoteController_quote: "QuoteRequest",
  OrderController_create: "CreateOrderRequest",
  OrderController_cancel: "ReasonRequest",
  OrderController_retry: "EmptyRequest",
  OrderController_result: "MockResultRequest",
};
export function enrichContract(document: OpenAPIObject) {
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ...apiSchemas,
  };
  document.components.securitySchemes = {
    nativeSession: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "Opaque access token",
    },
    staffSession: { type: "apiKey", in: "cookie", name: "food_session" },
  };
  for (const [path, item] of Object.entries(document.paths))
    for (const method of ["get", "post", "patch", "delete"] as const) {
      const operation = item?.[method];
      if (!operation) continue;
      const id = operation.operationId!;
      const response = responses[id];
      if (!response) throw new Error("Response contract missing for " + id);
      const success =
        Object.keys(operation.responses ?? {}).find((c) => c.startsWith("2")) ??
        "200";
      operation.responses[success] = {
        description: "Successful operation",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/" + response },
          },
        },
      };
      if (id === "ReportsController_export")
        operation.responses[success] = {
          description: "Aggregate cohort CSV, integer tiyn",
          content: { "text/csv": { schema: { type: "string" } } },
        };
      if (id === "MediaController_get")
        operation.responses[success] = {
          description: "Validated public WebP",
          content: {
            "image/webp": { schema: { type: "string", format: "binary" } },
          },
        };
      if (id === "MediaController_upload")
        operation.requestBody = {
          required: true,
          content: Object.fromEntries(
            ["image/jpeg", "image/png", "image/webp"].map((type) => [
              type,
              {
                schema: {
                  type: "string",
                  format: "binary",
                  maxLength: 5242880,
                },
              },
            ]),
          ),
        };
      for (const code of [400, 401, 403, 404, 409, 413, 422, 429, 500, 503])
        operation.responses[String(code)] = {
          description: "Safe API error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
            },
          },
        };
      if (bodies[id])
        operation.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/" + bodies[id] },
            },
          },
        };
      const staff =
        (path.startsWith("/v1/admin/") && path !== "/v1/admin/auth/login") ||
        path.startsWith("/v1/courier/");
      const customer =
        path.startsWith("/v1/me") ||
        path.startsWith("/v1/orders") ||
        path.startsWith("/v1/payments") ||
        path.startsWith("/v1/checkout") ||
        path === "/v1/auth/logout" ||
        path === "/v1/auth/logout-all";
      operation.security = staff
        ? [{ staffSession: [] }]
        : customer
          ? [{ nativeSession: [] }]
          : [];
      if (staff && method !== "get") {
        operation.parameters ??= [];
        operation.parameters.push({
          name: "X-CSRF-Token",
          in: "header",
          required: true,
          schema: { type: "string" },
        });
      }
      if (
        [
          "OrderController_create",
          "OrderController_retry",
          "OrderController_refund",
        ].includes(id)
      ) {
        operation.parameters ??= [];
        operation.parameters.push({
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: {
            type: "string",
            minLength: 8,
            maxLength: 128,
            pattern: "^[A-Za-z0-9_.:-]+$",
          },
        });
      }
    }
  return document;
}
