# NANA Banana Pro - Project Architecture

## 1. Overview

NANA Banana Pro is an AI-powered image generation web application. Users describe images via text prompts (optionally with a reference image and style), and the app generates images using Google's Gemini API. The app includes user authentication, a credit-based payment system via Stripe, and deploys on Cloudflare Workers.

**Live URL**: https://nanabananapro.com

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Astro | ^5.7.0 |
| Styling | Tailwind CSS | ^3.4.0 |
| Authentication | Better-Auth | ^1.4.18 |
| Database ORM | Drizzle ORM | ^0.45.1 |
| Database Driver | postgres (pg) | ^3.4.8 |
| Database | Supabase PostgreSQL | - |
| Payments | Stripe | ^20.3.1 |
| AI Image Generation | Google AI Studio (Gemini) | gemini-3-pro-image-preview |
| Deployment | Cloudflare Workers | wrangler ^4.63.0 |
| Adapter | @astrojs/cloudflare | ^12.6.12 |

---

## 3. Project Structure

```
nana-banana-pro/
├── src/
│   ├── components/              # Astro UI components
│   │   ├── FAQ.astro            # FAQ accordion section (6 items)
│   │   ├── Features.astro       # Feature grid (6 cards)
│   │   ├── Footer.astro         # Site footer with nav links
│   │   ├── Header.astro         # Fixed header with nav, auth state, credits display
│   │   ├── Hero.astro           # Landing hero with CTA buttons
│   │   ├── HowItWorks.astro     # 3-step guide section
│   │   └── ImageGenerator.astro # Full image generation UI (prompt, upload, style, result)
│   ├── content/
│   │   └── marketing.json       # Marketing copy and structured content data
│   ├── layouts/
│   │   └── Layout.astro         # Base HTML layout (meta, OG, fonts, structured data)
│   ├── lib/
│   │   ├── auth.ts              # Better-Auth server config (lazy-initialized singleton)
│   │   ├── auth-client.ts       # Better-Auth client (signIn, signUp, signOut, useSession)
│   │   ├── credits.ts           # Credit system logic (grant, consume, balance, FIFO)
│   │   ├── db.ts                # Drizzle ORM database connection (lazy proxy)
│   │   ├── pricing.ts           # Pricing plans definition (Free, Starter, Pro)
│   │   ├── schema.ts            # Drizzle database schema (6 tables)
│   │   └── stripe.ts            # Stripe client initialization (lazy singleton)
│   ├── pages/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...all].ts  # Better-Auth catch-all API handler
│   │   │   ├── credits/
│   │   │   │   └── balance.ts   # GET: returns user's credit balance
│   │   │   ├── payment/
│   │   │   │   ├── checkout.ts  # POST: creates Stripe checkout session
│   │   │   │   └── webhook.ts   # POST: Stripe webhook handler
│   │   │   ├── generate.ts      # POST: AI image generation endpoint
│   │   │   └── health.ts        # GET: health check
│   │   ├── payment/
│   │   │   ├── cancel.astro     # Payment cancellation confirmation page
│   │   │   └── success.astro    # Payment success confirmation page
│   │   ├── generate.astro       # Image generation page (protected)
│   │   ├── index.astro          # Landing/home page
│   │   ├── login.astro          # Login page (email/password)
│   │   ├── pricing.astro        # Pricing page with 3 plan cards
│   │   ├── signup.astro         # Sign up page (name/email/password)
│   │   └── sitemap.xml.ts       # Dynamic sitemap generator
│   ├── env.d.ts                 # TypeScript type declarations for Astro.locals
│   └── middleware.ts            # Astro middleware (session + route protection)
├── data/
│   └── nana-banana.db           # Local SQLite DB file (development artifact)
├── drizzle/
│   ├── 0000_perpetual_molten_man.sql  # Initial migration SQL
│   └── meta/
│       ├── _journal.json        # Drizzle migration journal
│       └── 0000_snapshot.json   # Schema snapshot
├── public/
│   └── robots.txt               # SEO robots directives
├── .env                         # Environment variables (gitignored)
├── .env.example                 # Environment variable template
├── .gitignore                   # Git ignore rules
├── astro.config.mjs             # Astro framework configuration
├── drizzle.config.ts            # Drizzle Kit configuration
├── package.json                 # Dependencies and scripts
├── tailwind.config.mjs          # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── wrangler.toml                # Cloudflare Workers deployment config
```

---

## 4. Authentication System

### 4.1 Technology

