import type { OneDriveAccount, OneDriveAdvancedConfig } from "../types";

export const DEFAULT_CLIENT_ID = "9b008168-6c13-4f0f-9531-2313e7613ccb";
export const DEFAULT_TENANT = "common";
export const SCOPES = "Files.ReadWrite offline_access User.Read";

export const SIGN_IN_EXPIRED_MESSAGE =
  "Your OneDrive sign-in expired. Open Settings and choose Connect Microsoft Account to sign in again.";

export class SignInExpiredError extends Error {
  constructor() {
    super(SIGN_IN_EXPIRED_MESSAGE);
    this.name = "SignInExpiredError";
  }
}

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in seconds
  account?: OneDriveAccount;
}

export interface PkceSession {
  verifier: string;
  state: string;
  redirectUri: string;
  clientId: string;
  tenant: string;
  timestamp: number;
}

/**
 * Encodes a Uint8Array into a base64url string (RFC 4648 §5, URL-safe without padding).
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Computes SHA-256 digest of an ASCII/UTF-8 string.
 */
export async function sha256(str: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Generates RFC 7636 PKCE code verifier and S256 code challenge.
 */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const verifier = base64UrlEncode(randomBytes);
  const hash = await sha256(verifier);
  const challenge = base64UrlEncode(hash);
  return { verifier, challenge };
}

/**
 * Generates a random URL-safe string for OAuth state parameter.
 */
export function generateRandomState(bytesCount = 16): string {
  const randomBytes = new Uint8Array(bytesCount);
  crypto.getRandomValues(randomBytes);
  return base64UrlEncode(randomBytes);
}

/**
 * Resolves client ID from advanced config or falls back to default.
 */
export function resolveClientId(advanced?: OneDriveAdvancedConfig): string {
  const trimmed = advanced?.clientIdOverride?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CLIENT_ID;
}

/**
 * Resolves tenant from advanced config or falls back to 'common'.
 */
export function resolveTenant(advanced?: OneDriveAdvancedConfig): string {
  const trimmed = advanced?.tenantIdOverride?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_TENANT;
}

/**
 * Constructs the Microsoft OAuth authorization URL.
 */
export function buildAuthorizeUrl(params: {
  tenant?: string;
  clientId?: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const tenant = params.tenant || DEFAULT_TENANT;
  const clientId = params.clientId || DEFAULT_CLIENT_ID;
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  return url.toString();
}

/**
 * Returns the token endpoint URL for a given tenant.
 */
export function tokenEndpoint(tenant?: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant || DEFAULT_TENANT)}/oauth2/v2.0/token`;
}

/**
 * Returns the clean redirect URI matching the current page origin and path.
 */
export function getRedirectUri(): string {
  if (typeof window === "undefined") return "http://localhost/";
  return `${window.location.origin}${window.location.pathname}`;
}

const PKCE_STORAGE_KEY = "chrononote_pkce_session";

/**
 * Saves PKCE state to session storage (with local storage fallback) before full-page redirect.
 */
export function savePkceSession(session: PkceSession): void {
  const serialized = JSON.stringify(session);
  try {
    sessionStorage.setItem(PKCE_STORAGE_KEY, serialized);
  } catch {
    // ignore sessionStorage errors in restricted environments
  }
  try {
    localStorage.setItem(PKCE_STORAGE_KEY, serialized);
  } catch {
    // ignore
  }
}

/**
 * Retrieves and clears saved PKCE state after returning from redirect.
 */
export function loadPkceSession(): PkceSession | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PKCE_STORAGE_KEY);
    sessionStorage.removeItem(PKCE_STORAGE_KEY);
  } catch {
    // ignore
  }
  if (!raw) {
    try {
      raw = localStorage.getItem(PKCE_STORAGE_KEY);
      localStorage.removeItem(PKCE_STORAGE_KEY);
    } catch {
      // ignore
    }
  } else {
    try {
      localStorage.removeItem(PKCE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  if (!raw) return null;
  try {
    return JSON.parse(raw) as PkceSession;
  } catch {
    return null;
  }
}

/**
 * Initiates the PKCE OAuth redirect.
 */
export async function initiateLogin(advanced?: OneDriveAdvancedConfig): Promise<void> {
  const clientId = resolveClientId(advanced);
  const tenant = resolveTenant(advanced);
  const redirectUri = getRedirectUri();
  const { verifier, challenge } = await generatePkce();
  const state = generateRandomState();

  savePkceSession({
    verifier,
    state,
    redirectUri,
    clientId,
    tenant,
    timestamp: Date.now(),
  });

  const authUrl = buildAuthorizeUrl({
    tenant,
    clientId,
    redirectUri,
    challenge,
    state,
  });

  window.location.href = authUrl;
}

/**
 * Checks if stored authentication has expired or is expiring soon.
 */
export function isTokenExpired(expiresAt: number, bufferSeconds = 60): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now + bufferSeconds >= expiresAt;
}

/**
 * Exchanges authorization code for access and refresh tokens.
 */
export async function exchangeCode(params: {
  tenant?: string;
  clientId?: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const tenant = params.tenant || DEFAULT_TENANT;
  const clientId = params.clientId || DEFAULT_CLIENT_ID;
  const url = tokenEndpoint(tenant);

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`OAuth token exchange failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  if (!data.refresh_token) {
    throw new Error("Microsoft did not return a refresh token — check that offline_access scope is requested.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: nowSec + (data.expires_in ?? 3600),
  };
}

/**
 * Refreshes an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(params: {
  tenant?: string;
  clientId?: string;
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const tenant = params.tenant || DEFAULT_TENANT;
  const clientId = params.clientId || DEFAULT_CLIENT_ID;
  const url = tokenEndpoint(tenant);

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    scope: SCOPES,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    // invalid_grant / interaction_required: the refresh token is expired or revoked
    // (SPA refresh tokens last ~24h), so only a fresh sign-in helps.
    if ((resp.status === 400 || resp.status === 401) && /invalid_grant|interaction_required/.test(errText)) {
      throw new SignInExpiredError();
    }
    throw new Error(`OAuth token refresh failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || params.refreshToken,
    expiresAt: nowSec + (data.expires_in ?? 3600),
  };
}

/**
 * Fetches user profile from Microsoft Graph /v1.0/me.
 */
export async function fetchUserProfile(accessToken: string): Promise<OneDriveAccount> {
  const resp = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Failed to fetch user profile (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const email = data.mail || data.userPrincipalName || "";
  const displayName = data.displayName || "";
  return { email, displayName };
}
