import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate }
  }))
}));

import { POST } from "./route";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/reformulate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  }) as any;
}

function anthropicTextResponse(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }]
  };
}

const VALID_PAYLOAD = {
  requirements: [
    {
      id: "REQ-001",
      section: "Fonctionnelle",
      text: "Le système doit permettre la connexion.",
      criteria: {
        necessaire: true,
        nonAmbigue: true,
        complete: true,
        singuliere: true,
        faisable: true,
        verifiable: true,
        correcte: true,
        independanteSolution: true
      },
      clarification: null,
      acceptanceCriteria: [
        {
          scenario: "Connexion réussie",
          given: "un utilisateur enregistré",
          when: "il saisit des identifiants valides",
          then: "il accède à son tableau de bord"
        }
      ]
    }
  ]
};

describe("POST /api/reformulate", () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey;
  });

  it("refuse un texte vide (400)", async () => {
    const res = await POST(makeRequest({ text: "   " }, { "x-forwarded-for": "10.0.0.1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/aucun texte/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("échoue proprement si la clé API n'est pas configurée (500)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(
      makeRequest({ text: "Un besoin." }, { "x-forwarded-for": "10.0.0.2" })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("renvoie les exigences structurées en cas de succès", async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse(VALID_PAYLOAD));

    const res = await POST(
      makeRequest({ text: "Un besoin à reformuler." }, { "x-forwarded-for": "10.0.0.3" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requirements).toHaveLength(1);
    expect(body.requirements[0].id).toBe("REQ-001");
    expect(body.requirements[0].acceptanceCriteria[0].scenario).toBe(
      "Connexion réussie"
    );
    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
  });

  it("renvoie 502 si la réponse de Claude n'est pas un JSON exploitable", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Désolé, je ne peux pas répondre en JSON." }]
    });

    const res = await POST(
      makeRequest({ text: "Un besoin." }, { "x-forwarded-for": "10.0.0.4" })
    );
    expect(res.status).toBe(502);
  });

  it("renvoie 502 si la réponse ne contient pas de tableau 'requirements'", async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse({ foo: "bar" }));

    const res = await POST(
      makeRequest({ text: "Un besoin." }, { "x-forwarded-for": "10.0.0.5" })
    );
    expect(res.status).toBe(502);
  });

  it("renvoie 413 si la réponse est tronquée par la limite de tokens", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "max_tokens",
      content: [
        {
          type: "text",
          text: '{"requirements": [{"id": "REQ-001", "section": "Fonctionnelle", "text": "Le systèm'
        }
      ]
    });

    const res = await POST(
      makeRequest({ text: "Un très long texte source." }, { "x-forwarded-for": "10.0.0.6" })
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/trop long/i);
  });

  it("bloque après dépassement du quota par IP (429)", async () => {
    vi.resetModules();
    process.env.RATE_LIMIT_MAX = "2";
    process.env.RATE_LIMIT_WINDOW_MS = "600000";
    mockCreate.mockResolvedValue(anthropicTextResponse(VALID_PAYLOAD));

    const { POST: isolatedPost } = await import("./route");
    const headers = { "x-forwarded-for": "10.0.0.99" };

    const first = await isolatedPost(makeRequest({ text: "a" }, headers));
    const second = await isolatedPost(makeRequest({ text: "a" }, headers));
    const third = await isolatedPost(makeRequest({ text: "a" }, headers));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBeTruthy();

    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
  });
});
