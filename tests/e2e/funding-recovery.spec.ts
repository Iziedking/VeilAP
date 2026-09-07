import { expect, test } from "@playwright/test";
import { fakeWalletAddress, installFakeWallet } from "../fixtures/wallet";

test("publishes the selected ranked split and exact amount with funding optional", async ({ page }) => {
  await installFakeWallet(page);
  let seasonPayload: Record<string, unknown> | null = null;
  let poolPayload: Record<string, unknown> | null = null;
  const season = { id: "rank-season", projectId: "rank-project", name: "Eight winners", status: "open", entryMode: "open", rules: { rewardPolicy: "optional" } };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200;
    let body: unknown = { ok: true, value: null };
    if (path === "/api/auth/session") { status = 401; body = { ok: false, code: "SESSION_MISSING" }; }
    else if (path === "/api/auth/challenge") body = { ok: true, challenge: { typedData: { domain: {}, types: {}, primaryType: "VeilArenaSession", message: {} } } };
    else if (path === "/api/auth/verify") body = { ok: true, walletAddress: fakeWalletAddress };
    else if (path === "/api/starknet/rpc") body = { result: "0x0" };
    else if (path === "/api/projects") body = { ok: true, value: { id: "rank-project" } };
    else if (path.endsWith("/seasons") && request.method() === "POST") { seasonPayload = request.postDataJSON(); body = { ok: true, value: season }; }
    else if (path.endsWith("/seasons")) body = { ok: true, value: [season] };
    else if (path.endsWith("/strategies")) body = { ok: true, value: [] };
    else if (path.endsWith("/rank-season")) body = { ok: true, value: { season, entries: [], matches: [] } };
    else if (path.endsWith("/prize-pool")) {
      if (request.method() === "POST") poolPayload = request.postDataJSON();
      body = { ok: true, value: { id: "rank-pool", ...poolPayload, status: "funding_pending" } };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/arena-console");
  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await page.getByRole("button", { name: /Public freepass/ }).click();
  await expect(page.getByRole("checkbox", { name: /Fund this competition/ })).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: /^AMOUNT/ })).toHaveCount(0);
  await page.getByText("Fund this competition", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Fund this competition/ })).toBeChecked();
  await expect(page.getByRole("textbox", { name: /^AMOUNT/ })).toHaveValue("");
  await page.getByLabel("SEASON NAME").fill("Eight winners");
  await page.getByRole("textbox", { name: /^AMOUNT/ }).fill("2000");
  await page.getByLabel("PAYOUT", { exact: false }).selectOption("top_8");
  await page.getByRole("button", { name: "PUBLISH COMPETITION" }).click();
  await expect(page).toHaveURL(/\/arena-console\/rank-project\/rank-season$/);
  expect(seasonPayload).toMatchObject({ rewardDistribution: "top_8", templateId: "playground" });
  expect(poolPayload).toMatchObject({ tokenSymbol: "USDC", amountMinor: "2000000000" });
  expect(await page.evaluate(() => sessionStorage.getItem("test-wallet-invocations"))).toBeNull();
});

