import test from "node:test";
import assert from "node:assert/strict";
import {
  branchOpen,
  pointInPolygon,
  discountMinor,
  canonical,
} from "../../dist/pricing.js";
test("IANA schedule, closing boundary and dated holiday override", () => {
  const schedule = [{ day: 1, startMinute: 9 * 60, endMinute: 18 * 60 }];
  assert.equal(
    branchOpen(schedule, {}, "Asia/Almaty", new Date("2026-11-02T04:00:00Z")),
    true,
  );
  assert.equal(
    branchOpen(schedule, {}, "Asia/Almaty", new Date("2026-11-02T13:00:00Z")),
    false,
  );
  assert.equal(
    branchOpen(
      schedule,
      { "2026-11-02": [] },
      "Asia/Almaty",
      new Date("2026-11-02T04:00:00Z"),
    ),
    false,
  );
  assert.equal(
    branchOpen(
      [],
      { "2026-11-02": [{ startMinute: 0, endMinute: 1440 }] },
      "Asia/Almaty",
      new Date("2026-11-02T04:00:00Z"),
    ),
    true,
  );
});
test("polygon includes boundaries deterministically and excludes outside", () => {
  const polygon = [
    { latitude: 43, longitude: 76 },
    { latitude: 43, longitude: 77 },
    { latitude: 44, longitude: 77 },
    { latitude: 44, longitude: 76 },
  ];
  for (const point of [
    { latitude: 43.5, longitude: 76.5 },
    { latitude: 43, longitude: 76 },
    { latitude: 43.5, longitude: 76 },
  ])
    assert.equal(pointInPolygon(point, polygon), true);
  assert.equal(
    pointInPolygon({ latitude: 42.9, longitude: 76.5 }, polygon),
    false,
  );
});
test("discount rounding is integer floor, with caps and no over-discount", () => {
  assert.equal(
    discountMinor(1001, {
      basisPoints: 3333,
      fixedMinor: null,
      maxDiscountMinor: null,
    }),
    333,
  );
  assert.equal(
    discountMinor(1001, {
      basisPoints: 5000,
      fixedMinor: null,
      maxDiscountMinor: 200,
    }),
    200,
  );
  assert.equal(
    discountMinor(1001, {
      basisPoints: null,
      fixedMinor: 99999,
      maxDiscountMinor: null,
    }),
    1001,
  );
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
});
