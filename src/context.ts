import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  token: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestToken(): string {
  return requestContext.getStore()?.token ?? "";
}
