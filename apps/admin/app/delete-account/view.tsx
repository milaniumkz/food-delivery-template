"use client";
import { useEffect, useState, type FormEvent } from "react";
export default function DeleteAccount({
  supportEmail,
}: {
  supportEmail: string;
}) {
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [deletion, setDeletion] = useState(""),
    [token, setToken] = useState(""),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function request(path: string, body: unknown) {
    const response = await fetch("/account-api/" + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
      }),
      value = await response.json();
    if (!response.ok) {
      const messages: Record<string, string> = {
        INVALID_PROOF: "Код недействителен или истёк. Получите новый код.",
        ACTIVE_ORDERS:
          "Завершите активные заказы и уточните незавершённые платежи перед удалением.",
        UNAUTHORIZED: "Код или сессия недействительны. Получите новый код.",
        RATE_LIMITED: "Слишком много запросов. Подождите.",
        UNAVAILABLE: "Сервис недоступен. Повторите позже.",
      };
      throw Error(
        messages[value.code] ??
          "Не удалось выполнить запрос. Проверьте код и повторите.",
      );
    }
    return value;
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!token) {
        if (!challenge) {
          const result = await request("auth/otp/request", { phone });
          setChallenge(result.challengeId);
          setRetryAt(Date.now() + result.retryAfter * 1000);
        } else {
          const result = await request("auth/otp/verify", {
            challengeId: challenge,
            code,
          });
          setToken(result.accessToken);
          setCode("");
        }
      } else if (!deletion) {
        const result = await request("me/deletion-challenge", {});
        setDeletion(result.challengeId);
        setRetryAt(Date.now() + result.retryAfter * 1000);
        setCode("");
      } else {
        if (!confirmed)
          throw Error("Подтвердите, что понимаете последствия удаления.");
        await request("me/delete", { challengeId: deletion, code });
        setToken("");
        setCode("");
        setPhone("");
        setChallenge("");
        setDeletion("");
        setDone(true);
      }
    });
  }
  return (
    <>
      <p>
        Удаление доступно без установленного приложения. Подтвердите телефон,
        затем действие отдельным SMS-кодом. При наличии активного заказа или
        неуточнённой оплаты сначала завершите их.
      </p>
      <p>
        Профиль и сохранённые адреса удаляются или обезличиваются, сессии
        отзываются. Учитываемые финансовые записи сохраняются в минимальном
        виде; сроки хранения и юридические основания бизнес должен утвердить до
        запуска.
      </p>
      <p role="note">
        Текущая среда тестовая: настоящие SMS не отправляются, код доступен
        оператору локальной среды. Это не опубликованный production сервис
        удаления.
      </p>
      {error && <p role="alert">{error}</p>}
      {done ? (
        <p role="status">Аккаунт удалён. Сессии отозваны.</p>
      ) : (
        <form onSubmit={submit}>
          {!token && (
            <label>
              Телефон
              <input
                type="tel"
                required
                pattern="\+[1-9][0-9]{7,14}"
                autoComplete="tel"
                value={phone}
                disabled={!!challenge}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
          )}
          {((challenge && !token) || deletion) && (
            <label>
              Код SMS
              <input
                inputMode="numeric"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
          )}
          {deletion && (
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Понимаю, что удаление необратимо, и подтверждаю его
            </label>
          )}
          {token && !deletion && remaining > 0 && (
            <p role="status">
              Повторный код можно запросить через {remaining} с.
            </p>
          )}
          <button disabled={busy || (!!token && !deletion && remaining > 0)}>
            {!token
              ? challenge
                ? "Подтвердить телефон"
                : "Получить код"
              : deletion
                ? "Удалить аккаунт"
                : "Получить код для удаления"}
          </button>
          {((challenge && !token) || deletion) && (
            <button
              type="button"
              disabled={busy || remaining > 0}
              onClick={() =>
                run(async () => {
                  const result = await request(
                    token ? "me/deletion-challenge" : "auth/otp/request",
                    token ? {} : { phone },
                  );
                  if (token) setDeletion(result.challengeId);
                  else setChallenge(result.challengeId);
                  setCode("");
                  setRetryAt(Date.now() + result.retryAfter * 1000);
                })
              }
            >
              Получить новый код{remaining > 0 ? " · " + remaining + " с" : ""}
            </button>
          )}
          {token && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await request("auth/logout", {});
                  setToken("");
                  setChallenge("");
                  setDeletion("");
                  setCode("");
                  setConfirmed(false);
                })
              }
            >
              Выйти
            </button>
          )}
        </form>
      )}
      <p>
        Связаться с поддержкой:{" "}
        <a href={"mailto:" + supportEmail}>{supportEmail}</a>
      </p>
    </>
  );
}
