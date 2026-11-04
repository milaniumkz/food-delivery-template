import test from "node:test";
import assert from "node:assert/strict";
import {
  selectOptions,
  validateConfiguration,
} from "../../dist/product-options.js";
const variant = {
  id: "v",
  nameRu: "Большой",
  nameKk: "Үлкен",
  priceMinor: 300000,
  active: true,
};
const group = {
  id: "g",
  nameRu: "Соус",
  nameKk: "Тұздық",
  minimum: 1,
  maximum: 1,
  choices: [
    {
      id: "s",
      nameRu: "Сыр",
      nameKk: "Ірімшік",
      deltaMinor: 10000,
      active: true,
    },
    {
      id: "t",
      nameRu: "Чили",
      nameKk: "Чили",
      deltaMinor: 20000,
      active: false,
    },
  ],
};
test("variant and required modifier use only trusted server prices", () => {
  const config = { variants: [variant], groups: [group] };
  assert.throws(
    () => selectOptions(100000, config),
    (e) => e.code === "VARIANT_REQUIRED",
  );
  assert.throws(
    () => selectOptions(100000, config, "v"),
    (e) => e.code === "CHOICE_LIMIT",
  );
  assert.throws(
    () => selectOptions(100000, config, "v", ["t"]),
    (e) => e.code === "INVALID_CHOICE",
  );
  assert.throws(
    () => selectOptions(100000, config, "v", ["s", "s"]),
    (e) => e.code === "DUPLICATE_CHOICE",
  );
  const result = selectOptions(100000, config, "v", ["s"]);
  assert.equal(result.unitPriceMinor, 310000);
  assert.deepEqual(
    result.options.map((o) => o.nameKk),
    ["Ірімшік", "Үлкен"],
  );
});
test("configuration rejects duplicate identity, invalid bounds and excessive total", () => {
  assert.throws(
    () =>
      validateConfiguration({
        variants: [variant, { ...variant }],
        groups: [],
      }),
    (e) => e.code === "DUPLICATE_OPTION",
  );
  assert.throws(
    () =>
      validateConfiguration({
        variants: [],
        groups: [{ ...group, minimum: 3 }],
      }),
    (e) => e.code === "INVALID_OPTIONS",
  );
  assert.throws(
    () => selectOptions(100000000, { groups: [group] }, undefined, ["s"]),
    (e) => e.code === "AMOUNT_LIMIT",
  );
  assert.deepEqual(selectOptions(100, null), {
    unitPriceMinor: 100,
    options: [],
  });
});

test("incompatibility blocks variant/choice and choice/choice pairs; definitions reject unknown, self and reverse duplicates", () => {
  const config = {
    variants: [variant],
    groups: [
      {
        ...group,
        minimum: 0,
        maximum: 2,
        choices: group.choices.map((value) => ({ ...value, active: true })),
      },
    ],
    incompatiblePairs: [{ firstId: "s", secondId: "t" }],
  };
  assert.throws(
    () => selectOptions(100000, config, "v", ["s", "t"]),
    (error) => error.code === "INCOMPATIBLE_OPTIONS",
  );
  assert.equal(
    selectOptions(100000, config, "v", ["s"]).unitPriceMinor,
    310000,
  );
  config.incompatiblePairs = [{ firstId: "v", secondId: "s" }];
  assert.throws(
    () => selectOptions(100000, config, "v", ["s"]),
    (error) => error.code === "INCOMPATIBLE_OPTIONS",
  );
  for (const pairs of [
    [{ firstId: "v", secondId: "missing" }],
    [{ firstId: "s", secondId: "s" }],
    [
      { firstId: "v", secondId: "s" },
      { firstId: "s", secondId: "v" },
    ],
    [{ firstId: "g", secondId: "s" }],
  ]) {
    assert.throws(
      () => validateConfiguration({ ...config, incompatiblePairs: pairs }),
      (error) => error.code === "INVALID_OPTIONS",
    );
  }
});
