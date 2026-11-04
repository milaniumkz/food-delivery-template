export interface Point {
  latitude: number;
  longitude: number;
}
export interface Window {
  startMinute: number;
  endMinute: number;
}
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const x = point.longitude,
    y = point.latitude;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i],
      cross =
        (x - a.longitude) * (b.latitude - a.latitude) -
        (y - a.latitude) * (b.longitude - a.longitude);
    if (
      Math.abs(cross) < 1e-9 &&
      x >= Math.min(a.longitude, b.longitude) - 1e-9 &&
      x <= Math.max(a.longitude, b.longitude) + 1e-9 &&
      y >= Math.min(a.latitude, b.latitude) - 1e-9 &&
      y <= Math.max(a.latitude, b.latitude) + 1e-9
    )
      return true;
    if (
      a.latitude > y !== b.latitude > y &&
      x <
        ((b.longitude - a.longitude) * (y - a.latitude)) /
          (b.latitude - a.latitude) +
          a.longitude
    )
      inside = !inside;
  }
  return inside;
}
export function branchOpen(
  schedule: unknown,
  holidays: unknown,
  timeZone: string,
  date: Date,
): boolean {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.weekday,
    ),
    minute = Number(parts.hour) * 60 + Number(parts.minute),
    key = `${parts.year}-${parts.month}-${parts.day}`;
  const override =
    holidays &&
    typeof holidays === "object" &&
    !Array.isArray(holidays) &&
    key in holidays
      ? (holidays as Record<string, unknown>)[key]
      : undefined;
  const slots =
    override !== undefined
      ? override
      : Array.isArray(schedule)
        ? schedule.filter((s) => s && typeof s === "object" && s.day === day)
        : [];
  return (
    Array.isArray(slots) &&
    slots.some(
      (slot) =>
        slot &&
        typeof slot === "object" &&
        Number.isInteger(slot.startMinute) &&
        Number.isInteger(slot.endMinute) &&
        slot.startMinute >= 0 &&
        slot.endMinute <= 1440 &&
        minute >= slot.startMinute &&
        minute < slot.endMinute,
    )
  );
}
export function discountMinor(
  subtotal: number,
  promotion: {
    basisPoints: number | null;
    fixedMinor: number | null;
    maxDiscountMinor: number | null;
  },
) {
  const raw =
    promotion.basisPoints !== null
      ? Math.floor((subtotal * promotion.basisPoints) / 10000)
      : (promotion.fixedMinor ?? 0);
  return Math.min(
    subtotal,
    raw,
    promotion.maxDiscountMinor ?? Number.MAX_SAFE_INTEGER,
  );
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
