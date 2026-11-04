"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./client-api";
import ScheduleEditor from "./schedule";
import type { Staff } from "./admin";
type Branch = {
  latitude: number | null;
  longitude: number | null;
  addressRu: string;
  addressKk: string;
  id: string;
  nameRu: string;
  nameKk: string;
  version: number;
  acceptingOrders: boolean;
  allowCash: boolean;
  timeZone: string;
  preparationMinutes: number;
  maxActiveOrders: number;
  minimumPickupMinor: number;
  schedule: Array<{ day: number; startMinute: number; endMinute: number }>;
  holidays:
    | Array<{
        date: string;
        windows: Array<{ startMinute: number; endMinute: number }>;
      }>
    | Record<string, Array<{ startMinute: number; endMinute: number }>>;
};
type Zone = {
  id: string;
  version: number;
  name: string;
  branchId: string;
  polygon: Array<{ latitude: number; longitude: number }>;
  priority: number;
  feeMinor: number;
  minimumMinor: number;
  freeThresholdMinor: number | null;
  active: boolean;
};
type Promo = {
  id: string;
  version: number;
  branchId: string;
  code: string;
  basisPoints: number | null;
  fixedMinor: number | null;
  maxDiscountMinor: number | null;
  minimumMinor: number;
  totalLimit: number | null;
  customerLimit: number | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
};
const minor = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw Error("Сумма: число тенге, до двух знаков после точки.");
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw Error("Недопустимая сумма");
  return result;
};
export default function Settings({
  branchId,
  csrf,
  user,
  onChanged,
}: {
  branchId: string;
  csrf: string;
  user: Staff;
  onChanged: () => Promise<void>;
}) {
  const [branch, setBranch] = useState<Branch | null>(null),
    [zones, setZones] = useState<Zone[]>([]),
    [promos, setPromos] = useState<Promo[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [zone, setZone] = useState<Zone | null>(null),
    [promo, setPromo] = useState<Promo | null>(null);
  async function reload() {
    const [b, z, p] = await Promise.all([
      api("admin/branches"),
      api("admin/zones?branchId=" + branchId),
      api("admin/promotions?branchId=" + branchId),
    ]);
    setBranch(b.items.find((item: Branch) => item.id === branchId) ?? null);
    setZones(z.items);
    setPromos(p.items);
  }
  useEffect(() => {
    let active = true;
    setBranch(null);
    Promise.all([
      api("admin/branches"),
      api("admin/zones?branchId=" + branchId),
      api("admin/promotions?branchId=" + branchId),
    ])
      .then(([b, z, p]) => {
        if (active) {
          setBranch(
            b.items.find((item: Branch) => item.id === branchId) ?? null,
          );
          setZones(z.items);
          setPromos(p.items);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [branchId]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await reload();
      await onChanged();
      setNotice("Сохранено.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await action(async () => {
      await api(
        "admin/branches/" + branchId,
        "PATCH",
        {
          expectedVersion: branch!.version,
          nameRu: f.get("nameRu"),
          nameKk: f.get("nameKk"),
          timeZone: f.get("timeZone"),
          latitude: String(f.get("latitude")).trim()
            ? Number(f.get("latitude"))
            : null,
          longitude: String(f.get("longitude")).trim()
            ? Number(f.get("longitude"))
            : null,
          addressRu: f.get("addressRu"),
          addressKk: f.get("addressKk"),
          acceptingOrders: f.get("accepting") === "on",
          ...(user.roles.some((r) => r.role === "owner")
            ? { allowCash: f.get("cash") === "on" }
            : {}),
          preparationMinutes: Number(f.get("preparation")),
          maxActiveOrders: Number(f.get("capacity")),
          minimumPickupMinor: minor(f.get("minimum")),
          schedule: JSON.parse(String(f.get("schedule"))),
          holidays: JSON.parse(String(f.get("holidays"))),
        },
        csrf,
      );
    });
  }
  async function saveZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await action(async () => {
      await api(
        "admin/zones" + (zone ? "/" + zone.id : ""),
        zone ? "PATCH" : "POST",
        {
          branchId,
          ...(zone ? { expectedVersion: zone.version } : {}),
          name: f.get("name"),
          polygon: JSON.parse(String(f.get("polygon"))),
          priority: Number(f.get("priority")),
          feeMinor: minor(f.get("fee")),
          minimumMinor: minor(f.get("minimum")),
          freeThresholdMinor: String(f.get("free")).trim()
            ? minor(f.get("free"))
            : null,
          active: f.get("active") === "on",
        },
        csrf,
      );
      setZone(null);
    });
  }
  async function savePromo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget),
      percent = String(f.get("percent")).trim();
    await action(async () => {
      await api(
        "admin/promotions" + (promo ? "/" + promo.id : ""),
        promo ? "PATCH" : "POST",
        {
          branchId,
          ...(promo ? { expectedVersion: promo.version } : {}),
          code: String(f.get("code")).trim().toUpperCase(),
          basisPoints: percent ? Math.round(Number(percent) * 100) : null,
          fixedMinor: percent ? null : minor(f.get("fixed")),
          maxDiscountMinor: String(f.get("cap")).trim()
            ? minor(f.get("cap"))
            : null,
          minimumMinor: minor(f.get("minimum")),
          totalLimit: String(f.get("total")).trim()
            ? Number(f.get("total"))
            : null,
          customerLimit: String(f.get("customer")).trim()
            ? Number(f.get("customer"))
            : null,
          startsAt: new Date(String(f.get("start"))).toISOString(),
          endsAt: new Date(String(f.get("end"))).toISOString(),
          active: f.get("active") === "on",
        },
        csrf,
      );
      setPromo(null);
    });
  }
  return (
    <section className="catalog">
      <h2>Настройки филиала</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {branch && (
        <form key={branch.id + ":" + branch.version} onSubmit={saveBranch}>
          <fieldset disabled={busy}>
            <legend>Работа и приём заказов</legend>
            <label>
              Название RU
              <input name="nameRu" required defaultValue={branch.nameRu} />
            </label>
            <label>
              Название KK
              <input name="nameKk" required defaultValue={branch.nameKk} />
            </label>
            <label>
              Адрес RU
              <input
                name="addressRu"
                maxLength={300}
                defaultValue={branch.addressRu}
              />
            </label>
            <label>
              Адрес KK
              <input
                name="addressKk"
                maxLength={300}
                defaultValue={branch.addressKk}
              />
            </label>
            <label>
              Широта филиала
              <input
                name="latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                defaultValue={branch.latitude ?? ""}
              />
            </label>
            <label>
              Долгота филиала
              <input
                name="longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                defaultValue={branch.longitude ?? ""}
              />
            </label>
            <label>
              Часовой пояс IANA
              <input name="timeZone" required defaultValue={branch.timeZone} />
            </label>
            <label>
              <input
                type="checkbox"
                name="accepting"
                defaultChecked={branch.acceptingOrders}
              />{" "}
              Принимать заказы
            </label>
            {user.roles.some((r) => r.role === "owner") && (
              <label>
                <input
                  type="checkbox"
                  name="cash"
                  defaultChecked={branch.allowCash}
                />{" "}
                Разрешить наличные
              </label>
            )}
            <label>
              Приготовление, минуты
              <input
                name="preparation"
                type="number"
                min="1"
                max="180"
                required
                defaultValue={branch.preparationMinutes}
              />
            </label>
            <label>
              Лимит активных заказов
              <input
                name="capacity"
                type="number"
                min="1"
                max="1000"
                required
                defaultValue={branch.maxActiveOrders}
              />
            </label>
            <label>
              Минимум самовывоза, ₸
              <input
                name="minimum"
                inputMode="decimal"
                required
                defaultValue={branch.minimumPickupMinor / 100}
              />
            </label>
            <ScheduleEditor
              schedule={branch.schedule}
              holidays={branch.holidays}
            />
            <button type="submit">Сохранить работу филиала</button>
          </fieldset>
        </form>
      )}
      <h2>Зоны доставки</h2>
      <ul>
        {zones.map((z) => (
          <li key={z.id}>
            <button onClick={() => setZone(z)}>
              {z.name} · {z.active ? "включена" : "выключена"} ·{" "}
              {z.feeMinor / 100} ₸
            </button>
          </li>
        ))}
      </ul>
      <form key={zone?.id ?? "new-zone"} onSubmit={saveZone}>
        <fieldset disabled={busy}>
          <legend>{zone ? "Изменить зону" : "Добавить зону"}</legend>
          <label>
            Название зоны
            <input name="name" required defaultValue={zone?.name} />
          </label>
          <label>
            Граница зоны: список точек latitude / longitude
            <textarea
              name="polygon"
              rows={7}
              required
              defaultValue={JSON.stringify(zone?.polygon ?? [], null, 2)}
            />
          </label>
          <label>
            Приоритет (больше — выше)
            <input
              name="priority"
              type="number"
              defaultValue={zone?.priority ?? 0}
            />
          </label>
          <label>
            Стоимость доставки, ₸
            <input
              name="fee"
              required
              defaultValue={(zone?.feeMinor ?? 0) / 100}
            />
          </label>
          <label>
            Минимум после скидки, ₸
            <input
              name="minimum"
              required
              defaultValue={(zone?.minimumMinor ?? 0) / 100}
            />
          </label>
          <label>
            Бесплатно от, ₸ (необязательно)
            <input
              name="free"
              defaultValue={
                zone?.freeThresholdMinor == null
                  ? ""
                  : zone.freeThresholdMinor / 100
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="active"
              defaultChecked={zone?.active ?? true}
            />{" "}
            Активна
          </label>
          <button type="submit">Сохранить зону</button>
          {zone && (
            <button type="button" onClick={() => setZone(null)}>
              Новая зона
            </button>
          )}
        </fieldset>
      </form>
      <h2>Промокоды</h2>
      <ul>
        {promos.map((p) => (
          <li key={p.id}>
            <button onClick={() => setPromo(p)}>
              {p.code} · {p.active ? "активен" : "выключен"}
            </button>
          </li>
        ))}
      </ul>
      <form key={promo?.id ?? "new-promo"} onSubmit={savePromo}>
        <fieldset disabled={busy}>
          <legend>{promo ? "Изменить промокод" : "Добавить промокод"}</legend>
          <label>
            Код
            <input
              name="code"
              pattern="[A-Za-z0-9_-]{3,32}"
              required
              defaultValue={promo?.code}
            />
          </label>
          <label>
            Скидка, % (либо фиксированная)
            <input
              name="percent"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              defaultValue={
                promo?.basisPoints == null ? "" : promo.basisPoints / 100
              }
            />
          </label>
          <label>
            Фиксированная скидка, ₸
            <input
              name="fixed"
              defaultValue={
                promo?.fixedMinor == null ? "" : promo.fixedMinor / 100
              }
            />
          </label>
          <label>
            Максимальная скидка, ₸
            <input
              name="cap"
              defaultValue={
                promo?.maxDiscountMinor == null
                  ? ""
                  : promo.maxDiscountMinor / 100
              }
            />
          </label>
          <label>
            Минимум после скидки, ₸
            <input
              name="minimum"
              required
              defaultValue={(promo?.minimumMinor ?? 0) / 100}
            />
          </label>
          <label>
            Всего использований
            <input
              name="total"
              type="number"
              min="1"
              defaultValue={promo?.totalLimit ?? ""}
            />
          </label>
          <label>
            Использований на клиента
            <input
              name="customer"
              type="number"
              min="1"
              defaultValue={promo?.customerLimit ?? ""}
            />
          </label>
          <label>
            Начало UTC (ISO 8601)
            <input
              name="start"
              required
              defaultValue={promo?.startsAt ?? new Date().toISOString()}
            />
          </label>
          <label>
            Окончание UTC (ISO 8601)
            <input
              name="end"
              required
              defaultValue={
                promo?.endsAt ??
                new Date(Date.now() + 86400000 * 30).toISOString()
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="active"
              defaultChecked={promo?.active ?? true}
            />{" "}
            Активен
          </label>
          <button type="submit">Сохранить промокод</button>
          {promo && (
            <button type="button" onClick={() => setPromo(null)}>
              Новый промокод
            </button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
