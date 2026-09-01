import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./server";
import { FakeSupabase } from "../domain/__tests__/fake-db";

describe("cron routes", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a catalog-sync request with no CRON_SECRET header", async () => {
    const app = buildServer(new FakeSupabase() as any);
    const res = await app.inject({ method: "GET", url: "/internal/cron/catalog-sync" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    const app = buildServer(new FakeSupabase() as any);
    const res = await app.inject({ method: "GET", url: "/internal/cron/catalog-sync", headers: { authorization: "Bearer wrong" } });
    expect(res.statusCode).toBe(401);
  });

  it("accepts the correct CRON_SECRET and runs the job for every active store (none, here)", async () => {
    const db = new FakeSupabase() as any;
    const app = buildServer(db);
    const res = await app.inject({ method: "GET", url: "/internal/cron/tracking-sync", headers: { authorization: "Bearer test-cron-secret" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("does not require a store API key for /internal/* routes", async () => {
    // No Authorization header for a store API key — only CRON_SECRET, confirming the two auth
    // schemes don't collide (the store-API-key onRequest hook must skip /internal/*).
    const app = buildServer(new FakeSupabase() as any);
    const res = await app.inject({ method: "GET", url: "/internal/cron/catalog-sync", headers: { authorization: "Bearer test-cron-secret" } });
    expect(res.statusCode).toBe(200);
  });
});
