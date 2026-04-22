import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const CREDENTIALS_DIR = path.join(os.homedir(), ".hyring");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

export interface Credentials {
  token: string;
  email: string;
  savedAt: string;
}

export function saveCredentials(email: string, token: string): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }
  const creds: Credentials = {
    token,
    email,
    savedAt: new Date().toISOString(),
  };
  // Write with owner-read-only permissions (600)
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

export function loadCredentials(): Credentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null;
    return JSON.parse(
      fs.readFileSync(CREDENTIALS_FILE, "utf-8"),
    ) as Credentials;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE);
  }
}

/**
 * Decode JWT exp claim without verifying signature.
 * Returns true if the token is expired or unreadable.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    );
    if (!payload.exp) return false; // no expiry = never expires
    return Date.now() >= (payload.exp as number) * 1000;
  } catch {
    return true;
  }
}

export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}
