import { HttpException } from "@nestjs/common";
export class BusinessError extends HttpException {
  constructor(
    readonly code: string,
    readonly safeMessage: string,
    status = 422,
    readonly details: unknown = null,
  ) {
    super(safeMessage, status);
  }
}
