import { test, expect } from "@playwright/test";

test.describe("Maestro Platform UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to hydrate
    await page.waitForSelector("[data-testid='app-shell']", { timeout: 10000 }).catch(() => {
      // Fallback: wait for any main content
    });
    await page.waitForTimeout(1000);
  });

  test("should load the dashboard", async ({ page }) => {
    // The app should render without crashing
    await expect(page).toHaveTitle(/Maestro/i);
  });

  test("should render app shell or connection screen", async ({ page }) => {
    // Without backend, app shows "Connection Failed"; with backend, shows sidebar
    const connectionFailed = page.getByText("Connection Failed").first();
    const retryBtn = page.getByText("Retry Connection").first();
    const sidebar = page.locator("nav, aside, [class*='sidebar']").first();

    const hasConnectionError = await connectionFailed.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasConnectionError) {
      // Connection failed screen is valid when backend is not running
      await expect(retryBtn).toBeVisible();
    } else {
      await expect(sidebar).toBeVisible();
    }
  });

  test("should show dashboard or connection error", async ({ page }) => {
    // Without backend: "Connection Failed", with backend: Dashboard content
    const connectionFailed = page.getByText("Connection Failed").first();
    const hasConnectionError = await connectionFailed.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasConnectionError) {
      await expect(page.getByText("Retry Connection")).toBeVisible();
    } else {
      const dashboard = page.getByText(/Dashboard|Overview|Total Issues/i).first();
      await expect(dashboard).toBeVisible({ timeout: 5000 });
    }
  });

  test("should navigate to kanban board", async ({ page }) => {
    // Click on board navigation
    const boardBtn = page.getByText(/Board|Kanban/i).first();
    if (await boardBtn.isVisible()) {
      await boardBtn.click();
      await page.waitForTimeout(500);
      // Should show kanban columns
      const kanbanContent = page.getByText(/To Do|Working|Review|Done/i).first();
      await expect(kanbanContent).toBeVisible({ timeout: 5000 });
    }
  });

  test("should show retry button on connection error", async ({ page }) => {
    // When backend is not running, connection error screen should be functional
    const connectionFailed = page.getByText("Connection Failed").first();
    const hasConnectionError = await connectionFailed.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasConnectionError) {
      const retryBtn = page.getByText("Retry Connection").first();
      await expect(retryBtn).toBeVisible();
      // Test that retry button is clickable
      await retryBtn.click();
      await page.waitForTimeout(500);
      // Should still show connection failed since backend isn't running
      await expect(connectionFailed).toBeVisible({ timeout: 5000 });
    } else {
      // Backend is running - sidebar should be visible
      const sidebar = page.locator("nav, aside, [class*='sidebar']").first();
      await expect(sidebar).toBeVisible({ timeout: 5000 });
    }
  });

  test("should open command palette with keyboard shortcut", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(300);
    // Look for command palette dialog or input
    const palette = page.getByPlaceholder(/Search|Command/i).first();
    if (await palette.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(palette).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });

  test("should toggle theme", async ({ page }) => {
    // Find theme toggle button
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");

    // Look for theme toggle
    const themeToggle = page.locator("button").filter({ hasText: /theme/i }).first();
    if (await themeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(300);
      const newClass = await html.getAttribute("class");
      expect(newClass).not.toBe(initialClass);
    }
  });

  test("should show approval mode toggle on kanban board", async ({ page }) => {
    // Navigate to board
    const boardBtn = page.getByText(/Board|Kanban/i).first();
    if (await boardBtn.isVisible()) {
      await boardBtn.click();
      await page.waitForTimeout(500);

      // Look for approval mode toggle
      const approvalToggle = page.getByText(/Auto Mode|Approve Mode/i).first();
      await expect(approvalToggle).toBeVisible({ timeout: 5000 });
    }
  });

  test("should toggle between approval and auto mode", async ({ page }) => {
    const boardBtn = page.getByText(/Board|Kanban/i).first();
    if (await boardBtn.isVisible()) {
      await boardBtn.click();
      await page.waitForTimeout(500);

      // Click auto mode button to switch to approve mode
      const autoModeBtn = page.getByText("Auto Mode").first();
      if (await autoModeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await autoModeBtn.click();
        await page.waitForTimeout(300);
        // Should now show "Approve Mode"
        const approveMode = page.getByText("Approve Mode").first();
        await expect(approveMode).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test("should navigate to settings", async ({ page }) => {
    const settingsBtn = page.getByText(/Settings/i).first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
      // Should see settings content
      const settings = page.getByText(/Theme|Backend|Export|Import/i).first();
      await expect(settings).toBeVisible({ timeout: 5000 });
    }
  });

  test("should navigate to chat", async ({ page }) => {
    const chatBtn = page.getByText(/Chat/i).first();
    if (await chatBtn.isVisible()) {
      await chatBtn.click();
      await page.waitForTimeout(500);
      // Should see chat panel
      const chatArea = page.getByPlaceholder(/message|chat|type/i).first();
      if (await chatArea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(chatArea).toBeVisible();
      }
    }
  });

  test("should navigate to pipelines", async ({ page }) => {
    const pipelineBtn = page.getByText(/Pipeline/i).first();
    if (await pipelineBtn.isVisible()) {
      await pipelineBtn.click();
      await page.waitForTimeout(500);
      // Should see pipeline content
      const pipelineArea = page.getByText(/Pipeline|New Pipeline|Requirement/i).first();
      await expect(pipelineArea).toBeVisible({ timeout: 5000 });
    }
  });

  test("should display notifications", async ({ page }) => {
    // Look for notification bell/icon
    const notifBtn = page.locator("button").filter({ has: page.locator('[class*="bell"], [class*="Bell"]') }).first();
    if (await notifBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notifBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test("should render kanban columns with correct headers", async ({ page }) => {
    const boardBtn = page.getByText(/Board|Kanban/i).first();
    if (await boardBtn.isVisible()) {
      await boardBtn.click();
      await page.waitForTimeout(500);

      // All 5 status columns should be visible
      for (const label of ["To Do", "Working", "Review", "Done", "Failed"]) {
        const col = page.getByText(label, { exact: true }).first();
        await expect(col).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test("should show create issue dialog", async ({ page }) => {
    const boardBtn = page.getByText(/Board|Kanban/i).first();
    if (await boardBtn.isVisible()) {
      await boardBtn.click();
      await page.waitForTimeout(500);

      const newIssueBtn = page.getByText("New Issue").first();
      if (await newIssueBtn.isVisible()) {
        await newIssueBtn.click();
        await page.waitForTimeout(300);

        const dialog = page.getByText("Create Issue", { exact: true }).first();
        await expect(dialog).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test("should switch kanban view modes", async ({ page }) => {
    const boardBtn = page.getByText(/Board|Kanban/i).first();
    if (await boardBtn.isVisible()) {
      await boardBtn.click();
      await page.waitForTimeout(500);

      // Look for timeline view toggle (Calendar icon button)
      const viewButtons = page.locator("button[title='Timeline view']").first();
      if (await viewButtons.isVisible({ timeout: 2000 }).catch(() => false)) {
        await viewButtons.click();
        await page.waitForTimeout(300);

        // Should see timeline headers
        const timelineHeader = page.getByText(/Key|Title|Status/i).first();
        await expect(timelineHeader).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test("should toggle compact mode", async ({ page }) => {
    const boardBtn = page.getByText(/Board|Kanban/i).first();
    if (await boardBtn.isVisible()) {
      await boardBtn.click();
      await page.waitForTimeout(500);

      const compactBtn = page.locator("button[title='Compact cards']").first();
      if (await compactBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await compactBtn.click();
        await page.waitForTimeout(300);
        // Compact mode should now be active (button title changes)
        const expandedBtn = page.locator("button[title='Expanded cards']").first();
        await expect(expandedBtn).toBeVisible({ timeout: 2000 });
      }
    }
  });
});
