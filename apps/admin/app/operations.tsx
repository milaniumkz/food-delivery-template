"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./client-api";
import type { Staff } from "./admin";
type Order = {
  id: string;
  branchId: string;
  version: number;
  status: string;
  fulfilment: string;
  paymentStatus?: string;
  paymentMethod?: string;
  totalMinor?: number;
  preparationMinutes: number | null;
  createdAt: string;
  comment: string;
  courierId?: string | null;
  courierAccepted?: boolean;
  address?: { text: string; latitude: number; longitude: number } | null;
  contact?: { name: string | null; phone: string | null };
  items: Array<{
    options?: Array<{ nameRu: string; nameKk: string }>;
    id: string;
    nameRu: string;
    quantity: number;
    lineTotalMinor?: number;
  }>;
  payments?: Array<{ id: string; provider: string; status: string }>;
};
export const statuses: Record<string, string> = {
  awaiting_payment: "Ожидает оплаты",
  placed: "Новый заказ",
  accepted: "Принят",
  preparing: "Готовится",
  ready: "Готов к выдаче",
  out_for_delivery: "У курьера",
  delivered: "Доставлен",
  completed: "Выдан",
  rejected: "Отклонён",
  cancelled: "Отменён",
  expired: "Истёк срок оплаты",
};
const payments: Record<string, string> = {
  not_required: "Оплата не требуется",
  pending: "Проверяем тестовую оплату",
  paid: "Оплата подтверждена",
  unpaid: "Оплата при получении",
  failed: "Оплата не завершена",
  expired: "Истёк срок оплаты",
  refund_pending: "Возврат в обработке",
  refunded: "Возврат подтверждён",
  manual_review: "Нужна проверка оплаты",
};
const commands: Record<string, string> = {
  accept: "Принять заказ",
  prepare: "Начать приготовление",
  ready: "Заказ готов",
  reject: "Отклонить заказ",
  cancel: "Отменить заказ",
  "complete-pickup": "Подтвердить выдачу",
  "assign-courier": "Назначить курьера",
  "courier-accept": "Принять доставку",
  "courier-collect": "Забрать заказ",
  "courier-deliver": "Заказ доставлен",
  refund: "Полный тестовый возврат",
};
export default function Operations({
  branchId,
  csrf,
  user,
  mode,
  timeZone,
}: {
  branchId: string;
  csrf: string;
  user: Staff;
  mode: "orders" | "courier";
  timeZone: string;
}) {
  const [orders, setOrders] = useState<Order[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [next, setNext] = useState<string | null>(null),
    [synced, setSynced] = useState<Date | null>(null),
    [selection, setSelection] = useState<{
      order: Order;
      command: string;
      key: string;
    } | null>(null),
    [couriers, setCouriers] = useState<Array<{ id: string; email: string }>>(
      [],
    );
  const path =
    mode === "courier"
      ? "courier/assignments"
      : "admin/orders?branchId=" +
        branchId +
        (status ? "&status=" + status : "");
  const listPath =
    path +
    (path.includes("?") ? "&" : "?") +
    "limit=20" +
    (cursor ? "&cursor=" + cursor : "");
  const roles = user.roles
      .filter((r) => r.role === "owner" || r.branchId === branchId)
      .map((r) => r.role),
    has = (...required: string[]) =>
      roles.includes("owner") || required.some((r) => roles.includes(r));
  useEffect(() => {
    if (mode === "orders" && !branchId) return;
    let active = true;
    setLoading(true);
    const load = () =>
      api(listPath)
        .then((result) => {
          if (active) {
            setOrders(result.items);
            setNext(result.nextCursor);
            setSynced(new Date());
            setError("");
          }
        })
        .catch((e) => {
          if (active)
            setError(e.message + " Показаны последние загруженные данные.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    void load();
    const timer = cursor ? undefined : setInterval(load, 5000);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [listPath, branchId, mode, cursor]);
  useEffect(() => {
    setCursor(null);
    setSelection(null);
  }, [branchId, mode, status]);
  async function refresh() {
    const result = await api(listPath);
    setOrders(result.items);
    setNext(result.nextCursor);
    setSynced(new Date());
  }
  async function choose(order: Order, command: string) {
    setError("");
    setSelection({ order, command, key: crypto.randomUUID() });
    if (command === "assign-courier") {
      try {
        const result = await api("admin/couriers?branchId=" + branchId);
        setCouriers(result.items);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    const form = new FormData(event.currentTarget),
      { order, command } = selection;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { expectedVersion: order.version };
      if (command === "accept")
        body.preparationMinutes = Number(form.get("preparationMinutes"));
      if (command === "reject" || command === "cancel")
        body.reason = form.get("reason");
      if (command === "complete-pickup")
        body.pickupCode = form.get("pickupCode");
      if (command === "assign-courier") body.courierId = form.get("courierId");
      if (
        order.paymentMethod === "cash" &&
        order.paymentStatus === "unpaid" &&
        ["complete-pickup", "courier-deliver"].includes(command)
      )
        body.cashReceived = form.get("cashReceived") === "on";
      if (command === "refund") {
        const payment = order.payments?.find(
          (p) => p.provider === "mock" && p.status === "paid",
        );
        if (!payment) throw Error("Нет подтверждённой тестовой оплаты.");
        await api(
          "admin/payments/" + payment.id + "/refunds",
          "POST",
          { reason: form.get("reason"), code: form.get("code") },
          csrf,
          selection.key,
        );
      } else if (command.startsWith("courier-"))
        await api(
          "courier/assignments/" +
            order.id +
            "/" +
            command.slice("courier-".length),
          "POST",
          body,
          csrf,
        );
      else
        await api(
          "admin/orders/" + order.id + "/" + command,
          "POST",
          body,
          csrf,
        );
      setSelection(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function actions(order: Order) {
    const allowed: string[] = [];
    if (mode === "courier") {
      if (
        ["accepted", "preparing", "ready"].includes(order.status) &&
        !order.courierAccepted
      )
        allowed.push("courier-accept");
      if (order.status === "ready" && order.courierAccepted)
        allowed.push("courier-collect");
      if (order.status === "out_for_delivery") allowed.push("courier-deliver");
      return allowed;
    }
    if (order.status === "placed" && has("manager", "operator"))
      allowed.push("accept", "reject");
    if (order.status === "accepted" && has("manager", "kitchen"))
      allowed.push("prepare");
    if (order.status === "preparing" && has("manager", "kitchen"))
      allowed.push("ready");
    if (
      order.status === "ready" &&
      order.fulfilment === "pickup" &&
      has("manager", "operator")
    )
      allowed.push("complete-pickup");
    if (
      order.fulfilment === "delivery" &&
      ["accepted", "preparing", "ready"].includes(order.status) &&
      has("manager", "dispatcher")
    )
      allowed.push("assign-courier");
    if (
      ["awaiting_payment", "placed", "accepted"].includes(order.status) &&
      has("manager")
    )
      allowed.push("cancel");
    if (
      order.paymentStatus === "paid" &&
      order.payments?.some(
        (p) => p.provider === "mock" && p.status === "paid",
      ) &&
      (roles.includes("owner") ||
        user.roles.some(
          (r) =>
            r.role === "manager" && r.branchId === branchId && r.refundAllowed,
        ))
    )
      allowed.push("refund");
    return allowed;
  }
  const money = (value: number) =>
      new Intl.NumberFormat("ru-KZ", {
        style: "currency",
        currency: "KZT",
      }).format(value / 100),
    date = (value: string | Date) =>
      new Intl.DateTimeFormat("ru-KZ", {
        timeZone,
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value));
  return (
    <section className="catalog">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ОПЕРАЦИИ</p>
          <h2>{mode === "courier" ? "Мои доставки" : "Заказы ресторана"}</h2>
        </div>
        <button
          disabled={busy}
          onClick={() => refresh().catch((e) => setError(e.message))}
        >
          Обновить
        </button>
      </div>
      {mode === "orders" && (
        <label>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Все статусы</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p role="status" className="small">
        {cursor
          ? "Просмотр истории. Автообновление приостановлено."
          : synced
            ? "Обновлено: " + date(synced) + " · обновляем каждые 5 секунд"
            : "Синхронизируем заказы…"}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p>Загружаем заказы…</p>
      ) : orders.length === 0 ? (
        <p>
          {mode === "courier"
            ? "Назначенных доставок пока нет."
            : "Заказов с выбранным статусом пока нет."}
        </p>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="section-heading">
                <div>
                  <h3>Заказ {order.id.slice(-8).toUpperCase()}</h3>
                  <p className="small">
                    {date(order.createdAt)} ·{" "}
                    {order.fulfilment === "pickup" ? "Самовывоз" : "Доставка"}
                  </p>
                </div>
                <span className="badge">{statuses[order.status]}</span>
              </div>
              {order.paymentStatus && (
                <p>
                  {payments[order.paymentStatus]}
                  {order.totalMinor !== undefined
                    ? " · " + money(order.totalMinor)
                    : ""}
                </p>
              )}
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.nameRu} × {item.quantity}{" "}
                    {item.options
                      ?.map((o: { nameRu: string }) => o.nameRu)
                      .join(", ")}
                    {item.lineTotalMinor !== undefined
                      ? " · " + money(item.lineTotalMinor)
                      : ""}
                  </li>
                ))}
              </ul>
              {order.comment && <p>Комментарий: {order.comment}</p>}
              {order.address && <p>Адрес: {order.address.text}</p>}
              {order.contact?.phone && (
                <p>
                  Контакт:{" "}
                  <a href={"tel:" + order.contact.phone}>
                    {order.contact.phone}
                  </a>
                </p>
              )}
              {mode === "courier" && order.address && (
                <p>
                  <a
                    href={`geo:${order.address.latitude},${order.address.longitude}?q=${order.address.latitude},${order.address.longitude}`}
                  >
                    Открыть маршрут
                  </a>
                </p>
              )}
              <div className="actions">
                {actions(order).map((command) => (
                  <button
                    className={
                      [
                        "accept",
                        "ready",
                        "courier-collect",
                        "complete-pickup",
                        "courier-deliver",
                      ].includes(command)
                        ? "primary"
                        : ""
                    }
                    key={command}
                    disabled={busy}
                    onClick={() => choose(order, command)}
                  >
                    {commands[command]}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {selection && (
        <section className="editor" aria-label="Действие с заказом">
          <h3>
            {commands[selection.command]} ·{" "}
            {selection.order.id.slice(-8).toUpperCase()}
          </h3>
          <form onSubmit={submit}>
            {selection.command === "accept" && (
              <label>
                Время приготовления, минут
                <input
                  name="preparationMinutes"
                  type="number"
                  min={1}
                  max={180}
                  required
                  defaultValue={selection.order.preparationMinutes ?? 30}
                />
              </label>
            )}
            {["reject", "cancel", "refund"].includes(selection.command) && (
              <label>
                Причина
                <textarea
                  name="reason"
                  minLength={3}
                  maxLength={500}
                  required
                />
              </label>
            )}
            {selection.command === "refund" && (
              <label>
                Новый код аутентификатора
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
                <span className="small">
                  Один код используется один раз. Возврат выполняется тестовым
                  провайдером.
                </span>
              </label>
            )}
            {selection.command === "complete-pickup" && (
              <label>
                Код получения из приложения клиента
                <input
                  name="pickupCode"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </label>
            )}
            {selection.command === "assign-courier" && (
              <label>
                Курьер
                <select name="courierId" required defaultValue="">
                  <option value="" disabled>
                    Выберите курьера
                  </option>
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.email}
                    </option>
                  ))}
                </select>
                {couriers.length === 0 && (
                  <span>В филиале пока нет активных курьеров.</span>
                )}
              </label>
            )}
            {selection.order.paymentMethod === "cash" &&
              selection.order.paymentStatus === "unpaid" &&
              ["complete-pickup", "courier-deliver"].includes(
                selection.command,
              ) && (
                <label className="check">
                  <input name="cashReceived" type="checkbox" required />
                  Подтверждаю получение {money(
                    selection.order.totalMinor ?? 0,
                  )}{" "}
                  при передаче заказа.
                </label>
              )}
            <div className="actions">
              <button className="primary" disabled={busy}>
                {busy ? "Выполняем…" : commands[selection.command]}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelection(null)}
              >
                Оставить без изменений
              </button>
            </div>
          </form>
        </section>
      )}
      <div className="actions">
        {cursor && (
          <button onClick={() => setCursor(null)}>К новым заказам</button>
        )}
        {next && (
          <button onClick={() => setCursor(next)}>Следующая страница</button>
        )}
      </div>
    </section>
  );
}
