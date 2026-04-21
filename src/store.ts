interface Session {
  token: string;
  email: string;
  employerId: number;
}

let session: Session | null = null;

export function setSession(email: string, token: string, employerId: number) {
  session = { email, token, employerId };
}

export function getToken(): string | null {
  return session?.token ?? null;
}

export function getEmail(): string | null {
  return session?.email ?? null;
}

export function getEmployerId(): number | null {
  return session?.employerId ?? null;
}

export function clearSession() {
  session = null;
}

export function isLoggedIn(): boolean {
  return session !== null;
}
