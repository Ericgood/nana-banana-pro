# Google OAuth + One-Tap Implementation Spec

## Overview

This document specifies how to add Google OAuth login and Google One-Tap auto-popup to the NANA Banana Pro project. The implementation uses Better-Auth's built-in Google social provider and its One-Tap plugin.

---

## 1. Google Cloud Console Setup

### 1.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Name: `NANA Banana Pro`

### 1.2 Configure Authorized Origins

Add these **Authorized JavaScript origins** (required for One-Tap):

| Environment | Origin |
|-------------|--------|
| Development | `http://localhost:4321` |
| Production  | `https://nanabananapro.com` |

### 1.3 Configure Authorized Redirect URIs

Add these **Authorized redirect URIs** (required for OAuth callback):

| Environment | Redirect URI |
|-------------|-------------|
| Development | `http://localhost:4321/api/auth/callback/google` |
| Production  | `https://nanabananapro.com/api/auth/callback/google` |

### 1.4 Configure OAuth Consent Screen

1. Go to **OAuth consent screen**
2. User Type: **External**
3. App name: `NANA Banana Pro`
4. User support email: your email
5. Scopes: `email`, `profile`, `openid` (defaults)
6. Publish the app (or add test users for development)

### 1.5 Copy Credentials

After creation, copy:
- **Client ID** (e.g., `123456789-abc.apps.googleusercontent.com`)
- **Client Secret** (e.g., `GOCSPX-...`)

---

## 2. Environment Variables

Add these to `.env` and set as Cloudflare Worker secrets:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
```

For Cloudflare Workers deployment:
```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

Also update `.env.example`:
```env
# Google OAuth (for social login + One-Tap)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
```

---

## 3. Backend Changes

### 3.1 Install/Verify Dependencies

No new packages needed. Better-Auth (`better-auth@^1.4.18`) already includes:
- `better-auth/plugins` - server-side `oneTap` plugin
- `better-auth/client/plugins` - client-side `oneTapClient` plugin
- Built-in Google social provider support

### 3.2 Update `src/lib/auth.ts`

Add the Google social provider and One-Tap plugin to the Better-Auth configuration:

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTap } from 'better-auth/plugins';
import { db } from './db';
import * as schema from './schema';

let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    const googleClientId = import.meta.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = import.meta.env.GOOGLE_CLIENT_SECRET;

    _auth = betterAuth({
      baseURL: import.meta.env.BETTER_AUTH_URL || 'http://localhost:4321',
      secret: import.meta.env.BETTER_AUTH_SECRET,
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema,
      }),
      emailAndPassword: {
        enabled: true,
      },
      socialProviders: {
        ...(googleClientId && googleClientSecret
          ? {
              google: {
                clientId: googleClientId,
                clientSecret: googleClientSecret,
              },
            }
          : {}),
      },
      plugins: [
        ...(googleClientId ? [oneTap()] : []),
      ],
      session: {
        cookieCache: {
          enabled: true,
          maxAge: 5 * 60,
        },
      },
    });
  }
  return _auth;
}