Uses **Better-Auth** with email/password authentication, backed by Drizzle ORM adapter on PostgreSQL.

### 4.2 Server Configuration (`src/lib/auth.ts`)

- Lazy-initialized singleton via `getAuth()` function
- Exported as a Proxy (`auth`) so `import { auth }` works without eager initialization
- Uses `drizzleAdapter` with `provider: 'pg'` and the full Drizzle schema
- `emailAndPassword.enabled: true`
- Session cookie caching: enabled, maxAge 5 minutes
- `baseURL` from `BETTER_AUTH_URL` env var (defaults to `http://localhost:4321`)

### 4.3 Client Configuration (`src/lib/auth-client.ts`)

- Simple `createAuthClient()` with no custom configuration
- Exports: `authClient`, `signIn`, `signUp`, `signOut`, `useSession`

### 4.4 API Route (`src/pages/api/auth/[...all].ts`)

- Catch-all route that delegates to `getAuth().handler(ctx.request)`
- Handles all Better-Auth endpoints: sign-in, sign-up, sign-out, get-session, callbacks
- `prerender = false` (server-side rendered)

### 4.5 Middleware (`src/middleware.ts`)

- Runs on all non-API, non-static routes
- Attempts to fetch session via `getAuth().api.getSession()`
- If session exists, populates `context.locals.user` and `context.locals.session`
- Protected routes: `['/generate']` - redirects to `/login` if unauthenticated
- Silently catches auth errors (for build-time prerendering compatibility)

### 4.6 Session Flow

1. User submits login form -> `signIn.email({ email, password })` from client
2. Better-Auth validates credentials against `account` table
3. Creates `session` row, sets HTTP-only session cookie
4. Subsequent requests: middleware reads session cookie -> populates `locals.user`
5. Sign out: POST to `/api/auth/sign-out` -> clears session

### 4.7 TypeScript Types (`src/env.d.ts`)

```typescript
declare namespace App {
  interface Locals {
    user?: { id: string; name: string; email: string; image?: string | null };
    session?: { id: string; userId: string; token: string; expiresAt: Date };
  }
}
```

---

## 5. Database Schema

### 5.1 Provider

**Supabase PostgreSQL** (hosted), connected via `postgres` driver with `{ prepare: false }` (required for Supabase connection pooling).

### 5.2 Connection (`src/lib/db.ts`)

- Lazy-initialized via Proxy pattern
- Connection string from `DATABASE_URL` env var
- Uses `drizzle(client, { schema })` with full schema import

### 5.3 Tables (`src/lib/schema.ts`)

#### `user`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | UUID primary key |
| name | text | NOT NULL | Display name |
| email | text | NOT NULL, UNIQUE | Email address |
| email_verified | boolean | NOT NULL, default false | Email verification status |
| image | text | nullable | Avatar URL |
| created_at | timestamp | NOT NULL, defaultNow() | Creation timestamp |
| updated_at | timestamp | NOT NULL, defaultNow(), auto-update | Last update timestamp |

#### `session`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Session ID |
| expires_at | timestamp | NOT NULL | Expiration time |
| token | text | NOT NULL, UNIQUE | Session token |
| created_at | timestamp | NOT NULL | Creation timestamp |
| updated_at | timestamp | NOT NULL | Last update timestamp |
| ip_address | text | nullable | Client IP |
| user_agent | text | nullable | Client user agent |
| user_id | text | NOT NULL, FK -> user.id (CASCADE) | Owner user |

#### `account`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Account ID |
| account_id | text | NOT NULL | Provider-specific account ID |
| provider_id | text | NOT NULL | Auth provider name (e.g., "credential", "google") |
| user_id | text | NOT NULL, FK -> user.id (CASCADE) | Owner user |
| access_token | text | nullable | OAuth access token |
| refresh_token | text | nullable | OAuth refresh token |
| id_token | text | nullable | OAuth ID token |
| access_token_expires_at | timestamp | nullable | Access token expiry |
| refresh_token_expires_at | timestamp | nullable | Refresh token expiry |
| scope | text | nullable | OAuth scopes granted |
| password | text | nullable | Hashed password (for credential provider) |
| created_at | timestamp | NOT NULL | Creation timestamp |
| updated_at | timestamp | NOT NULL | Last update timestamp |

#### `verification`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | Verification ID |
| identifier | text | NOT NULL | What is being verified (e.g., email) |
| value | text | NOT NULL | Verification token/code |
| expires_at | timestamp | NOT NULL | Expiration time |
| created_at | timestamp | NOT NULL | Creation timestamp |
| updated_at | timestamp | NOT NULL | Last update timestamp |

