import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  isTokenExpired,
  getCredentialsPath,
} from "../auth/credentials";
import { screenerClient, extractError } from "../api/screener.client";

export function registerAuthTools(server: McpServer) {

  // ── request_otp ───────────────────────────────────────────────────────────────
  server.tool(
    "request_otp",
    "Sends a sign-in OTP to the employer's email. Call this when the user wants to sign in or when requireAuth fails. After calling this, ask the user for the OTP code and call verify_otp.",
    {
      email: z.string().email().describe("Employer's registered Hyring email address"),
    },
    async ({ email }) => {
      try {
        await screenerClient.post("/employer/cat/sign-in/initiate-otp", {
          email,
          isRetry:  false,
          isPhone:  false,
        });

        return {
          content: [{
            type: "text" as const,
            text: `OTP sent to ${email}.\nPlease check your inbox and share the code to continue.`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error sending OTP: ${extractError(err)}` }] };
      }
    }
  );

  // ── verify_otp ────────────────────────────────────────────────────────────────
  server.tool(
    "verify_otp",
    "Verifies the OTP code and signs the employer in. Saves the session token securely. Call this after the user shares the OTP from request_otp.",
    {
      email: z.string().email().describe("Employer's email (same as used in request_otp)"),
      otp:   z.string().describe("The OTP code received via email"),
    },
    async ({ email, otp }) => {
      try {
        const res = await screenerClient.post("/employer/cat/sign-in/verify-otp", {
          email,
          otp,
          isPhone: false,
        });

        const token = res.data?.access_token ?? res.data?.data?.access_token;

        if (!token) {
          return { content: [{ type: "text" as const, text: "Sign-in failed: no token returned. Please try again." }] };
        }

        saveCredentials(email, token);

        // Fetch employer profile to confirm identity
        try {
          const profile = await screenerClient.get("/employer/cat/me");
          const p = profile.data?.data ?? profile.data;
          const name = `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || "N/A";
          const org  = p?.organizationName ?? "N/A";

          return {
            content: [{
              type: "text" as const,
              text: `Signed in successfully.\n\nName: ${name}\nEmail: ${email}\nOrganization: ${org}\n\nSession saved. You can now use all Hyring tools.`,
            }],
          };
        } catch {
          // Profile fetch failed but login succeeded — still fine
          return {
            content: [{
              type: "text" as const,
              text: `Signed in successfully as ${email}.\nSession saved. You can now use all Hyring tools.`,
            }],
          };
        }
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Sign-in failed: ${extractError(err)}` }] };
      }
    }
  );

  // ── whoami ────────────────────────────────────────────────────────────────────
  server.tool(
    "whoami",
    "Returns the currently signed-in employer profile. Use this to check if the user is logged in before performing actions.",
    {},
    async () => {
      try {
        const creds = loadCredentials();

        if (!creds?.token) {
          return {
            content: [{
              type: "text" as const,
              text: "Not signed in. Please provide your email so I can send you an OTP to sign in.",
            }],
          };
        }

        if (isTokenExpired(creds.token)) {
          return {
            content: [{
              type: "text" as const,
              text: `Session expired (last signed in as ${creds.email}).\nPlease provide your email so I can send a new OTP.`,
            }],
          };
        }

        const res = await screenerClient.get("/employer/cat/me");
        const profile = res.data?.data ?? res.data;
        const name = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim() || "N/A";

        const text = [
          `Signed in as:`,
          `Email:        ${profile?.email ?? creds.email}`,
          `Name:         ${name}`,
          `Employer ID:  ${profile?.employerId ?? profile?.id ?? "N/A"}`,
          `Organization: ${profile?.organizationName ?? "N/A"}`,
          `Session saved: ${new Date(creds.savedAt).toLocaleString()}`,
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${extractError(err)}` }] };
      }
    }
  );

  // ── logout ────────────────────────────────────────────────────────────────────
  server.tool(
    "logout",
    "Signs out the current employer and removes the saved session.",
    {},
    async () => {
      const creds = loadCredentials();
      if (!creds) {
        return { content: [{ type: "text" as const, text: "No active session to sign out from." }] };
      }
      clearCredentials();
      return {
        content: [{
          type: "text" as const,
          text: `Signed out (${creds.email}). Session removed from ${getCredentialsPath()}`,
        }],
      };
    }
  );

  // ── token_status ──────────────────────────────────────────────────────────────
  server.tool(
    "token_status",
    "Checks the current session status — whether signed in, expired, or not logged in.",
    {},
    async () => {
      const creds = loadCredentials();

      if (!creds?.token) {
        return {
          content: [{
            type: "text" as const,
            text: "Status: NOT SIGNED IN\n\nUse request_otp with your email to sign in.",
          }],
        };
      }

      const expired = isTokenExpired(creds.token);
      const savedAt = new Date(creds.savedAt).toLocaleString();

      if (expired) {
        return {
          content: [{
            type: "text" as const,
            text: `Status: SESSION EXPIRED\n\nLast signed in as: ${creds.email}\nSaved at: ${savedAt}\n\nUse request_otp to sign in again.`,
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Status: SIGNED IN\n\nEmail:    ${creds.email}\nSaved at: ${savedAt}\nCredentials file: ${getCredentialsPath()}`,
        }],
      };
    }
  );
}
