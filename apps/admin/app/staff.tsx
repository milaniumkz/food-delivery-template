"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./client-api";
type Role = { role: string; branchId: string | null; refundAllowed: boolean };
type Member = {
  id: string;
  email: string;
  active: boolean;
  version: number;
  roles: Role[];
};
export default function StaffSettings({ csrf }: { csrf: string }) {
  const [items, setItems] = useState<Member[]>([]),
    [branches, setBranches] = useState<Array<{ id: string; nameRu: string }>>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [credentials, setCredentials] = useState<{
      password: string;
      totpSecret: string;
    } | null>(null),
    [editing, setEditing] = useState<Member | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([api("admin/staff"), api("admin/branches")])
      .then(([staff, b]) => {
        if (active) {
          setItems(staff.items);
          setBranches(b.items);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      f = new FormData(form);
    setBusy(true);
    setError("");
    setCredentials(null);
    try {
      let result;
      if (editing) {
        result = await api(
          "admin/staff/" + editing.id,
          "PATCH",
          {
            expectedVersion: editing.version,
            active: f.get("active") === "on",
            roles: JSON.parse(String(f.get("roles"))),
            code: f.get("code"),
          },
          csrf,
        );
      } else {
        const role = String(f.get("role"));
        result = await api(
          "admin/staff",
          "POST",
          {
            email: f.get("email"),
            roles: [
              {
                role,
                branchId: role === "owner" ? null : f.get("branch"),
                refundAllowed: role === "manager" && f.get("refund") === "on",
              },
            ],
            code: f.get("code"),
          },
          csrf,
        );
        setCredentials(result.credentials);
      }
      setItems((await api("admin/staff")).items);
      setEditing(null);
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="catalog">
      <h2>Команда и доступ</h2>
      {error && <p role="alert">{error}</p>}
      {credentials && (
        <aside role="status">
          <h3>Данные нового сотрудника</h3>
          <p>
            Показаны один раз. Передайте сотруднику защищённым способом и
            закройте этот блок. Письмо автоматически не отправляется.
          </p>
          <label>
            Пароль
            <input readOnly type="password" value={credentials.password} />
          </label>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(credentials, null, 2)], {
                  type: "application/json",
                }),
                url = URL.createObjectURL(blob),
                link = document.createElement("a");
              link.href = url;
              link.download = "staff-credentials.json";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Скачать данные для передачи
          </button>
          <button onClick={() => setCredentials(null)}>Закрыть данные</button>
        </aside>
      )}
      <ul>
        {items.map((member) => (
          <li key={member.id}>
            <button
              onClick={() => {
                setEditing(member);
                setCredentials(null);
              }}
            >
              {member.email} · {member.active ? "активен" : "отключён"} ·{" "}
              {member.roles.map((r) => r.role).join(", ")}
            </button>
          </li>
        ))}
      </ul>
      <form key={editing?.id ?? "new"} onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend>{editing ? "Изменить доступ" : "Создать сотрудника"}</legend>
          {editing ? (
            <>
              <p>{editing.email}</p>
              <label>
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={editing.active}
                />{" "}
                Активен
              </label>
              <label>
                Роли: role, branchId, refundAllowed
                <textarea
                  name="roles"
                  rows={8}
                  required
                  defaultValue={JSON.stringify(editing.roles, null, 2)}
                />
              </label>
              <p>
                Для owner branchId должен быть null. Для остальных ролей нужен
                ID филиала. Изменение доступа завершит все сессии сотрудника.
              </p>
            </>
          ) : (
            <>
              <label>
                Email
                <input name="email" type="email" required autoComplete="off" />
              </label>
              <label>
                Роль
                <select name="role" defaultValue="operator">
                  {[
                    "owner",
                    "manager",
                    "operator",
                    "kitchen",
                    "dispatcher",
                    "courier",
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Филиал
                <select name="branch">
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameRu}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" name="refund" /> Разрешить менеджеру
                возвраты
              </label>
            </>
          )}
          <label>
            Новый код MFA владельца
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="off"
            />
          </label>
          <p>
            Код, использованный для входа или другой операции, повторно не
            принимается.
          </p>
          <button type="submit">
            {editing ? "Сохранить доступ" : "Создать сотрудника"}
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              Новый сотрудник
            </button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
