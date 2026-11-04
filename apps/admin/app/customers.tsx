"use client";
import { useEffect, useState, type FormEvent } from "react";
import { statuses } from "./operations";
import { api } from "./client-api";
type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  locale: string;
  restriction: { blocked: boolean; reason: string; version: number } | null;
  recentOrders: Array<{
    id: string;
    status: string;
    totalMinor: number;
    createdAt: string;
  }>;
};
export default function Customers({
  branchId,
  csrf,
}: {
  branchId: string;
  csrf: string;
}) {
  const [items, setItems] = useState<Customer[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load(next?: string) {
    if (!branchId) return;
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({ branchId });
      if (search.trim()) query.set("search", search.trim());
      if (next) query.set("cursor", next);
      const result = await api("admin/customers?" + query);
      setItems((old) => (next ? [...old, ...result.items] : result.items));
      setCursor(result.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    if (!branchId) return;
    api("admin/customers?branchId=" + branchId)
      .then((result) => {
        if (active) {
          setItems(result.items);
          setCursor(result.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [branchId]);
  async function change(event: FormEvent<HTMLFormElement>, customer: Customer) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const restriction = await api(
        "admin/customers/" + customer.id + "/restriction",
        "POST",
        {
          branchId,
          blocked: !customer.restriction?.blocked,
          reason: String(form.get("reason")).trim(),
          expectedVersion: customer.restriction?.version ?? 0,
        },
        csrf,
      );
      setItems((old) =>
        old.map((c) => (c.id === customer.id ? { ...c, restriction } : c)),
      );
      setNotice(
        "Изменение сохранено в аудите. Статусы существующих заказов доступны клиенту.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="catalog">
      <h2>Клиенты филиала</h2>
      <p>
        Только клиенты с расчётами или заказами этого филиала. Причина
        обязательна; не включайте в неё лишние персональные данные. Ограничение
        действует на новые заказы этого филиала.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Поиск по имени или телефону
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            minLength={2}
            maxLength={80}
          />
        </label>
        <button disabled={busy || !branchId}>Найти</button>
      </form>
      {items.length === 0 && <p>Подходящих клиентов пока нет.</p>}
      {items.map((customer) => (
        <article key={customer.id}>
          <h3>{customer.name || "Без имени"}</h3>
          <p>
            {customer.phone} · {customer.locale.toUpperCase()}
          </p>
          <p>
            {customer.restriction?.blocked
              ? "Новые заказы приостановлены"
              : "Новые заказы разрешены"}
          </p>
          {customer.restriction && (
            <p>Причина последнего изменения: {customer.restriction.reason}</p>
          )}
          <details>
            <summary>Последние заказы этого филиала</summary>
            <ul>
              {customer.recentOrders.map((order) => (
                <li key={order.id}>
                  {order.id.slice(-8).toUpperCase()} ·{" "}
                  {statuses[order.status] ?? "Статус уточняется"} ·{" "}
                  {new Intl.NumberFormat("ru-KZ", {
                    style: "currency",
                    currency: "KZT",
                  }).format(order.totalMinor / 100)}
                </li>
              ))}
            </ul>
          </details>
          <form onSubmit={(event) => change(event, customer)}>
            <label>
              Причина ограничения или снятия
              <input name="reason" required minLength={5} maxLength={300} />
            </label>
            <button disabled={busy}>
              {customer.restriction?.blocked
                ? "Снять ограничение"
                : "Приостановить новые заказы"}
            </button>
          </form>
        </article>
      ))}
      {cursor && (
        <button disabled={busy} onClick={() => load(cursor)}>
          Загрузить ещё
        </button>
      )}
    </section>
  );
}
