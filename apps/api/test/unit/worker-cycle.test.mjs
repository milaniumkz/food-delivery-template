import test from "node:test";
import assert from "node:assert/strict";
import { runWorkerCycle } from "../../dist/worker-cycle.js";
test("unresponsive notification queue cannot block PostgreSQL expiry or shutdown", async () => {
  const controller = new AbortController();
  let expired = 0,
    enqueueCalls = 0;
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    await runWorkerCycle(
      async () => {
        expired++;
        if (expired === 4) controller.abort();
      },
      () => {
        enqueueCalls++;
        return new Promise(() => {});
      },
      controller.signal,
      () => assert.fail("No synthetic error expected"),
      1,
    );
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(expired, 4);
  assert.equal(enqueueCalls, 1);
});
