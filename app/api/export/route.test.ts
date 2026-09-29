import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { Requirement } from "@/lib/requirements";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }) as any;
}

const SAMPLE_REQUIREMENT: Requirement = {
  id: "REQ-001",
  section: "Fonctionnelle",
  text: "Le système doit permettre l'export des exigences.",
  criteria: {
    necessaire: true,
    nonAmbigue: true,
    complete: true,
    singuliere: true,
    faisable: true,
    verifiable: false,
    correcte: true,
    independanteSolution: true
  },
  clarification: "Le délai d'export n'est pas précisé.",
  acceptanceCriteria: [
    {
      scenario: "Export réussi",
      given: "une liste d'exigences reformulées",
      when: "l'utilisateur clique sur Exporter",
      then: "un fichier est téléchargé"
    }
  ]
};

async function readBufferPrefix(res: Response, length: number): Promise<string> {
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer.slice(0, length)).toString("latin1");
}

describe("POST /api/export", () => {
  it("refuse une liste d'exigences vide (400)", async () => {
    const res = await POST(makeRequest({ requirements: [], format: "docx" }));
    expect(res.status).toBe(400);
  });

  it("refuse un format non pris en charge (400)", async () => {
    const res = await POST(
      makeRequest({ requirements: [SAMPLE_REQUIREMENT], format: "txt" })
    );
    expect(res.status).toBe(400);
  });

  it("génère un fichier .docx valide", async () => {
    const res = await POST(
      makeRequest({ requirements: [SAMPLE_REQUIREMENT], format: "docx" })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("wordprocessingml");
    expect(res.headers.get("Content-Disposition")).toContain(".docx");
    // Un .docx est une archive zip : signature "PK"
    expect(await readBufferPrefix(res, 2)).toBe("PK");
  });

  it("génère un fichier .pdf valide", async () => {
    const res = await POST(
      makeRequest({ requirements: [SAMPLE_REQUIREMENT], format: "pdf" })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain(".pdf");
    expect(await readBufferPrefix(res, 5)).toBe("%PDF-");
  });
});
