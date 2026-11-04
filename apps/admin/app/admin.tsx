"use client";
import Customers from "./customers";
import { api } from "./client-api";
import Operations from "./operations";
import SystemStatus from "./system";
import Reports from "./reports";
import ProductOptions, { type Configuration } from "./product-options";
import Settings from "./settings";
import StaffSettings from "./staff";
import { useEffect, useState, type FormEvent } from "react";
import type { Brand } from "@food/config";
export type Staff = {
  id: string;
  email: string;
  roles: Array<{
    role: string;
    branchId: string | null;
    refundAllowed?: boolean;
  }>;
};
type Branch = {
  id: string;
  nameRu: string;
  nameKk: string;
  acceptingOrders: boolean;
  version: number;
};
type Product = {
  imageId?: string | null;
  configuration?: Configuration;
  categoryId?: string | null;
  stockQuantity?: number | null;
  id: string;
  branchId: string;
  nameRu: string;
  nameKk: string;
  descriptionRu: string;
  descriptionKk: string;
  priceMinor: number;
  active: boolean;
  version: number;
};
function price(value: string) {
  const match = value.trim().match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (!match) throw Error("Укажите цену с точностью до двух знаков.");
  const result =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (result < 1 || result > 100000000)
    throw Error("Цена должна быть от 0,01 до 1 000 000 ₸.");
  return result;
}
export default function Admin({ brand }: { brand: Brand }) {
  const [user, setUser] = useState<Staff | null>(null),
    [csrf, setCsrf] = useState(""),
    [initial, setInitial] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [view, setView] = useState<
    | "menu"
    | "orders"
    | "courier"
    | "settings"
    | "staff"
    | "reports"
    | "system"
    | "customers"
  >("menu");
  const [branches, setBranches] = useState<Branch[]>([]),
    [branchId, setBranchId] = useState(""),
    [products, setProducts] = useState<Product[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [editing, setEditing] = useState<Product | null>(null),
    [showForm, setShowForm] = useState(false),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    api("admin/auth/session")
      .then((result) => {
        if (active) {
          setUser(result.user);
          setCsrf(result.csrfToken);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setInitial(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    if (!user.roles.some((r) => ["owner", "manager"].includes(r.role)))
      setView(
        user.roles.some((r) => r.role !== "courier") ? "orders" : "courier",
      );
    let active = true;
    api("admin/branches")
      .then((result) => {
        if (active) {
          setBranches(result.items);
          setBranchId(result.items[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    if (
      !user ||
      !branchId ||
      !user.roles.some(
        (r) =>
          r.role === "owner" ||
          (r.role === "manager" && r.branchId === branchId),
      )
    )
      return;
    let active = true;
    setLoading(true);
    setProducts([]);
    setEditing(null);
    setShowForm(false);
    api("admin/products?branchId=" + branchId)
      .then((result) => {
        if (active) {
          setProducts(result.items);
          setCursor(result.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, branchId]);
  async function reload() {
    const result = await api("admin/products?branchId=" + branchId);
    setProducts(result.items);
    setCursor(result.nextCursor);
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api("admin/auth/login", "POST", {
        email: form.get("email"),
        password: form.get("password"),
        code: form.get("code"),
      });
      setCsrf(result.csrfToken);
      const current = await api("admin/auth/session");
      setUser(current.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fields = {
        nameRu: form.get("nameRu"),
        nameKk: form.get("nameKk"),
        descriptionRu: form.get("descriptionRu"),
        descriptionKk: form.get("descriptionKk"),
        priceMinor: price(String(form.get("price"))),
      };
      if (editing)
        await api(
          "admin/products/" + editing.id,
          "PATCH",
          { ...fields, expectedVersion: editing.version },
          csrf,
        );
      else await api("admin/products", "POST", { ...fields, branchId }, csrf);
      await reload();
      setEditing(null);
      setShowForm(false);
      setNotice("Изменения сохранены.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function availability(product: Product) {
    setBusy(true);
    setError("");
    try {
      await api(
        "admin/products/" + product.id,
        "PATCH",
        { expectedVersion: product.version, active: !product.active },
        csrf,
      );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("admin/auth/logout", "POST", {}, csrf);
      setUser(null);
      setCsrf("");
      setProducts([]);
      setBranches([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const money = (minor: number) =>
    new Intl.NumberFormat("ru-KZ", {
      style: "currency",
      currency: "KZT",
    }).format(minor / 100);
  if (initial) return <p role="status">Загрузка панели…</p>;
  if (!user)
    return (
      <section className="login">
        <p className="eyebrow">ВХОД ДЛЯ СОТРУДНИКОВ</p>
        <h2>Ваш ресторан — под контролем</h2>
        <p>
          Войдите с личной учётной записью и кодом из
          приложения-аутентификатора.
        </p>
        <form onSubmit={login}>
          <label>
            Электронная почта
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={16}
              maxLength={128}
              required
            />
          </label>
          <label>
            Код подтверждения
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Проверяем…" : "Войти в панель"}
          </button>
        </form>
      </section>
    );
  return (
    <div className="workspace">
      <aside>
        <span className="brand-tag">{brand.displayName}</span>
        <h2>Рабочее место</h2>
        <p className="muted">{user.email}</p>
        <label>
          Филиал
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nameRu}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Разделы панели" className="panel-nav">
          {user.roles.some((r) => r.role === "owner") && (
            <button
              aria-current={view === "system" ? "page" : undefined}
              onClick={() => setView("system")}
            >
              Система
            </button>
          )}
          {user.roles.some(
            (r) =>
              r.role === "owner" ||
              (r.role === "manager" && r.branchId === branchId),
          ) && (
            <button
              aria-current={view === "reports" ? "page" : undefined}
              onClick={() => setView("reports")}
            >
              Отчёты
            </button>
          )}
          {user.roles.some(
            (r) =>
              r.role === "owner" ||
              (r.role === "manager" && r.branchId === branchId),
          ) && (
            <button
              aria-current={view === "customers" ? "page" : undefined}
              onClick={() => setView("customers")}
            >
              Клиенты
            </button>
          )}
          {user.roles.some((r) => r.role === "owner") && (
            <button
              aria-current={view === "staff" ? "page" : undefined}
              onClick={() => setView("staff")}
            >
              Команда
            </button>
          )}
          {user.roles.some((r) => ["owner", "manager"].includes(r.role)) && (
            <button
              aria-current={view === "menu" ? "page" : undefined}
              onClick={() => setView("menu")}
            >
              Меню
            </button>
          )}
          {user.roles.some((r) =>
            ["owner", "manager", "operator", "kitchen", "dispatcher"].includes(
              r.role,
            ),
          ) && (
            <button
              aria-current={view === "orders" ? "page" : undefined}
              onClick={() => setView("orders")}
            >
              Заказы
            </button>
          )}
          {user.roles.some(
            (r) =>
              r.role === "owner" ||
              (r.role === "manager" && r.branchId === branchId),
          ) && (
            <button
              aria-current={view === "settings" ? "page" : undefined}
              onClick={() => setView("settings")}
            >
              Настройки
            </button>
          )}
          {user.roles.some((r) => r.role === "courier") && (
            <button
              aria-current={view === "courier" ? "page" : undefined}
              onClick={() => setView("courier")}
            >
              Мои доставки
            </button>
          )}
        </nav>
        <button onClick={logout} disabled={busy}>
          Выйти
        </button>
        <p className="small">Тестовое окружение. Реальные платежи отключены.</p>
      </aside>
      {view === "menu" ? (
        <section className="catalog">
          <div className="section-heading">
            <div>
              <p className="eyebrow">КАТАЛОГ</p>
              <h2>Меню ресторана</h2>
            </div>
            <button
              className="primary"
              disabled={!branchId || busy}
              onClick={() => {
                setEditing(null);
                setShowForm(true);
                setError("");
              }}
            >
              Добавить блюдо
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {loading ? (
            <p role="status">Загружаем меню…</p>
          ) : products.length === 0 ? (
            <p>В этом филиале пока нет блюд. Добавьте первое.</p>
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <article className="product-card" key={product.id}>
                  {product.imageId && (
                    <img
                      src={"/api/media/" + product.imageId}
                      alt={product.nameRu}
                      width="480"
                      height="240"
                      loading="lazy"
                      style={{
                        objectFit: "cover",
                        width: "100%",
                        borderRadius: 16,
                      }}
                    />
                  )}
                  <div className="product-head">
                    <h3>{product.nameRu}</h3>
                    <span className="badge">
                      {product.active ? "В меню" : "Стоп-лист"}
                    </span>
                  </div>
                  <p className="muted" lang="kk">
                    {product.nameKk}
                  </p>
                  <p>{product.descriptionRu || "Описание не добавлено."}</p>
                  <strong className="price">{money(product.priceMinor)}</strong>
                  <div className="actions">
                    <button
                      disabled={busy}
                      onClick={() => {
                        setEditing(product);
                        setShowForm(true);
                      }}
                    >
                      Изменить
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => availability(product)}
                    >
                      {product.active ? "В стоп-лист" : "Вернуть в меню"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {cursor && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await api(
                    "admin/products?branchId=" + branchId + "&cursor=" + cursor,
                  );
                  setProducts((previous) => [...previous, ...result.items]);
                  setCursor(result.nextCursor);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Загрузить ещё
            </button>
          )}
          {showForm && (
            <div className="editor">
              <h3>{editing ? "Изменить блюдо" : "Новое блюдо"}</h3>
              <form key={editing?.id ?? "new"} onSubmit={save}>
                <div className="form-row">
                  <label>
                    Название на русском
                    <input
                      name="nameRu"
                      required
                      maxLength={120}
                      defaultValue={editing?.nameRu ?? ""}
                    />
                  </label>
                  <label>
                    Название на казахском
                    <input
                      lang="kk"
                      name="nameKk"
                      required
                      maxLength={120}
                      defaultValue={editing?.nameKk ?? ""}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Описание на русском
                    <textarea
                      name="descriptionRu"
                      maxLength={2000}
                      defaultValue={editing?.descriptionRu ?? ""}
                    />
                  </label>
                  <label>
                    Описание на казахском
                    <textarea
                      lang="kk"
                      name="descriptionKk"
                      maxLength={2000}
                      defaultValue={editing?.descriptionKk ?? ""}
                    />
                  </label>
                </div>
                <label>
                  Цена, ₸
                  <input
                    name="price"
                    inputMode="decimal"
                    required
                    defaultValue={
                      editing ? (editing.priceMinor / 100).toFixed(2) : ""
                    }
                  />
                </label>
                <div className="actions">
                  <button className="primary" disabled={busy}>
                    {busy ? "Сохраняем…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setShowForm(false);
                      setEditing(null);
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </form>
              {editing && (
                <ProductOptions
                  key={editing.id + ":" + editing.version}
                  product={editing}
                  csrf={csrf}
                  onSaved={async () => {
                    await reload();
                    const data = await api(
                      "admin/products?branchId=" + branchId,
                    );
                    setEditing(
                      data.items.find(
                        (item: Product) => item.id === editing.id,
                      ) ?? null,
                    );
                  }}
                />
              )}
            </div>
          )}
        </section>
      ) : view === "customers" ? (
        <Customers key={branchId} branchId={branchId} csrf={csrf} />
      ) : view === "system" ? (
        <SystemStatus csrf={csrf} />
      ) : view === "reports" ? (
        <Reports key={branchId} branchId={branchId} />
      ) : view === "staff" ? (
        <StaffSettings csrf={csrf} />
      ) : view === "settings" ? (
        <Settings
          branchId={branchId}
          csrf={csrf}
          user={user}
          onChanged={async () => {
            const data = await api("admin/branches");
            setBranches(data.items);
          }}
        />
      ) : (
        <Operations
          branchId={branchId}
          csrf={csrf}
          user={user}
          mode={view}
          timeZone={brand.timeZone}
        />
      )}
    </div>
  );
}
