import { expect, test } from "@playwright/test";

test.describe("First run", () => {
  test("opening FDraft launches directly into the app — no login, just the first-run screen", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Welcome to FDraft" }),
    ).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await expect(page.getByLabel(/email/i)).toHaveCount(0);

    await page.getByLabel("Profile name").fill("Alex");
    await page.getByRole("button", { name: "Create Profile" }).click();

    await expect(page).toHaveURL(/\/watchlist$/);
    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();
  });

  test("reopening the app with one existing profile skips straight to the app — no picker", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Profile name").fill("Alex");
    await page.getByRole("button", { name: "Create Profile" }).click();
    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();

    await page.reload();

    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Welcome to FDraft" }),
    ).toHaveCount(0);
  });
});
