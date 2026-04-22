import axios, { AxiosInstance, AxiosError } from "axios";
import { loadCredentials } from "../auth/credentials";
import { getDomain } from "./get-domain";

export const vipClient: AxiosInstance = axios.create({
  baseURL: getDomain().vipApi,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

vipClient.interceptors.request.use((config) => {
  const creds = loadCredentials();
  if (creds?.token) {
    config.headers.Authorization = `Bearer ${creds.token}`;
  }
  return config;
});

export function extractVipError(err: unknown): string {
  if (err instanceof AxiosError) {
    const msg = err.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string") return msg;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
