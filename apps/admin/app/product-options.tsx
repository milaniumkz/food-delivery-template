"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./client-api";
export type Variant = {
  id: string;
  nameRu: string;
  nameKk: string;
  priceMinor: number;
  active: boolean;
};
export type Choice = {
  id: string;
  nameRu: string;
  nameKk: string;
  deltaMinor: number;
  active: boolean;
};
export type Group = {
  id: string;
  nameRu: string;
  nameKk: string;
  minimum: number;
  maximum: number;
  choices: Choice[];
};
export type Configuration = { variants?: Variant[]; groups?: Group[] };
type Category = {
  id: string;
  nameRu: string;
  nameKk: string;
  active: boolean;
  version: number;
  position: number;
};
type Product = {
  imageId?: string | null;
  id: string;
  branchId: string;
  version: number;
  configuration?: Configuration;
  categoryId?: string | null;
  stockQuantity?: number | null;
};
export default function ProductOptions({
  product,
  csrf,
  onSaved,
}: {
  product: Product;
  csrf: string;
  onSaved: () => Promise<void>;
}) {
  const [variants, setVariants] = useState<Variant[]>(
      product.configuration?.variants ?? [],
    ),
    [groups, setGroups] = useState<Group[]>(
      product.configuration?.groups ?? [],
    ),
    [categories, setCategories] = useState<Category[]>([]),
    [category, setCategory] = useState(product.categoryId ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [stock, setStock] = useState(
      product.stockQuantity == null ? "" : String(product.stockQuantity),
    );
  useEffect(() => {
    let active = true;
    api("admin/categories?branchId=" + product.branchId)
      .then((r) => {
        if (active) setCategories(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [product.branchId]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await onSaved();
      setNotice("Сохранено");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  function names(
    value: { nameRu: string; nameKk: string },
    update: (patch: { nameRu?: string; nameKk?: string }) => void,
  ) {
    return (
      <div className="form-row">
        <label>
          Название RU
          <input
            required
            maxLength={80}
            value={value.nameRu}
            onChange={(e) => update({ nameRu: e.target.value })}
          />
        </label>
        <label>
          Название KK
          <input
            required
            maxLength={80}
            value={value.nameKk}
            onChange={(e) => update({ nameKk: e.target.value })}
          />
        </label>
      </div>
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      await api(
        "admin/products/" + product.id + "/configuration",
        "POST",
        {
          expectedVersion: product.version,
          categoryId: category || null,
          configuration: { variants, groups },
        },
        csrf,
      );
    });
  }
  return (
    <div className="editor">
      <h3>Фотография блюда</h3>
      {product.imageId && (
        <img
          src={"/api/media/" + product.imageId}
          alt="Текущая фотография блюда"
          width="240"
          height="160"
          style={{ objectFit: "cover", maxWidth: "100%" }}
        />
      )}
      <label>
        Загрузить JPEG, PNG или WebP (до 5 MiB)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              setError("Файл больше 5 MiB");
              return;
            }
            void action(async () => {
              const response = await fetch(
                "/api/admin/products/" +
                  product.id +
                  "/image?expectedVersion=" +
                  product.version,
                {
                  method: "POST",
                  headers: { "content-type": file.type, "x-csrf-token": csrf },
                  body: file,
                },
              );
              const data = await response.json();
              if (!response.ok)
                throw Error(
                  typeof data.message === "string"
                    ? data.message
                    : "Не удалось загрузить изображение",
                );
            });
          }}
        />
      </label>
      {product.imageId && (
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              await api(
                "admin/products/" +
                  product.id +
                  "/image?expectedVersion=" +
                  product.version,
                "DELETE",
                undefined,
                csrf,
              );
            })
          }
        >
          Убрать фотографию
        </button>
      )}
      <h3>Категория, варианты и добавки</h3>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            Категория
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Без категории</option>
              {categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.nameRu}
                  {c.active ? "" : " (выключена)"}
                </option>
              ))}
            </select>
          </label>
          <p>
            Если заданы варианты, покупатель обязан выбрать один; цена варианта
            заменяет базовую цену блюда.
          </p>
          {variants.map((v, i) => (
            <fieldset key={v.id}>
              <legend>Вариант {i + 1}</legend>
              {names(v, (patch) =>
                setVariants(
                  variants.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                ),
              )}
              <label>
                Цена варианта, ₸
                <input
                  required
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={v.priceMinor / 100}
                  onChange={(e) =>
                    setVariants(
                      variants.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              priceMinor: Math.round(
                                Number(e.target.value) * 100,
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={v.active}
                  onChange={(e) =>
                    setVariants(
                      variants.map((x, j) =>
                        j === i ? { ...x, active: e.target.checked } : x,
                      ),
                    )
                  }
                />{" "}
                Доступен
              </label>
              <button
                type="button"
                onClick={() => setVariants(variants.filter((_, j) => j !== i))}
              >
                Удалить вариант
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={variants.length >= 20}
            onClick={() =>
              setVariants([
                ...variants,
                {
                  id: crypto.randomUUID(),
                  nameRu: "",
                  nameKk: "",
                  priceMinor: 100,
                  active: true,
                },
              ])
            }
          >
            Добавить вариант
          </button>
          {groups.map((g, i) => {
            const patch = (fields: Partial<Group>) =>
              setGroups(
                groups.map((x, j) => (j === i ? { ...x, ...fields } : x)),
              );
            return (
              <fieldset key={g.id}>
                <legend>Группа добавок {i + 1}</legend>
                {names(g, patch)}
                <div className="form-row">
                  <label>
                    Минимум выбора
                    <input
                      type="number"
                      required
                      min="0"
                      max="30"
                      value={g.minimum}
                      onChange={(e) =>
                        patch({ minimum: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Максимум выбора
                    <input
                      type="number"
                      required
                      min="1"
                      max="30"
                      value={g.maximum}
                      onChange={(e) =>
                        patch({ maximum: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                {g.choices.map((c, k) => {
                  const choice = (fields: Partial<Choice>) =>
                    patch({
                      choices: g.choices.map((x, j) =>
                        j === k ? { ...x, ...fields } : x,
                      ),
                    });
                  return (
                    <fieldset key={c.id}>
                      <legend>Добавка {k + 1}</legend>
                      {names(c, choice)}
                      <label>
                        Доплата, ₸
                        <input
                          type="number"
                          required
                          min="0"
                          max="1000000"
                          step="0.01"
                          value={c.deltaMinor / 100}
                          onChange={(e) =>
                            choice({
                              deltaMinor: Math.round(
                                Number(e.target.value) * 100,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={c.active}
                          onChange={(e) => choice({ active: e.target.checked })}
                        />{" "}
                        Доступна
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            choices: g.choices.filter((_, j) => j !== k),
                          })
                        }
                      >
                        Удалить добавку
                      </button>
                    </fieldset>
                  );
                })}
                <button
                  type="button"
                  disabled={g.choices.length >= 30}
                  onClick={() =>
                    patch({
                      choices: [
                        ...g.choices,
                        {
                          id: crypto.randomUUID(),
                          nameRu: "",
                          nameKk: "",
                          deltaMinor: 0,
                          active: true,
                        },
                      ],
                    })
                  }
                >
                  Добавить добавку
                </button>
                <button
                  type="button"
                  onClick={() => setGroups(groups.filter((_, j) => j !== i))}
                >
                  Удалить группу
                </button>
              </fieldset>
            );
          })}
          <button
            type="button"
            disabled={groups.length >= 20}
            onClick={() =>
              setGroups([
                ...groups,
                {
                  id: crypto.randomUUID(),
                  nameRu: "",
                  nameKk: "",
                  minimum: 0,
                  maximum: 1,
                  choices: [],
                },
              ])
            }
          >
            Добавить группу добавок
          </button>
          <button type="submit">Сохранить варианты и категорию</button>
        </fieldset>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          void action(async () => {
            await api(
              "admin/categories",
              "POST",
              {
                branchId: product.branchId,
                nameRu: f.get("ru"),
                nameKk: f.get("kk"),
                active: true,
                position: 0,
              },
              csrf,
            );
            setCategories(
              (await api("admin/categories?branchId=" + product.branchId))
                .items,
            );
          });
        }}
      >
        <fieldset disabled={busy}>
          <legend>Новая категория</legend>
          <label>
            Название категории RU
            <input name="ru" required maxLength={80} />
          </label>
          <label>
            Название категории KK
            <input name="kk" required maxLength={80} />
          </label>
          <button>Создать категорию</button>
        </fieldset>
      </form>
      <h3>Остатки</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action(async () => {
            await api(
              "admin/products/" + product.id + "/stock",
              "POST",
              {
                expectedVersion: product.version,
                expectedStockQuantity: product.stockQuantity ?? null,
                stockQuantity: stock === "" ? null : Number(stock),
              },
              csrf,
            );
          });
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Доступно порций (пусто — без лимита)
            <input
              type="number"
              min="0"
              max="100000"
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </label>
          <button>Сохранить остаток</button>
        </fieldset>
      </form>
    </div>
  );
}
