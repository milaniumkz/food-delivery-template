import { setTimeout } from "node:timers/promises";
// PostgreSQL expiry must continue even if the notification queue does not answer.
// At most one enqueue operation is in flight; its transport is closed by the owner on shutdown.
export async function runWorkerCycle(
  expire: () => Promise<unknown>,
  enqueue: () => Promise<unknown>,
  signal: AbortSignal,
  onError: (task: "expiry" | "notifications") => void,
  intervalMs = 1000,
) {
  let notification: Promise<unknown> | undefined;
  while (!signal.aborted) {
    try {
      await expire();
    } catch {
      onError("expiry");
    }
    if (!notification && !signal.aborted)
      notification = enqueue()
        .catch(() => onError("notifications"))
        .finally(() => {
          notification = undefined;
        });
    try {
      await setTimeout(intervalMs, undefined, { signal });
    } catch {
      if (!signal.aborted) throw new Error("Worker timer failed");
    }
  }
}
