import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const doc = JSON.parse(readFileSync("packages/contracts/openapi.json", "utf8"));
const schemas = doc.components.schemas;
// Generated methods deliberately use operationId rather than duplicating endpoint paths.
const methods = [
  [
    "privacyChallenge",
    "PrivacyController_challenge",
    "OtpChallengeResponse",
    "EmptyRequest",
  ],
  [
    "privacyConfirm",
    "PrivacyController_confirm",
    "OkResponse",
    "OtpVerifyRequest",
  ],
  [
    "privacyExport",
    "PrivacyController_export",
    "PrivacyExportPage",
    null,
    "privacy",
  ],
  ["bootstrap", "PublicController_bootstrap", "BootstrapResponse"],
  ["branches", "PublicController_branches", "BranchesResponse"],
  ["catalog", "PublicController_catalog", "CatalogPage", null, "catalog"],
  [
    "requestOtp",
    "AuthController_requestOtp",
    "OtpChallengeResponse",
    "OtpRequest",
  ],
  [
    "verifyOtp",
    "AuthController_verifyOtp",
    "TokensResponse",
    "OtpVerifyRequest",
  ],
  ["refresh", "AuthController_refresh", "TokensResponse", "RefreshRequest"],
  ["me", "AuthController_me", "CustomerProfile"],
  [
    "updateProfile",
    "ProfileController_update",
    "CustomerProfile",
    "ProfileRequest",
  ],
  ["logout", "AuthController_logout", "OkResponse", "EmptyRequest"],
  ["logoutAll", "AuthController_logoutAll", "OkResponse", "EmptyRequest"],
  ["addresses", "ProfileController_addresses", "AddressesResponse"],
  [
    "createAddress",
    "ProfileController_create",
    "SavedAddress",
    "AddressRequest",
  ],
  [
    "updateAddress",
    "ProfileController_address",
    "SavedAddress",
    "AddressUpdateRequest",
    "id",
  ],
  [
    "deleteAddress",
    "ProfileController_remove",
    "OkResponse",
    "VersionRequest",
    "id",
  ],
  [
    "deletionChallenge",
    "AuthController_deletionChallenge",
    "OtpChallengeResponse",
    "EmptyRequest",
  ],
  ["deleteAccount", "AuthController_delete", "OkResponse", "OtpVerifyRequest"],
  ["quote", "QuoteController_quote", "QuoteResponse", "QuoteRequest"],
  [
    "createOrder",
    "OrderController_create",
    "CustomerOrder",
    "CreateOrderRequest",
    "key",
  ],
  ["orders", "OrderController_mine", "OrdersPage", null, "page"],
  ["pendingOrder", "OrderController_lookup", "CustomerOrder", null, "lookup"],
  ["order", "OrderController_get", "CustomerOrder", null, "id"],
  [
    "cancelOrder",
    "OrderController_cancel",
    "CustomerOrder",
    "ReasonRequest",
    "id",
  ],
  [
    "retryPayment",
    "OrderController_retry",
    "CustomerOrder",
    "EmptyRequest",
    "id-key",
  ],
  [
    "simulatePayment",
    "OrderController_result",
    "CustomerOrder",
    "MockResultRequest",
    "id",
  ],
  ["notifications", "NotificationController_mine", "NotificationsResponse"],
];
const needed = new Set();
function collect(name) {
  if (needed.has(name)) return;
  if (!schemas[name]) throw Error("Missing schema " + name);
  needed.add(name);
  walk(schemas[name]);
}
function walk(value) {
  if (Array.isArray(value)) for (const child of value) walk(child);
  else if (value && typeof value === "object") {
    if (value.$ref) collect(value.$ref.split("/").at(-1));
    for (const child of Object.values(value)) walk(child);
  }
}
for (const [, operation, response, body] of methods) {
  collect(response);
  if (body) collect(body);
  if (
    !Object.values(doc.paths).some((item) =>
      Object.values(item).some((op) => op.operationId === operation),
    )
  )
    throw Error("Missing operation " + operation);
}
const reserved = new Set([
  "class",
  "enum",
  "switch",
  "default",
  "in",
  "is",
  "as",
  "final",
  "const",
  "return",
  "null",
  "if",
  "else",
  "this",
  "new",
  "true",
  "false",
  "super",
  "void",
  "var",
  "await",
  "async",
  "yield",
]);
const fieldName = (name) => (reserved.has(name) ? name + "Value" : name);
function resolved(schema) {
  if (schema.$ref) return resolved(schemas[schema.$ref.split("/").at(-1)]);
  return schema;
}
function normalized(schema) {
  if (!schema.type && schema.enum?.length) {
    const kind = typeof schema.enum[0];
    return {
      ...schema,
      type:
        kind === "number"
          ? Number.isInteger(schema.enum[0])
            ? "integer"
            : "number"
          : kind,
    };
  }
  return schema;
}
function dartType(schema) {
  schema = normalized(schema);
  if (schema.$ref) {
    const name = schema.$ref.split("/").at(-1);
    return resolved(schema).type === "object"
      ? name
      : dartType(resolved(schema));
  }
  if (schema.type === "array") return `List<${dartType(schema.items ?? {})}>`;
  if (schema.type === "integer") return "int";
  if (schema.type === "number") return "double";
  if (schema.type === "boolean") return "bool";
  if (schema.type === "string")
    return schema.format === "date-time" ? "DateTime" : "String";
  return "Map<String, dynamic>";
}
function decode(schema, expr) {
  schema = normalized(schema);
  if (schema.$ref) {
    const name = schema.$ref.split("/").at(-1);
    return resolved(schema).type === "object"
      ? `${name}.fromJson(_object(${expr}))`
      : decode(resolved(schema), expr);
  }
  if (schema.type === "array")
    return `(${expr} as List).map((item) => ${decode(schema.items ?? {}, "item")}).toList()`;
  if (schema.type === "number") return `(${expr} as num).toDouble()`;
  if (schema.type === "string" && schema.format === "date-time")
    return `DateTime.parse(${expr} as String)`;
  if (["integer", "boolean", "string"].includes(schema.type))
    return `${expr} as ${dartType(schema)}`;
  return `_object(${expr})`;
}
function encode(schema, expr) {
  schema = normalized(schema);
  if (schema.$ref)
    return resolved(schema).type === "object"
      ? `${expr}.toJson()`
      : encode(resolved(schema), expr);
  if (schema.type === "array")
    return `${expr}.map((item) => ${encode(schema.items ?? {}, "item")}).toList()`;
  if (schema.type === "string" && schema.format === "date-time")
    return `${expr}.toUtc().toIso8601String()`;
  return expr;
}
let output =
  "// GENERATED from packages/contracts/openapi.json by tools/dart-client.mjs.\n// Do not edit; regenerate after changing API contracts.\nimport 'package:dio/dio.dart';\nMap<String, dynamic> _object(dynamic value) => Map<String, dynamic>.from(value as Map);\n\n";
