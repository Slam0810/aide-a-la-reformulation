import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Le réseau est mocké au niveau navigateur (page.route) dans les tests :
      // aucune vraie clé n'est nécessaire, mais la route exige qu'une valeur
      // soit présente pour ne pas répondre 500 avant même le mock.
      ANTHROPIC_API_KEY: "e2e-test-placeholder-not-used"
    }
  }
});