#### `order`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | UUID primary key |
| order_no | text | NOT NULL, UNIQUE | Order number (format: `ORD-{timestamp}-{random}`) |
| user_id | text | NOT NULL, FK -> user.id (CASCADE) | Purchasing user |
| status | text | NOT NULL | Order status: "pending" or "paid" |
| amount | integer | NOT NULL | Amount in cents (USD) |
| currency | text | NOT NULL, default 'usd' | Currency code |
| product_id | text | nullable | Plan ID (e.g., "starter", "pro") |
| credits_amount | integer | NOT NULL | Number of credits purchased |
| payment_session_id | text | nullable | Stripe checkout session ID |
| paid_at | timestamp | nullable | Payment confirmation timestamp |
| created_at | timestamp | NOT NULL | Creation timestamp |
| updated_at | timestamp | NOT NULL | Last update timestamp |

#### `credit`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | PK | UUID primary key |
| user_id | text | NOT NULL, FK -> user.id (CASCADE) | Owner user |
| transaction_type | text | NOT NULL | "grant" or "consume" |
| credits | integer | NOT NULL | Amount (positive for grant, -1 for consume) |
| remaining_credits | integer | NOT NULL, default 0 | Remaining credits on this grant record |
| description | text | nullable | Human-readable description |
| order_no | text | nullable | Associated order number |
| created_at | timestamp | NOT NULL | Creation timestamp |

---

## 6. Credit System

### 6.1 Design (`src/lib/credits.ts`)

- **FIFO consumption**: Credits are consumed from the oldest grant record first
- **Free tier**: 5 free credits granted automatically on first use (`ensureFreeCredits()`)
- **One-time grants**: No recurring subscriptions; credits purchased via one-time payments

### 6.2 Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getUserCredits` | `(userId: string) => Promise<number>` | Sums `remaining_credits` from all `grant` records with remaining > 0 |
| `grantCredits` | `(userId, amount, orderNo?, description?) => Promise<void>` | Creates a new `grant` credit row |
| `consumeCredit` | `(userId: string) => Promise<boolean>` | Deducts 1 credit (FIFO), creates `consume` record. Returns false if no credits. |
| `ensureFreeCredits` | `(userId: string) => Promise<void>` | Grants 5 free credits if user has never received any grants |

### 6.3 Credit Flow

1. **New user**: First API call triggers `ensureFreeCredits()` -> 5 credits granted
2. **Image generation**: `consumeCredit()` called after successful Gemini response -> 1 credit deducted
3. **Purchase**: Stripe webhook calls `grantCredits()` -> credits added to balance
4. **Balance check**: `/api/credits/balance` returns current total remaining credits

---

## 7. Payment System (Stripe)

### 7.1 Pricing Plans (`src/lib/pricing.ts`)

| Plan | Price | Credits | Highlighted |
|------|-------|---------|-------------|
| Free | $0 | 5 | No |
| Starter | $9.99 | 100 | No |
| Pro | $29.99 | 500 | Yes (Best Value) |

All paid plans are **one-time payments**, not subscriptions.

### 7.2 Checkout Flow (`src/pages/api/payment/checkout.ts`)

1. Authenticated user clicks "Buy Credits" on pricing page
2. Frontend POSTs `{ planId }` to `/api/payment/checkout`
3. Backend verifies auth session, validates plan
4. Creates a Stripe checkout session with:
   - `mode: 'payment'` (one-time)
   - `metadata`: order_no, user_id, plan_id, credits_amount
   - `success_url`: `/payment/success?order_no={orderNo}`
   - `cancel_url`: `/payment/cancel`
5. Saves `order` row with status `'pending'`
6. Returns Stripe checkout URL to frontend
7. Frontend redirects to Stripe

### 7.3 Webhook Flow (`src/pages/api/payment/webhook.ts`)

1. Stripe sends `checkout.session.completed` event
2. Webhook verifies signature with `STRIPE_WEBHOOK_SECRET`
3. Extracts `order_no`, `user_id`, `credits_amount` from session metadata
4. Checks order exists and is still `'pending'` (idempotency guard)
5. Updates order status to `'paid'`, sets `paid_at`
6. Calls `grantCredits(userId, creditsAmount, orderNo)` to add credits

### 7.4 Stripe Client (`src/lib/stripe.ts`)

