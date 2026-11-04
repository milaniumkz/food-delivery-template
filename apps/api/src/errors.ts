import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { BusinessError } from "./business-error.js";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const parserType =
      typeof error === "object" && error && "type" in error ? error.type : null;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : parserType === "entity.parse.failed"
          ? 400
          : parserType === "entity.too.large"
            ? 413
            : 500;
    const codes: Record<number, string> = {
      400: "INVALID_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      413: "PAYLOAD_TOO_LARGE",
      422: "VALIDATION_ERROR",
      429: "RATE_LIMITED",
      503: "NOT_READY",
    };
    const requestId =
      typeof res.getHeader("x-request-id") === "string"
        ? res.getHeader("x-request-id")
        : randomUUID();
    const payload = error instanceof HttpException ? error.getResponse() : null;
    const validation =
      typeof payload === "object" && payload && "message" in payload
        ? payload.message
        : null;
    // Never serialize arbitrary exceptions, SQL, input, tokens, addresses or stack traces.
    res.status(status).json({
      code:
        error instanceof BusinessError
          ? error.code
          : (codes[status] ?? "INTERNAL_ERROR"),
      message:
        error instanceof BusinessError
          ? error.safeMessage
          : status >= 500
            ? "Service unavailable"
            : status === 400
              ? "Invalid request"
              : (codes[status] ?? "Request failed"),
      requestId,
      details: error instanceof BusinessError ? error.details : null,
      fieldErrors:
        status === 400 && Array.isArray(validation) ? validation : [],
    });
  }
}
