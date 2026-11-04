"use client";
import { useEffect, useState } from "react";
import { api } from "./client-api";
type Metrics = {
  asOf: string;
  workers: Array<{ kind: string; lastSeenAt: string | null; healthy: boolean }>;
  outbox: {
    pending: number;
    deadLetters: number;
    oldestAgeSeconds: number | null;
  };
};
type Event = { id: string; type: string; attempts: number; createdAt: string };
export default function SystemStatus({ csrf }: { csrf: string }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true,
      running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const [m, e] = await Promise.all([
          api("admin/system"),
          api("admin/outbox"),
        ]);
        if (active) {
          setMetrics(m);
          setEvents(e.deadLetters);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Ошибка обновления");
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function retry(id: string) {
    setBusy(true);
    setNotice("");
    try {
      await api("admin/outbox/" + id + "/retry", "POST", {}, csrf);
      setEvents(events.filter((e) => e.id !== id));
      setNotice(
        "Повтор уведомления запланирован. Результат появится после обработки.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="catalog">
      <h2>Состояние системы</h2>
      <p>Тестовый адаптер уведомлений. Внешний push не подключён.</p>
      {error && <p role="alert">Данные не обновлены: {error}</p>}
      {notice && <p role="status">{notice}</p>}
      {metrics && (
        <>
          <p>
            Данные сервера на {new Date(metrics.asOf).toLocaleString("ru-KZ")}
          </p>
          <ul>
            {metrics.workers.map((w) => (
              <li key={w.kind}>
                {w.kind === "expiry"
                  ? "Истечение неоплаченных заказов"
                  : "Очередь уведомлений"}
                :{" "}
                {error
                  ? "состояние неизвестно"
                  : w.healthy
                    ? "задача работает"
                    : "нет свежего heartbeat"}
                .{" "}
                {w.lastSeenAt &&
                  "Последний сигнал: " +
                    new Date(w.lastSeenAt).toLocaleString("ru-KZ")}
              </li>
            ))}
          </ul>
          <dl>
            <dt>Ожидают уведомления</dt>
            <dd>{metrics.outbox.pending}</dd>
            <dt>Исчерпаны повторы</dt>
            <dd>{metrics.outbox.deadLetters}</dd>
            <dt>Возраст самого старого события, секунд</dt>
            <dd>{metrics.outbox.oldestAgeSeconds ?? "—"}</dd>
          </dl>
        </>
      )}
      <h3>Уведомления с исчерпанными повторами</h3>
      {events.length === 0 ? (
        <p>Нет событий в этом списке.</p>
      ) : (
        <ul>
          {events.map((e) => (
            <li key={e.id}>
              {e.type} · {e.attempts} попыток{" "}
              <button disabled={busy} onClick={() => retry(e.id)}>
                Повторить уведомление
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
