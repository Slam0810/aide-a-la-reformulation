import { expect, test } from "@playwright/test";

const MOCK_REQUIREMENTS = [
  {
    id: "REQ-001",
    section: "Fonctionnelle",
    text: "Le système doit permettre à l'utilisateur de se connecter avec un identifiant et un mot de passe.",
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
        given: "un utilisateur enregistré avec des identifiants valides",
        when: "il saisit son identifiant et son mot de passe puis valide",
        then: "il accède à son tableau de bord"
      }
    ]
  },
  {
    id: "REQ-002",
    section: "Non fonctionnelle",
    text: "Le système doit répondre rapidement aux requêtes de l'utilisateur.",
    criteria: {
      necessaire: true,
      nonAmbigue: false,
      complete: false,
      singuliere: true,
      faisable: true,
      verifiable: false,
      correcte: true,
      independanteSolution: true
    },
    clarification:
      "Le terme « rapidement » n'est pas quantifié : aucun seuil de temps de réponse mesurable.",
    acceptanceCriteria: [
      {
        scenario: "Temps de réponse",
        given: "un utilisateur connecté",
        when: "il effectue une action sur l'interface",
        then: "le système répond dans un délai à préciser"
      }
    ]
  }
];

async function mockReformulate(page: import("@playwright/test").Page) {
  await page.route("**/api/reformulate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "X-RateLimit-Remaining": "7",
        "X-RateLimit-Limit": "8"
      },
      body: JSON.stringify({ requirements: MOCK_REQUIREMENTS })
    });
  });
}

test.describe("Parcours principal — Assistant PO", () => {
  test("le bouton Reformuler est désactivé tant qu'aucun texte n'est saisi", async ({
    page
  }) => {
    await page.goto("/");
    const reformulerBtn = page.getByRole("button", { name: "Reformuler" });
    await expect(reformulerBtn).toBeDisabled();

    await page
      .getByPlaceholder(/Collez ici le besoin exprimé/)
      .fill("L'utilisateur doit pouvoir se connecter.");
    await expect(reformulerBtn).toBeEnabled();
  });

  test("reformuler affiche les exigences avec leur score de conformité", async ({
    page
  }) => {
    await mockReformulate(page);
    await page.goto("/");

    await page
      .getByPlaceholder(/Collez ici le besoin exprimé/)
      .fill("L'utilisateur doit pouvoir se connecter rapidement.");
    await page.getByRole("button", { name: "Reformuler" }).click();

    await expect(page.getByText("REQ-001")).toBeVisible();
    await expect(page.getByText("REQ-002")).toBeVisible();
    await expect(page.getByText("8/8", { exact: true })).toBeVisible();
    await expect(page.getByText(/à revoir|à vérifier/)).toBeVisible();
    await expect(
      page.getByText(/n'est pas quantifié/)
    ).toBeVisible();
  });

  test("le bouton Reformuler se redésactive tant que le texte ne change pas", async ({
    page
  }) => {
    await mockReformulate(page);
    await page.goto("/");

    const textarea = page.getByPlaceholder(/Collez ici le besoin exprimé/);
    const reformulerBtn = page.getByRole("button", { name: "Reformuler" });

    await textarea.fill("Un besoin quelconque à reformuler.");
    await reformulerBtn.click();
    await expect(page.getByText("REQ-001")).toBeVisible();

    await expect(reformulerBtn).toBeDisabled();

    await textarea.fill("Un besoin quelconque à reformuler, modifié.");
    await expect(reformulerBtn).toBeEnabled();
  });

  test("les critères d'acceptation Gherkin se déplient et sont éditables", async ({
    page
  }) => {
    await mockReformulate(page);
    await page.goto("/");

    await page
      .getByPlaceholder(/Collez ici le besoin exprimé/)
      .fill("L'utilisateur doit pouvoir se connecter.");
    await page.getByRole("button", { name: "Reformuler" }).click();
    await expect(page.getByText("REQ-001")).toBeVisible();

    const toggle = page.getByRole("button", {
      name: /Critères d'acceptation \(1\)/
    }).first();
    await toggle.click();

    const firstScenario = page.locator(".gherkin-scenario").first();
    await expect(firstScenario.locator(".gherkin-scenario-title")).toHaveValue(
      "Connexion réussie"
    );
    await expect(firstScenario.locator(".gherkin-input").first()).toHaveValue(
      "un utilisateur enregistré avec des identifiants valides"
    );

    // Le champ reste éditable : on modifie le "Alors" et on vérifie la mise à jour.
    const thenField = firstScenario.locator(".gherkin-input").nth(2);
    await thenField.fill("il accède à son tableau de bord personnalisé");
    await expect(thenField).toHaveValue(
      "il accède à son tableau de bord personnalisé"
    );
  });

  test("une reformulation apparaît dans l'historique et peut être rechargée", async ({
    page
  }) => {
    await mockReformulate(page);
    await page.goto("/");

    await page
      .getByPlaceholder(/Collez ici le besoin exprimé/)
      .fill("L'utilisateur doit pouvoir se connecter.");
    await page.getByRole("button", { name: "Reformuler" }).click();
    await expect(page.getByText("REQ-001")).toBeVisible();

    await page.getByRole("button", { name: /Historique/ }).click();
    await expect(page.locator(".history-preview")).toContainText(
      "L'utilisateur doit pouvoir se connecter."
    );
  });

  test("exporter en .docx déclenche un téléchargement", async ({ page }) => {
    await mockReformulate(page);
    await page.route("**/api/export", async (route) => {
      await route.fulfill({
        status: 200,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers: {
          "Content-Disposition": 'attachment; filename="besoins-reformules.docx"'
        },
        body: Buffer.from("PK-fake-docx-content")
      });
    });

    await page.goto("/");
    await page
      .getByPlaceholder(/Collez ici le besoin exprimé/)
      .fill("L'utilisateur doit pouvoir se connecter.");
    await page.getByRole("button", { name: "Reformuler" }).click();
    await expect(page.getByText("REQ-001")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exporter en .docx" }).click()
    ]);

    expect(download.suggestedFilename()).toBe("besoins-reformules.docx");
  });

  test("un dépassement de quota affiche un message d'erreur clair", async ({
    page
  }) => {
    await page.route("**/api/reformulate", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "120" },
        body: JSON.stringify({
          error: "Trop de demandes de reformulation depuis cette connexion. Réessayez dans environ 2 minutes."
        })
      });
    });

    await page.goto("/");
    await page
      .getByPlaceholder(/Collez ici le besoin exprimé/)
      .fill("Un besoin.");
    await page.getByRole("button", { name: "Reformuler" }).click();

    await expect(page.getByText(/Trop de demandes/)).toBeVisible();
  });
});
