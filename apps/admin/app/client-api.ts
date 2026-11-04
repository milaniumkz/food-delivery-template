export async function api(
  path: string,
  method = "GET",
  body?: unknown,
  csrf?: string,
  idempotencyKey?: string,
) {
  const response = await fetch("/api/" + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      response.status === 422 && typeof result.message === "string"
        ? result.message
        : result.code === "REAUTH_REQUIRED"
          ? result.message
          : response.status === 401
            ? "Войдите снова. Проверьте пароль и код подтверждения."
            : response.status === 403
              ? "Недостаточно прав для этого действия."
              : response.status === 409
                ? typeof result.message === "string" &&
                  result.code !== "CONFLICT"
                  ? result.message
                  : "Данные уже изменились. Обновите список и повторите действие."
                : response.status === 429
                  ? "Слишком много попыток. Повторите позже."
                  : response.status === 400
                    ? "Проверьте заполнение полей."
                    : "Сервер временно недоступен. Повторите попытку.",
    );
    throw error;
  }
  return result;
}
