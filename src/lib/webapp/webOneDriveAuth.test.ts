import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  base64UrlEncode,
  generatePkce,
  generateRandomState,
  resolveClientId,
  resolveTenant,
  buildAuthorizeUrl,
  isTokenExpired,
  savePkceSession,
  loadPkceSession,
  exchangeCode,
  refreshAccessToken,
  SignInExpiredError,
  fetchUserProfile,
  DEFAULT_CLIENT_ID,
  DEFAULT_TENANT,
} from "./webOneDriveAuth";

describe("webOneDriveAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("base64UrlEncode encodes bytes into url-safe base64 without padding", () => {
    // 0xfb, 0xff, 0xfe -> +//+ in standard base64 -> -__- in url safe
    const bytes = new Uint8Array([251, 255, 254]);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).toBe("-__-");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("generatePkce creates valid 43-character verifier and challenge", async () => {
    const { verifier, challenge } = await generatePkce();
    expect(verifier.length).toBe(43);
    expect(challenge.length).toBe(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generateRandomState creates random url-safe string", () => {
    const state1 = generateRandomState(16);
    const state2 = generateRandomState(16);
    expect(state1).not.toBe(state2);
    expect(state1.length).toBe(22);
  });

  it("resolveClientId and resolveTenant support overrides and defaults", () => {
    expect(resolveClientId()).toBe(DEFAULT_CLIENT_ID);
    expect(resolveClientId({})).toBe(DEFAULT_CLIENT_ID);
    expect(resolveClientId({ clientIdOverride: "   " })).toBe(DEFAULT_CLIENT_ID);
    expect(resolveClientId({ clientIdOverride: "custom-id" })).toBe("custom-id");

    expect(resolveTenant()).toBe(DEFAULT_TENANT);
    expect(resolveTenant({})).toBe(DEFAULT_TENANT);
    expect(resolveTenant({ tenantIdOverride: "   " })).toBe(DEFAULT_TENANT);
    expect(resolveTenant({ tenantIdOverride: "custom-tenant" })).toBe("custom-tenant");
  });

  it("buildAuthorizeUrl properly constructs authorization URL", () => {
    const urlStr = buildAuthorizeUrl({
      tenant: "my-tenant",
      clientId: "my-client",
      redirectUri: "https://example.com/app",
      challenge: "test-challenge",
      state: "test-state",
    });

    const url = new URL(urlStr);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe("/my-tenant/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("my-client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/app");
    expect(url.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("test-state");
  });

  it("isTokenExpired respects the buffer", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isTokenExpired(now - 10)).toBe(true);
    expect(isTokenExpired(now + 30)).toBe(true); // within 60s buffer
    expect(isTokenExpired(now + 120)).toBe(false); // beyond 60s buffer
  });

  it("savePkceSession and loadPkceSession work and clear session on load", () => {
    const session = {
      verifier: "v123",
      state: "s456",
      redirectUri: "https://example.com",
      clientId: "c789",
      tenant: "common",
      timestamp: Date.now(),
    };

    savePkceSession(session);
    const loaded = loadPkceSession();
    expect(loaded).toEqual(session);

    // Should be cleaned up on second read
    const secondRead = loadPkceSession();
    expect(secondRead).toBeNull();
  });

  it("exchangeCode calls token endpoint with form-urlencoded params", async () => {
    const fakeResponse = {
      access_token: "mock-access-token",
      refresh_token: "mock-refresh-token",
      expires_in: 3600,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await exchangeCode({
      tenant: "common",
      clientId: "client-123",
      redirectUri: "https://example.com/callback",
      code: "auth-code-xyz",
      verifier: "pkce-verifier-abc",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(calledOptions.method).toBe("POST");
    expect(calledOptions.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(calledOptions.body).toContain("grant_type=authorization_code");
    expect(calledOptions.body).toContain("code=auth-code-xyz");
    expect(calledOptions.body).toContain("code_verifier=pkce-verifier-abc");

    expect(res.accessToken).toBe("mock-access-token");
    expect(res.refreshToken).toBe("mock-refresh-token");
    expect(res.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("refreshAccessToken sends refresh_token and preserves existing if omitted", async () => {
    const fakeResponse = {
      access_token: "new-access-token",
      expires_in: 7200,
      // refresh_token not returned by server
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await refreshAccessToken({
      tenant: "common",
      clientId: "client-123",
      refreshToken: "existing-refresh-token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, calledOptions] = fetchMock.mock.calls[0];
    expect(calledOptions.body).toContain("grant_type=refresh_token");
    expect(calledOptions.body).toContain("refresh_token=existing-refresh-token");

    expect(res.accessToken).toBe("new-access-token");
    expect(res.refreshToken).toBe("existing-refresh-token");
  });

  it("refreshAccessToken throws SignInExpiredError on invalid_grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => '{"error":"invalid_grant","error_description":"AADSTS700084: refresh token expired"}',
      }),
    );
    await expect(
      refreshAccessToken({ tenant: "common", clientId: "c", refreshToken: "old" }),
    ).rejects.toBeInstanceOf(SignInExpiredError);
  });

  it("fetchUserProfile retrieves display name and email", async () => {
    const fakeProfile = {
      displayName: "Alice Tester",
      mail: "alice@example.com",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeProfile,
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchUserProfile("test-token");
    expect(fetchMock).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: "Bearer test-token" },
    });
    expect(profile).toEqual({
      displayName: "Alice Tester",
      email: "alice@example.com",
    });
  });
});