for (const name of [...needed].sort()) {
  const schema = schemas[name],
    props = schema.properties ?? {},
    required = new Set(schema.required ?? []);
  output += `class ${name} {\n`;
  for (const [key, value] of Object.entries(props)) {
    const optional = !required.has(key) || resolved(value).nullable === true;
    output += `  final ${dartType(value)}${optional ? "?" : ""} ${fieldName(key)};\n`;
  }
  output += `  const ${name}(${
    Object.keys(props).length
      ? "{" +
        Object.keys(props)
          .map(
            (key) =>
              (required.has(key) ? "required " : "") + "this." + fieldName(key),
          )
          .join(", ") +
        "}"
      : ""
  });\n`;
  output += `  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(`;
  for (const [key, value] of Object.entries(props)) {
    const expr = `json['${key}']`,
      optional = !required.has(key) || resolved(value).nullable === true;
    output += `${fieldName(key)}: ${optional ? `${expr} == null ? null : ` : ""}${decode(value, expr)}, `;
  }
  output += `);\n  Map<String, dynamic> toJson() => {`;
  for (const [key, value] of Object.entries(props)) {
    const optional = !required.has(key) || resolved(value).nullable === true,
      expr = fieldName(key) + (optional ? "!" : "");
    output += `${!required.has(key) ? `if (${fieldName(key)} != null) ` : ""}'${key}': ${optional && required.has(key) ? `${fieldName(key)} == null ? null : ` : ""}${encode(value, expr)}, `;
  }
  output += "};\n}\n\n";
}
output +=
  "class FoodDeliveryApi {\n  final Dio dio;\n  const FoodDeliveryApi(this.dio);\n";
for (const [name, operation, response, body, special] of methods) {
  let path, verb;
  for (const [p, item] of Object.entries(doc.paths))
    for (const [m, op] of Object.entries(item))
      if (op.operationId === operation) {
        path = p.replace(/^\/v1/, "");
        verb = m.toUpperCase();
      }
  const args = [];
  if (special === "lookup") args.push("String lookupKey");
  if (special?.includes("id")) args.push("String id");
  if (body) args.push(`${body} input`);
  if (special === "catalog")
    args.push(
      "{required String branchId, String locale = 'ru', int limit = 100, String? cursor, String? search}",
    );
  else if (special === "privacy")
    args.push("{String section = 'profile', String? cursor}");
  else if (special === "page") args.push("{int limit = 20, String? cursor}");
  else if (special?.includes("key"))
    args.push("{required String idempotencyKey}");
  const query =
    special === "catalog"
      ? ", queryParameters: {'branchId': branchId, 'locale': locale, 'limit': limit, if (cursor != null) 'cursor': cursor, if (search != null) 'search': search}"
      : special === "privacy"
        ? ", queryParameters: {'section': section, if (cursor != null) 'cursor': cursor}"
        : special === "page"
          ? ", queryParameters: {'limit': limit, if (cursor != null) 'cursor': cursor}"
          : "";
  const url = path
    .replaceAll("{key}", "${Uri.encodeComponent(lookupKey)}")
    .replaceAll("{id}", "${Uri.encodeComponent(id)}");
  output += `  Future<${response}> ${name}(${args.join(", ")}) async {\n    final response = await dio.request('${url}'${body ? ", data: input.toJson()" : ""}${query}, options: Options(method: '${verb}'${special?.includes("key") ? ", headers: {'Idempotency-Key': idempotencyKey}" : ""}));\n    return ${response}.fromJson(_object(response.data));\n  }\n`;
}
output += "}\n";
mkdirSync("packages/contracts/dart/lib", { recursive: true });
writeFileSync("packages/contracts/dart/lib/food_delivery_api.dart", output);
writeFileSync(
  "packages/contracts/dart/pubspec.yaml",
  "name: food_delivery_api\ndescription: Generated typed client for the Food Delivery API.\npublish_to: none\nversion: 0.2.0\nenvironment:\n  sdk: '>=3.12.0 <4.0.0'\ndependencies:\n  dio: 5.11.1\n",
);
console.log(
  "Generated Dart/Dio client: " +
    needed.size +
    " models, " +
    methods.length +
    " operations",
);
