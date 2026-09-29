import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, getClientKey } from "./rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("autorise les requêtes tant que la limite n'est pas atteinte", () => {
    const key = `test-key-${Math.random()}`;
    const first = checkRateLimit(key, 3, 60_000);
    const second = checkRateLimit(key, 3, 60_000);
    const third = checkRateLimit(key, 3, 60_000);

    expect(first).toEqual({ allowed: true, remaining: 2, resetInMs: 60_000 });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(1);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("bloque une fois la limite dépassée", () => {
    const key = `test-key-${Math.random()}`;
    checkRateLimit(key, 2, 60_000);
    checkRateLimit(key, 2, 60_000);
    const blocked = checkRateLimit(key, 2, 60_000);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetInMs).toBeGreaterThan(0);
  });

  it("traite chaque clé (IP) indépendamment", () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;
    checkRateLimit(keyA, 1, 60_000);
    const blockedA = checkRateLimit(keyA, 1, 60_000);
    const allowedB = checkRateLimit(keyB, 1, 60_000);

    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("réinitialise le compteur une fois la fenêtre de temps écoulée", () => {
    const key = `test-key-${Math.random()}`;
    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(realNow);

    checkRateLimit(key, 1, 1000);
    const blocked = checkRateLimit(key, 1, 1000);
    expect(blocked.allowed).toBe(false);

    nowSpy.mockReturnValue(realNow + 1001);
    const afterWindow = checkRateLimit(key, 1, 1000);
    expect(afterWindow.allowed).toBe(true);
  });
});

describe("getClientKey", () => {
  it("utilise le premier hôte de x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.4, 70.41.3.18" }
    });
    expect(getClientKey(req)).toBe("203.0.113.4");
  });

  it("se rabat sur x-real-ip si x-forwarded-for est absent", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "198.51.100.7" }
    });
    expect(getClientKey(req)).toBe("198.51.100.7");
  });

  it("retourne 'unknown' si aucun en-tête n'est présent", () => {
    const req = new Request("http://localhost");
    expect(getClientKey(req)).toBe("unknown");
  });
});