// Lazy proxy (unchanged)
type AuthInstance = ReturnType<typeof betterAuth>;
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    const instance = getAuth();
    return Reflect.get(instance, prop, receiver);
  },
});
```

Key points:
- `socialProviders.google` is only added when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- `oneTap()` server plugin is only added when `GOOGLE_CLIENT_ID` is set
- The existing `emailAndPassword` config remains unchanged
- The catch-all route at `src/pages/api/auth/[...all].ts` already handles `/api/auth/callback/google` automatically -- no changes needed there

### 3.3 Auth Callback Flow

Better-Auth handles the entire OAuth flow automatically:

1. Client calls `signIn.social({ provider: "google" })`
2. Better-Auth redirects browser to Google's OAuth consent page
3. User authorizes the app on Google
4. Google redirects back to `/api/auth/callback/google` with an authorization code
5. Better-Auth exchanges the code for tokens, creates/links the user account, creates a session
6. Browser is redirected to the `callbackURL` (default: `/`)

For One-Tap:
1. Client calls `authClient.oneTap()` which loads Google's GSI script
2. Google shows the One-Tap popup with the user's Google account
3. User taps to confirm
4. Google returns an ID token to Better-Auth's One-Tap endpoint
5. Better-Auth verifies the token, creates/links the user account, creates a session
6. Page redirects to `callbackURL` or custom `onSuccess` handler fires

### 3.4 Database: No Schema Changes Required

The existing `account` table already supports OAuth providers:
- `provider_id` stores `"google"`
- `account_id` stores the Google user ID
- `access_token`, `refresh_token`, `id_token` store OAuth tokens
- `scope` stores granted scopes

When a user signs in with Google:
- If the email matches an existing user, Better-Auth links the Google account to that user
- If no user exists, Better-Auth creates a new `user` row and a linked `account` row

---

## 4. Frontend Changes

### 4.1 Update `src/lib/auth-client.ts`

Add the One-Tap client plugin:

```typescript
import { createAuthClient } from 'better-auth/client';
import { oneTapClient } from 'better-auth/client/plugins';

// Base client for email sign-in (always available)
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;

// One-Tap enabled client (call getOneTapClient() when Google Client ID is available)
export function getOneTapClient(googleClientId: string) {
  return createAuthClient({
    plugins: [
      oneTapClient({
        clientId: googleClientId,
        autoSelect: false,
        cancelOnTapOutside: false,
        context: 'signin',
        promptOptions: {
          baseDelay: 1000,
          maxAttempts: 1,
        },
      }),
    ],
  });
}
```

### 4.2 Update Login Page (`src/pages/login.astro`)

Add a "Sign in with Google" button above or below the email form:

```html
<!-- Google Sign-In Button (add after the form, before the sign-up link) -->
<div class="relative my-6">
  <div class="absolute inset-0 flex items-center">
    <div class="w-full border-t border-white/10"></div>
  </div>
  <div class="relative flex justify-center text-sm">
    <span class="px-4 bg-brand-mid text-gray-400">or continue with</span>
  </div>
</div>

<button
  id="google-signin-btn"
  type="button"
  class="w-full py-3 bg-white hover:bg-gray-100 text-gray-800 font-semibold rounded-xl transition-all flex items-center justify-center gap-3"
>
  <svg class="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
  Sign in with Google
</button>
```

Client-side script addition:

```html
<script>
  import { signIn } from '../lib/auth-client';

  // Google Sign-In button handler
  document.getElementById('google-signin-btn')?.addEventListener('click', async () => {
    await signIn.social({
      provider: 'google',
      callbackURL: '/generate',
    });
  });
</script>
```

### 4.3 Update Sign Up Page (`src/pages/signup.astro`)

Add the same Google button with "Sign up with Google" label. The flow is identical -- Better-Auth automatically creates a new account if one doesn't exist.

### 4.4 Add One-Tap to Layout (`src/layouts/Layout.astro`)

Add the One-Tap initialization script to the Layout so it shows on all pages for unauthenticated users:

```html
<!-- Add before closing </body> tag -->
<script>
  // Google One-Tap auto-popup for unauthenticated users
  async function initOneTap() {
    try {
      // Check if user is already logged in
      const res = await fetch('/api/auth/get-session');
      const session = await res.json();
      if (session?.user) return; // Already signed in, skip One-Tap

      // Dynamically import and initialize One-Tap
      const { getOneTapClient } = await import('../lib/auth-client');

      // Fetch the Google Client ID from a meta tag or inline config
      const googleClientId = document.querySelector('meta[name="google-client-id"]')?.getAttribute('content');
      if (!googleClientId) return;

      const oneTapAuthClient = getOneTapClient(googleClientId);
      await oneTapAuthClient.oneTap({
        callbackURL: window.location.pathname,
      });
    } catch {
      // Silently handle One-Tap errors (user dismissed, FedCM errors, etc.)
    }
  }

  // Delay One-Tap to avoid competing with page load
  if (document.readyState === 'complete') {
    setTimeout(initOneTap, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(initOneTap, 1000));
  }