test("funds the chosen amount through WalletAccountV6 and resumes confirmation after reload without another deposit", async ({ page }) => {
  await installFakeWallet(page);
  const projectId = "funding-project";
  const seasonId = "funding-season";
  const season = { id: seasonId, projectId, name: "Funding recovery", status: "open", entryMode: "invite_only", maxEntries: 2, locksAt: "2099-01-01T00:00:00Z", rules: { rewardPolicy: "optional" } };
  const pool = { id: "funding-pool", projectId, seasonId, tokenAddress: "0x123", tokenSymbol: "USDC", poolAddress: "0x456", amountMinor: "5000000", status: "funding_pending" };
  let confirmations = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200;
    let body: unknown = { ok: true, value: null };
    if (path === "/api/auth/session") { status = 401; body = { ok: false, code: "SESSION_MISSING" }; }
    else if (path === "/api/auth/challenge") body = { ok: true, challenge: { typedData: { domain: {}, types: {}, primaryType: "VeilArenaSession", message: {} } } };
    else if (path === "/api/auth/verify") body = { ok: true, walletAddress: fakeWalletAddress };
    else if (path === "/api/starknet/rpc") body = { result: "0x0" };
    else if (path.endsWith("/pool-fee")) body = { ok: true, value: { feeMinor: "6000000000000000000", blockNumber: 1, fetchedAt: new Date().toISOString() } };
    else if (path.endsWith("/strategies")) body = { ok: true, value: [] };
    else if (path.endsWith("/seasons")) body = { ok: true, value: [season] };
    else if (path.endsWith(`/${seasonId}`)) body = { ok: true, value: { season, entries: [], matches: [] } };
    else if (path.endsWith("/prize-pool")) body = { ok: true, value: pool };
    else if (path.endsWith("/funding") && request.method() === "GET") body = { ok: true, value: { ...pool, poolId: pool.id, network: "SN_MAIN", operation: "strk20_shield", recipient: fakeWalletAddress, planDigest: "test-plan" } };
    else if (path.endsWith("/funding")) {
      const payload = request.postDataJSON();
      expect(payload.authorization.amountMinor).toBe("5000000");
      expect(payload.authorization.transactionHash).toBe("0xabc123");
      confirmations++;
      if (confirmations === 1) { status = 409; body = { ok: false, code: "TRANSACTION_NOT_CONFIRMED" }; }
      else body = { ok: true, value: { ...pool, status: "funded" } };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/arena-console/${projectId}/${seasonId}`);
  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText(/Current pool fee: 6 STRK/)).toBeVisible();
  await expect(page.getByRole("button", { name: "CREATE JOIN LINK" })).toHaveCount(0);
  await page.getByRole("button", { name: "FUND REWARD" }).click();
  await expect(page.getByRole("button", { name: "VERIFY FUNDING" })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("test-wallet-actions")!))).toEqual([{ type: "deposit", token: "0x123", amount: "0x4c4b40" }]);
  await expect(page.getByRole("button", { name: "FUND REWARD" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await page.getByRole("button", { name: "VERIFY FUNDING" }).click();
  await expect(page.getByRole("button", { name: "CREATE JOIN LINK" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("test-wallet-invocations"))).toBe("1");
  expect(confirmations).toBe(2);
});

test("restores an outstanding payout receipt without offering another transfer", async ({ page }) => {
  await installFakeWallet(page);
  await page.addInitScript(() => sessionStorage.setItem("veil-arena:settlement:payout-pool:0x1", "0xabc123"));
  const season = { id: "payout-season", projectId: "payout-project", name: "Payout recovery", status: "locked", entryMode: "open" };
  const pool = { id: "payout-pool", projectId: season.projectId, seasonId: season.id, tokenAddress: "0x123", tokenSymbol: "USDC", poolAddress: "0x456", amountMinor: "5000000", winnerAgentId: "WINNER", status: "settlement_pending" };
  let confirmed = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200;
    let body: unknown = { ok: true, value: null };
    if (path === "/api/auth/session") { status = 401; body = { ok: false, code: "SESSION_MISSING" }; }
    else if (path === "/api/auth/challenge") body = { ok: true, challenge: { typedData: { domain: {}, types: {}, primaryType: "VeilArenaSession", message: {} } } };
    else if (path === "/api/auth/verify") body = { ok: true, walletAddress: fakeWalletAddress };
    else if (path === "/api/starknet/rpc") body = { result: "0x0" };
    else if (path.endsWith("/seasons")) body = { ok: true, value: [season] };
    else if (path.endsWith("/strategies")) body = { ok: true, value: [] };
    else if (path.endsWith("/payout-season")) body = { ok: true, value: { season, entries: [], matches: [] } };
    else if (path.endsWith("/prize-pool")) body = { ok: true, value: pool };
    else if (path.endsWith("/settlement") && request.method() === "GET") body = { ok: true, value: { ...pool, poolId: pool.id, network: "SN_MAIN", operation: "strk20_transfer", recipient: "0x2", planDigest: "payout-plan" } };
    else if (path.endsWith("/settlement")) {
      expect(request.postDataJSON().authorization.transactionHash).toBe("0xabc123");
      confirmed = true;
      body = { ok: true, value: { ...pool, status: "settled" } };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/arena-console/payout-project/payout-season");
  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByLabel("SETTLEMENT TRANSACTION HASH")).toHaveValue("0xabc123");
  await expect(page.getByRole("button", { name: "OPEN WALLET" })).toHaveCount(0);
  await page.getByRole("button", { name: "VERIFY PAYMENT" }).click();
  await expect(page.getByText("SETTLEMENT COMPLETE", { exact: true })).toBeVisible();
  expect(confirmed).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("test-wallet-invocations"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("veil-arena:settlement:payout-pool:0x1"))).toBeNull();
});

test("sound is recognizable, starts on explicit enable and stops on mute", async ({ page }) => {
  await page.goto("/arena");
  const toggle = page.getByRole("button", { name: "Turn sound on" });
  await expect(toggle.locator("svg")).toBeVisible();
  await toggle.click();
  await expect(page.getByRole("button", { name: "Turn sound off" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator("audio[data-veil-arena-music]").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  await page.getByRole("button", { name: "Turn sound off" }).click();
  await expect.poll(() => page.locator("audio[data-veil-arena-music]").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Turn sound on" })).toHaveAttribute("aria-pressed", "false");
});
