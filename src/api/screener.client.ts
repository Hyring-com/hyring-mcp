import axios, { AxiosInstance, AxiosError } from "axios";
import { loadCredentials, isTokenExpired } from "../auth/credentials";

const BASE_URL = process.env.SCREENER_API ?? "http://localhost:5000/api/v1";

export const screenerClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

screenerClient.interceptors.request.use((config) => {
  const token = getRequestToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Returns the current token from the credentials file.
 * Falls back to empty string if not logged in.
 */
export function getRequestToken(): string {
  return loadCredentials()?.token ?? "";
}

/**
 * Throws a descriptive error if the employer is not logged in or token is expired.
 */
export function requireAuth(): void {
  const creds = loadCredentials();

  if (!creds?.token) {
    throw new Error(
      "Not logged in. Ask the user for their email address, then use request_otp to send a sign-in code."
    );
  }

  if (isTokenExpired(creds.token)) {
    throw new Error(
      `Session expired (signed in as ${creds.email}). Ask the user for their email and use request_otp to sign in again.`
    );
  }
}

export async function getEmployerIdFromAPI(): Promise<number> {
  const res = await screenerClient.get("/employer/cat/me");
  const profile = res.data?.data ?? res.data;
  const employerId = profile?.employerId ?? profile?.id;
  if (!employerId) throw new Error("Could not resolve employer ID from token.");
  return employerId;
}

export function extractError(err: unknown): string {
  if (err instanceof AxiosError) {
    const msg = err.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string") return msg;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