</script>
```

To pass the Google Client ID to the client, add a meta tag in the Layout's `<head>`:

```astro
---
const googleClientId = import.meta.env.GOOGLE_CLIENT_ID || '';
---
<!-- In <head> -->
{googleClientId && <meta name="google-client-id" content={googleClientId} />}
```

### 4.5 Ensure Free Credits for Google Sign-In Users

The existing `ensureFreeCredits()` call in `src/pages/api/generate.ts` and `src/pages/api/credits/balance.ts` already handles this. When a Google user first hits the generate page or fetches their balance, they automatically receive 5 free credits. No additional changes needed.

---

## 5. Complete OAuth Flow Diagrams

### 5.1 Google OAuth Button Flow

```
User clicks "Sign in with Google"
  -> signIn.social({ provider: "google" })
  -> Browser redirects to Google OAuth consent page
  -> User selects Google account & authorizes
  -> Google redirects to /api/auth/callback/google?code=xxx
  -> Better-Auth exchanges code for tokens
  -> Better-Auth creates/links user + account in DB
  -> Better-Auth creates session (sets cookie)
  -> Browser redirects to callbackURL (/generate)
  -> Middleware reads session -> user is authenticated
```

### 5.2 Google One-Tap Flow

```
Page loads -> initOneTap() runs
  -> Checks if user has session (skip if yes)
  -> Loads Google GSI client library
  -> Google shows One-Tap popup (if user has a Google session)
  -> User taps to confirm
  -> Google returns ID token to Better-Auth One-Tap endpoint
  -> Better-Auth verifies token, creates/links user
  -> Session cookie is set
  -> Page redirects to callbackURL
```

---

## 6. Files to Modify Summary

| File | Change |
|------|--------|
| `src/lib/auth.ts` | Add `socialProviders.google` and `oneTap()` plugin |
| `src/lib/auth-client.ts` | Add `oneTapClient` plugin and `getOneTapClient()` export |
| `src/pages/login.astro` | Add Google sign-in button + click handler |
| `src/pages/signup.astro` | Add Google sign-up button + click handler |
| `src/layouts/Layout.astro` | Add `<meta>` tag for client ID + One-Tap init script |
| `.env` / `.env.example` | Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` |
| `wrangler.toml` | Document new secrets in comments |

No changes needed to:
- `src/lib/schema.ts` (existing `account` table handles OAuth)
- `src/pages/api/auth/[...all].ts` (catch-all already routes callbacks)
- `src/middleware.ts` (session handling unchanged)
- `src/lib/credits.ts` (free credits auto-granted on first use)

---

## 7. Testing Checklist

- [ ] Google OAuth button redirects to Google consent page
- [ ] After Google consent, user is redirected back and session is created
- [ ] New Google user gets `user` + `account` rows in DB
- [ ] Existing email user signing in with Google links the accounts
- [ ] Google One-Tap popup shows on pages for unauthenticated users
- [ ] One-Tap popup does NOT show for already authenticated users
- [ ] One-Tap creates session and redirects correctly
- [ ] Credits are granted to new Google users (5 free credits)
- [ ] Sign out works correctly for Google-authenticated users
- [ ] Works in development (localhost:4321) and production

---

## 8. Reference Implementation

The implementation patterns are derived from the shipany-template-two project:
- **Server config**: `/tmp/shipany-template-two/src/core/auth/config.ts` (lines 203-208, 212-231)
- **Client config**: `/tmp/shipany-template-two/src/core/auth/client.ts` (lines 1, 100-144)
- **Social providers UI**: `/tmp/shipany-template-two/src/shared/blocks/sign/social-providers.tsx`
- **One-Tap trigger**: `/tmp/shipany-template-two/src/shared/contexts/app.tsx` (lines 121-144)
- **One-Tap guard**: `/tmp/shipany-template-two/src/shared/blocks/sign/sign-user.tsx` (lines 87-99)

Better-Auth documentation:
- [Google OAuth](https://www.better-auth.com/docs/authentication/google)
- [One-Tap Plugin](https://www.better-auth.com/docs/plugins/one-tap)