- Lazy-initialized singleton
- Uses `Stripe.createFetchHttpClient()` for Cloudflare Workers compatibility
- Key from `STRIPE_SECRET_KEY` env var

---

## 8. Image Generation

### 8.1 API Endpoint (`src/pages/api/generate.ts`)

**Method**: POST
**Authentication**: Required (session-based)
**Rate Limit**: None (credit-gated)

### 8.2 Request Body

```json
{
  "prompt": "string (required, max 1000 chars)",
  "image": "string (optional, base64-encoded, max 10MB)",
  "style": "string (optional, e.g. 'anime', 'watercolor')"
}
```

### 8.3 Processing Flow

1. Verify authentication (401 if not signed in)
2. Call `ensureFreeCredits()` for first-time users
3. Check credit balance (402 with `NO_CREDITS` code if empty)
4. Validate prompt (required, max 1000 chars)
5. Validate image if provided (valid base64, under 10MB)
6. Build prompt: prepend style if provided (`in {style} style: {prompt}`)
7. Call Gemini API with 60s timeout
8. Extract image from response candidates
9. Deduct 1 credit via `consumeCredit()`
10. Return base64 image data

### 8.4 Gemini API Details

- **Model**: `gemini-3-pro-image-preview`
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Config**: `responseModalities: ['TEXT', 'IMAGE']`
- **Timeout**: 60 seconds
- **Auth**: API key passed as query parameter

### 8.5 Response

Success:
```json
{ "success": true, "image": "<base64-encoded-png>" }
```

Error:
```json
{ "success": false, "error": "Error message", "code": "NO_CREDITS" }
```

### 8.6 Available Styles

Auto, Photorealistic, Anime, Watercolor, Oil Painting, Digital Art, Pixel Art

---

## 9. API Routes Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| ALL | `/api/auth/*` | No | Better-Auth catch-all (sign-in, sign-up, sign-out, get-session, callbacks) |
| POST | `/api/generate` | Yes | Generate AI image from prompt |
| POST | `/api/payment/checkout` | Yes | Create Stripe checkout session |
| POST | `/api/payment/webhook` | No* | Stripe webhook handler (*verified by signature) |
| GET | `/api/credits/balance` | Yes | Get user's current credit balance |
| GET | `/api/health` | No | Health check (returns `{ status: "ok", timestamp }`) |
| GET | `/sitemap.xml` | No | Dynamic sitemap |

All API routes have `prerender = false` (server-side only).

---

## 10. Frontend Pages

| Path | File | Prerender | Auth Required | Description |
|------|------|-----------|---------------|-------------|
| `/` | `index.astro` | No | No | Landing page (Hero, Features, HowItWorks, FAQ) |
| `/generate` | `generate.astro` | No | Yes | Image generation workspace |
| `/login` | `login.astro` | No | No | Email/password login form |
| `/signup` | `signup.astro` | No | No | Account registration form |
| `/pricing` | `pricing.astro` | No | No | Pricing cards with Stripe checkout |
| `/payment/success` | `payment/success.astro` | No | No | Payment confirmation page |
| `/payment/cancel` | `payment/cancel.astro` | No | No | Payment cancellation page |

All pages use `prerender = false` (dynamic SSR via Cloudflare Workers).

---

## 11. Components

| Component | File | Description |
|-----------|------|-------------|
| `Layout` | `layouts/Layout.astro` | Base HTML document with SEO meta tags, Open Graph, Twitter cards, Google Fonts (Inter + Poppins), Schema.org structured data |
| `Header` | `components/Header.astro` | Fixed navigation bar. Shows auth state (Sign In/Sign Up vs user name + credits badge + Sign Out). Mobile hamburger menu. Fetches credit balance via `/api/credits/balance`. |
| `Hero` | `components/Hero.astro` | Landing page hero section with gradient background, CTA buttons |
| `Features` | `components/Features.astro` | 6-card feature grid (Text to Image, Image to Image, Multiple Styles, Fast Generation, High Quality, Free to Use) |
| `HowItWorks` | `components/HowItWorks.astro` | 3-step guide with numbered cards and connector lines |
| `FAQ` | `components/FAQ.astro` | Accordion FAQ section with 6 questions, toggle behavior |
| `ImageGenerator` | `components/ImageGenerator.astro` | Full generation UI: prompt textarea, drag-and-drop image upload, style dropdown, generate button with loading state, result display, download button. Handles credit display and no-credits banner. |
| `Footer` | `components/Footer.astro` | Site footer with logo, navigation links, copyright |

---

## 12. Deployment

