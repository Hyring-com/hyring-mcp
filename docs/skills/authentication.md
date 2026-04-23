# Skill: Authentication

**MCP Tools:** `request_otp`, `verify_otp`, `whoami`, `logout`, `token_status`

---

## How Authentication Works

The MCP uses a file-based credential store at `~/.hyring/credentials.json`. The employer signs in via OTP (no password), and the JWT token is saved locally. All subsequent API calls use this token.

---

## Sign-In Flow

```
1. request_otp(email)
   → POST /employer/cat/sign-in/initiate-otp
   → OTP sent to employer's email

2. verify_otp(email, otp)
   → POST /employer/cat/sign-in/verify-otp
   → Returns JWT token
   → Saved to ~/.hyring/credentials.json
   → employerId extracted from JWT payload
```

---

## Token Storage

**File:** `~/.hyring/credentials.json`

**Format:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "email": "employer@company.com",
  "savedAt": "2024-01-15T10:30:00.000Z"
}
```

**Permissions:** `0o600` (owner read/write only - secure)

---

## Token Usage

Every API request automatically includes:
```
Authorization: Bearer {token}
```

This is added by the Axios interceptor - no manual work needed per request.

The `employerId` is extracted from the JWT payload (no separate API call needed):
```javascript
const decoded = jwt.decode(token);
const employerId = decoded.sub; // or decoded.employerId
```

---

## Token Validation

### `token_status`

Checks the local credential file:
1. File exists? → signed in
2. JWT expiry valid? → active session
3. JWT expired? → needs re-login

**Does NOT call the server** - purely local check.

### States Returned
| State | Meaning |
|-------|---------|
| `signed_in` | Valid token, can make API calls |
| `expired` | Token expired, must sign in again |
| `not_signed_in` | No credentials file found |

---

## Profile Check

### `whoami`

**Endpoint:** GET `/employer/cat/me`

Returns employer profile:
```json
{
  "employerId": 123,
  "email": "employer@company.com",
  "fullName": "Tech Corp",
  "organization": "Tech Corporation",
  "profilePicture": "https://...",
  "plan": "PROFESSIONAL"
}
```

---

## Sign Out

### `logout`

1. Deletes `~/.hyring/credentials.json`
2. Returns confirmation message

All subsequent API calls will fail until signed in again.

---

## Auth Guard (`authedTool`)

Every MCP tool (except auth tools) is wrapped with `authedTool`. This:
1. Checks if credentials file exists
2. Verifies JWT is not expired
3. Returns user-friendly error if not authenticated

**Error messages are intentionally instruction-style** (not "Error: ...") to guide the AI agent: e.g., "Please sign in first using `request_otp` then `verify_otp`"

---

## Multi-Product Auth

One single sign-in covers all products:
- Main screener (port 5000)
- Phone screener (port 5003)
- VIP (port 5005)

All three API clients use the same JWT token. The employer's account has access to all products they're subscribed to.

---

## Team Management

Employers can have child accounts (team members):
- Identified in JWT as `HyringScreenerTeamManagement` entries
- Some team members have `VIEWONLY` role (read-only)
- The MCP currently signs in as the main employer

**⚠️ Note:** Child account (team member) sign-in is not explicitly supported by MCP auth tools. If a team member uses the MCP, they'd sign in with their own credentials - but the `employerId` extracted would be the child account's ID, not the main employer's. Some API endpoints might behave differently.
