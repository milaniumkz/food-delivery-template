import test from "node:test";
import assert from "node:assert/strict";
import { queueScope } from "../../dist/queue-scope.js";
test("same-brand environments cannot share queue identities; credential rotation preserves scope", () => {
  const a = queueScope(
    "demo",
    "postgresql://user:private@localhost:5432/staging",
  );
  assert.notEqual(
    a,
    queueScope("demo", "postgresql://user:private@localhost:5432/production"),
  );
  assert.notEqual(
    a,
    queueScope("demo-alt", "postgresql://user:private@localhost:5432/staging"),
  );
  assert.equal(
    a,
    queueScope(
      "demo",
      "postgresql://new:rotated@LOCALHOST/staging?connect_timeout=5",
    ),
  );
  assert.ok(!a.includes("private"));
  assert.ok(!a.includes("staging"));
});
