export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const csrf =
    typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((c) => c.startsWith("fenix_csrf="))
          ?.split("=")[1]
      : undefined;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data.detail === "string"
        ? data.detail
        : res.status === 422
          ? "Confira os campos preenchidos."
          : "Não foi possível concluir. Tente novamente.";
    if (
      (res.status === 401 || message === "PASSWORD_CHANGE_REQUIRED") &&
      !path.startsWith("/auth/")
    ) {
      window.location.assign(
        message === "PASSWORD_CHANGE_REQUIRED" ? "/change-password" : "/login",
      );
    }
    throw new ApiError(res.status, message);
  }
  return data;
}
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export const money = (value: string | number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(value));
export const percent = (value: string | null | undefined) =>
  value == null
    ? "—"
    : `${Number(value) > 0 ? "+" : ""}${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const dateLabel = (value: string | null | undefined, time = false) =>
  !value
    ? "—"
    : new Date(
        value.length === 10 ? `${value}T12:00:00` : `${value}Z`,
      ).toLocaleString(
        "pt-BR",
        time
          ? { dateStyle: "short", timeStyle: "short" }
          : { dateStyle: "medium" },
      );
export const monthLabel = (value: string) =>
  new Date(`${value.slice(0, 7)}-01T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
