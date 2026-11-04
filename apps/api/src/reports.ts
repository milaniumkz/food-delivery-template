import { ApiProperty } from "@nestjs/swagger";
import { Controller, Get, Inject, Query, Req, Res } from "@nestjs/common";
import { IsDateString, IsUUID, Matches } from "class-validator";
import type { Request, Response } from "express";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { BusinessError } from "./business-error.js";
class ReportQuery {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() branchId!: string;
  @ApiProperty({
    type: String,
    format: "date-time",
    pattern: "T.*(?:Z|[+-]\\d{2}:\\d{2})$",
  })
  @IsDateString()
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  from!: string;
  @ApiProperty({
    type: String,
    format: "date-time",
    pattern: "T.*(?:Z|[+-]\\d{2}:\\d{2})$",
  })
  @IsDateString()
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  to!: string;
}
const integer = (value: unknown) => {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result))
    throw new BusinessError("REPORT_LIMIT", "Слишком большой диапазон отчёта.");
  return result;
};
@Controller("admin/reports")
export class ReportsController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async report(request: Request, input: ReportQuery) {
    await this.auth.staff(request, ["manager"], input.branchId);
    const from = new Date(input.from),
      to = new Date(input.to);
    if (to <= from || to.getTime() - from.getTime() > 93 * 86400000)
      throw new BusinessError(
        "REPORT_RANGE",
        "Выберите период до 93 дней: начало включительно, конец не включается.",
      );
    const branch = await this.db.orm.branch.findUniqueOrThrow({
      where: { id: input.branchId },
    });
    // A cohort snapshot: all current financial states of orders CREATED within this UTC interval.
    // This deliberately does not pretend creation time is provider settlement time.
    return this.db.orm.$transaction(
      async (tx) => {
        const where = {
            branchId: input.branchId,
            createdAt: { gte: from, lt: to },
          },
          orderWhere = { order: where };
        const [statuses, charged, refunded, cash, manualReview, daily] =
          await Promise.all([
            tx.order.groupBy({
              by: ["status"],
              where,
              _count: { _all: true },
              _sum: { totalMinor: true },
            }),
            tx.paymentAttempt.aggregate({
              where: { ...orderWhere, status: { in: ["paid", "refunded"] } },
              _sum: { amountMinor: true },
            }),
            tx.refund.aggregate({
              where: { payment: { order: where }, status: "refunded" },
              _sum: { amountMinor: true },
            }),
            tx.order.aggregate({
              where: {
                ...where,
                paymentMethod: "cash",
                paymentStatus: "paid",
                status: { in: ["completed", "delivered"] },
              },
              _sum: { totalMinor: true },
            }),
            tx.order.count({
              where: { ...where, paymentStatus: "manual_review" },
            }),
            tx.$queryRaw<
              Array<{ day: string; count: bigint; totalMinor: bigint }>
            >`SELECT to_char("createdAt" AT TIME ZONE ${branch.timeZone},'YYYY-MM-DD') AS day,COUNT(*) AS count,COALESCE(SUM("totalMinor"),0) AS "totalMinor" FROM "Order" WHERE "branchId"=${input.branchId}::uuid AND "createdAt">=${from} AND "createdAt"<${to} GROUP BY day ORDER BY day`,
          ]);
        const chargedMinor = integer(charged._sum.amountMinor),
          refundedMinor = integer(refunded._sum.amountMinor),
          cashReceivedMinor = integer(cash._sum.totalMinor);
        return {
          kind: "orders_created_cohort_snapshot",
          asOf: new Date().toISOString(),
          branchId: branch.id,
          timeZone: branch.timeZone,
          from: from.toISOString(),
          to: to.toISOString(),
          currency: "KZT",
          statuses: statuses.map((s) => ({
            status: s.status,
            count: s._count._all,
            totalMinor: integer(s._sum.totalMinor),
          })),
          chargedMinor,
          refundedMinor,
          cashReceivedMinor,
          netReceivedMinor: integer(
            chargedMinor - refundedMinor + cashReceivedMinor,
          ),
          manualReviewCount: manualReview,
          days: daily.map((d) => ({
            day: d.day,
            count: integer(d.count),
            totalMinor: integer(d.totalMinor),
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  @Get() get(@Req() request: Request, @Query() input: ReportQuery) {
    return this.report(request, input);
  }
  @Get("export") async export(
    @Req() request: Request,
    @Query() input: ReportQuery,
    @Res() response: Response,
  ) {
    const report = await this.report(request, input);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="orders-cohort.csv"',
    );
    response.send(
      "\uFEFFday,orders,totalMinor,currency\r\n" +
        report.days
          .map((d) => [d.day, d.count, d.totalMinor, "KZT"].join(","))
          .join("\r\n") +
        "\r\n",
    );
  }
}
