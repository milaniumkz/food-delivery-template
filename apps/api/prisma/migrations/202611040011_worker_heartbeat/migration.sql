CREATE TABLE "WorkerHeartbeat" (
 "kind" TEXT PRIMARY KEY CHECK ("kind" IN ('expiry','notifications')),
 "lastSeenAt" TIMESTAMPTZ(3) NOT NULL
);
