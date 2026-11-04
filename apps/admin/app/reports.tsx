"use client";
import { useState, type FormEvent } from "react";
import { api } from "./client-api";
type Report = {
  asOf: string;
  timeZone: string;
  chargedMinor: number;
  refundedMinor: number;
  cashReceivedMinor: number;
  netReceivedMinor: number;
  manualReviewCount: number;
  statuses: Array<{ status: string; count: number; totalMinor: number }>;
  days: Array<{ day: string; count: number; totalMinor: number }>;
};
const money = (minor: number) =>
  new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT" }).format(
    minor / 100,
  );
export default function Reports({ branchId }: { branchId: string }) {
  const [report, setReport] = useState<Report | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({
        branchId,
        from: String(f.get("from")) + "T00:00:00.000Z",
        to: String(f.get("to")) + "T00:00:00.000Z",
      }).toString();
      setReport(await api("admin/reports?" + query));
      setQuery(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="catalog">
      <h2>Отчёт по заказам</h2>
      <p>
        Текущее состояние заказов, созданных в выбранном интервале UTC. Возвраты
        и статусы отражают состояние на момент построения. Это управленческий
        снимок, суммы в KZT.
      </p>
      <form onSubmit={load}>
        <fieldset disabled={busy}>
          <label>
            Начало UTC, включительно
            <input
              type="date"
              name="from"
              required
              defaultValue={new Date(Date.now() - 7 * 86400000)
                .toISOString()
                .slice(0, 10)}
            />
          </label>
          <label>
            Конец UTC, не включается
            <input
              type="date"
              name="to"
              required
              defaultValue={new Date(Date.now() + 86400000)
                .toISOString()
                .slice(0, 10)}
            />
          </label>
          <button>Построить отчёт</button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p>
            Построен:{" "}
            {new Date(report.asOf).toLocaleString("ru-KZ", {
              timeZone: report.timeZone,
            })}{" "}
            · {report.timeZone}
          </p>
          <dl>
            <dt>Подтверждённые списания mock</dt>
            <dd>{money(report.chargedMinor)}</dd>
            <dt>Подтверждённые возвраты mock</dt>
            <dd>{money(report.refundedMinor)}</dd>
            <dt>Получено наличными</dt>
            <dd>{money(report.cashReceivedMinor)}</dd>
            <dt>Получено за вычетом возвратов</dt>
            <dd>{money(report.netReceivedMinor)}</dd>
            <dt>Требуют проверки оплаты</dt>
            <dd>{report.manualReviewCount}</dd>
          </dl>
          <h3>Состояния</h3>
          <ul>
            {report.statuses.map((s) => (
              <li key={s.status}>
                {s.status}: {s.count} · {money(s.totalMinor)}
              </li>
            ))}
          </ul>
          <h3>Создание заказов по дням филиала</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Заказов</th>
                  <th>Сумма созданных заказов</th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{d.count}</td>
                    <td>{money(d.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a
            href={"/api/admin/reports/export?" + query}
            download="orders-cohort.csv"
          >
            Скачать агрегаты CSV (суммы в тиынах)
          </a>
        </>
      )}
    </section>
  );
}