### 12.1 Astro Configuration (`astro.config.mjs`)

```javascript
{
  output: 'static',              // Static site output (but all pages have prerender=false -> SSR)
  adapter: cloudflare(),         // Cloudflare Workers adapter
  integrations: [tailwind()],    // Tailwind CSS integration
  site: 'https://nanabananapro.com',
  trailingSlash: 'never',        // No trailing slashes
  build: {
    format: 'file',              // Generate .html files
    inlineStylesheets: 'always', // Inline CSS for performance
  },
}
```

### 12.2 Cloudflare Workers (`wrangler.toml`)

```toml
account_id = "7603590f7848113756dcf96badd1dc96"
name = "nana-banana-pro"
main = "./dist/_worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist"
binding = "ASSETS"
```

### 12.3 NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `astro dev` | Start dev server (localhost:4321) |
| `build` | `astro build` | Build for production |
| `preview` | `astro preview` | Preview production build |
| `deploy` | `astro build && wrangler deploy` | Build and deploy to Cloudflare |
| `db:generate` | `drizzle-kit generate` | Generate migration files |
| `db:migrate` | `drizzle-kit migrate` | Run migrations |
| `db:push` | `drizzle-kit push` | Push schema to database |

---

## 13. Environment Variables

### 13.1 Complete Variable List

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_AI_STUDIO_API_KEY` | Yes | Google AI Studio API key for Gemini image generation | `AIza...` |
| `BETTER_AUTH_SECRET` | Yes | Better-Auth encryption secret (min 32 chars) | `your-secret-key-at-least-32-characters-long` |
| `BETTER_AUTH_URL` | Yes | Base URL for auth callbacks | `http://localhost:4321` or `https://nanabananapro.com` |
| `DATABASE_URL` | Yes | Supabase PostgreSQL connection string | `postgresql://postgres.xxx:pw@pooler.supabase.com:6543/postgres` |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret API key | `sk_test_xxx` or `sk_live_xxx` |
| `STRIPE_PUBLISHABLE_KEY` | No* | Stripe publishable key (*not currently used server-side) | `pk_test_xxx` |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret | `whsec_xxx` |

### 13.2 Cloudflare Worker Secrets

All sensitive variables must be set as Cloudflare Worker secrets:

```bash
wrangler secret put GOOGLE_AI_STUDIO_API_KEY
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put BETTER_AUTH_URL
wrangler secret put DATABASE_URL
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

---

## 14. Design System

### 14.1 Color Palette (`tailwind.config.mjs`)

**Brand Colors**:
- `brand-dark`: `#1A1A2E` (page background)
- `brand-mid`: `#16213E` (card backgrounds)
- `brand-accent`: `#FFE01F` (same as banana-500)

**Banana (Accent) Scale**:
- `banana-50` through `banana-900`
- Primary: `banana-500` (`#FFE01F`) - buttons, highlights
- Secondary: `banana-400` (`#FFE942`) - hover states, accent text

### 14.2 Typography

- **Body font**: Inter (400, 500, 600, 700)
- **Display font**: Poppins (600, 700, 800)
- Loaded from Google Fonts with `font-display: swap`

### 14.3 UI Pattern

- Dark theme throughout
- Glass-morphism effects (backdrop-blur, semi-transparent backgrounds)
- Rounded corners (xl, 2xl)
- Border styling: `border-white/10` for subtle borders
- Hover transitions on interactive elements
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints

---

## 15. Security Considerations

- All API routes verify session authentication before performing actions
- Stripe webhook verifies signatures before processing events
- Credit deduction happens only AFTER successful image generation (not before)
- CORS headers on generate endpoint (currently `*` - consider restricting in production)
- No client secrets exposed to frontend
- Session cookies are HTTP-only (managed by Better-Auth)
- Image size validation (10MB max) prevents abuse
- Prompt length validation (1000 chars max)
- Database queries use Drizzle ORM (parameterized, SQL-injection safe)

---

## 16. Lazy Initialization Pattern

Both `auth.ts` and `db.ts` use a Proxy-based lazy initialization pattern:

```typescript
let _instance = null;
export const instance = new Proxy({}, {
  get(_target, prop, receiver) {
    if (!_instance) {
      _instance = initialize(); // Only called on first access
    }
    return Reflect.get(_instance, prop, receiver);
  },
});
```

This avoids connecting to the database or initializing auth during build time, which is critical for Cloudflare Workers deployment where environment variables may not be available at build time.

---

*Last updated: 2026-02-08*
