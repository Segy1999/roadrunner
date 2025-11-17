# Personal Site - Astro with Supabase Integration

A modern Astro website with Supabase backend integration for device catalog management and pricing wizard functionality.

## 🚀 Project Structure

```text
/
├── public/              # Static assets
├── src/
│   ├── components/     # Astro components
│   │   └── ServicesPage.astro  # Pricing Wizard component
│   ├── lib/
│   │   └── supabase/   # Supabase client initialization
│   │       ├── serverClient.ts  # Server-side Supabase client
│   │       └── browserClient.ts # Browser-side Supabase client
│   └── pages/
│       ├── api/        # API endpoints
│       │   └── device-catalog.json.ts  # Catalog API endpoint
│       ├── index.astro
│       └── services.astro
├── data/
│   ├── deviceCatalog.json  # Initial device catalog (seed data)
│   └── repairs.json        # Repair service definitions
├── supabase/
│   ├── functions/
│   │   ├── fetchDeviceCatalog/  # Edge Function: Fetches catalog from MobileAPI.dev
│   │   │   └── index.ts
│   │   └── getDeviceCatalog/    # Edge Function: Serves catalog (optional)
│   │       └── index.ts
│   └── config.toml      # Supabase configuration
├── .env.example         # Environment variables template
└── package.json
```

## 🧞 Commands

All commands are run from the root of the project:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`           |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |

## 🔧 Setup & Configuration

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

- **SUPABASE_URL**: Your Supabase project URL (found in Supabase dashboard)
- **PUBLIC_SUPABASE_ANON_KEY**: Supabase anon/public key (safe for browser)
- **SUPABASE_SERVICE_ROLE_KEY**: Supabase service role key (server-only, never expose)
- **MOBILEAPI_KEY**: Your MobileAPI.dev API key

**⚠️ Security Note**: Never commit `.env` to version control. The `.gitignore` file already excludes it.

### 2. Supabase Initialization

#### Server Client (`src/lib/supabase/serverClient.ts`)

The server client is used in:
- Edge Functions
- Server-side Astro endpoints
- Any server-only code

It uses the service role key and has full access to your Supabase project.

**Usage:**
```typescript
import { supabaseServer } from '@/lib/supabase/serverClient';

// Use in server-side code only
const { data, error } = await supabaseServer.storage
  .from('catalogs')
  .download('deviceCatalog.json');
```

#### Browser Client (`src/lib/supabase/browserClient.ts`)

The browser client is optional and uses only the public anon key. Use it for:
- Client-side authentication
- Public data access
- Real-time subscriptions

**Usage:**
```typescript
import { supabaseBrowser } from '@/lib/supabase/browserClient';

if (supabaseBrowser) {
  // Use in browser code
}
```

### 3. Supabase Storage Setup

Create a Storage bucket named `catalogs` in your Supabase dashboard:

1. Go to Storage in your Supabase dashboard
2. Create a new bucket named `catalogs`
3. Choose bucket visibility:
   - **Public**: Allows direct access via Storage URL
   - **Private**: Requires API endpoint or Edge Function for access

### 4. Device Catalog

The device catalog (`deviceCatalog.json`) is stored in Supabase Storage and contains:
- Categories (phone, laptop, tablet)
- Brands for each category
- Models for each brand
- Variants for each model

**Initial Catalog**: `data/deviceCatalog.json` contains seed data. The Edge Function will replace this with real data from MobileAPI.dev.

## 📡 Edge Functions

### fetchDeviceCatalog

**Location**: `supabase/functions/fetchDeviceCatalog/index.ts`

**Purpose**: Fetches device catalog data from MobileAPI.dev and stores it in Supabase Storage.

**How it works**:
1. Reads `MOBILEAPI_KEY` from environment
2. Fetches categories from MobileAPI.dev
3. For each category, fetches brands
4. For each brand, fetches models
5. For each model, fetches variants
6. Normalizes and structures the data
7. Uploads `deviceCatalog.json` to Supabase Storage
8. Respects rate limits (1 second delay between requests)

**Manual Execution**:
```bash
# Using Supabase CLI
supabase functions invoke fetchDeviceCatalog

# Or via HTTP (if deployed)
curl -X POST https://<project>.supabase.co/functions/v1/fetchDeviceCatalog \
  -H "Authorization: Bearer <anon-key>"
```

**Scheduling**: Configure in `supabase/config.toml` or via Supabase dashboard cron jobs.

### getDeviceCatalog (Optional)

**Location**: `supabase/functions/getDeviceCatalog/index.ts`

**Purpose**: Serves the device catalog from private Storage buckets without exposing service keys.

Use this if your Storage bucket is private and you prefer Edge Functions over Astro API endpoints.

## 🔄 Data Pipeline

### How the Pricing Wizard Loads Data

1. **User selects category** → Pricing Wizard loads `deviceCatalog.json`
2. **Catalog source priority**:
   - First: API endpoint `/api/device-catalog.json` (works for private buckets)
   - Fallback: Direct Storage URL (if bucket is public)
   - Final fallback: Local `localBrands` object (limited data)

3. **If catalog loads successfully**:
   - Extracts brands from catalog for selected category
   - Extracts models for selected brand
   - Extracts variants for selected model

4. **If catalog fails to load**:
   - Shows warning message
   - Uses `localBrands` fallback (limited brands only)
   - Models and variants will be empty

### Scheduled Updates

The `fetchDeviceCatalog` Edge Function should run on a schedule (bi-weekly or monthly) to keep the catalog up-to-date.

**Configure in Supabase Dashboard**:
1. Go to Database → Cron Jobs
2. Add new cron job:
   - Function: `fetchDeviceCatalog`
   - Schedule: `0 2 */14 * *` (every 14 days at 2 AM UTC)
   - Or: `0 2 1 * *` (first day of month at 2 AM UTC)

## 🎯 Pricing Wizard Component

**Location**: `src/components/ServicesPage.astro`

**Features**:
- ✅ Loads device catalog from Supabase (no third-party browser calls)
- ✅ Fallback to local brands if catalog unavailable
- ✅ Warning UI when using fallback mode
- ✅ No Icecat or MobileAPI.dev calls from browser
- ✅ All data fetching happens server-side

**Removed**:
- ❌ Icecat API integration
- ❌ Mock model/variant generators
- ❌ Third-party browser API calls

## 🔐 Security Notes

1. **Service Role Key**: Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. It's only used in:
   - Edge Functions
   - Server-side Astro endpoints
   - Server-only code

2. **Anon Key**: The `PUBLIC_SUPABASE_ANON_KEY` is safe for browser use but has limited permissions.

3. **Environment Variables**: All sensitive keys are in `.env`, which is excluded from git.

4. **Storage Bucket**: Choose public or private based on your security requirements:
   - **Public**: Simpler, direct access
   - **Private**: More secure, requires API endpoint or Edge Function

## 📚 API Endpoints

### GET `/api/device-catalog.json`

Serves the device catalog from Supabase Storage. Use this if your Storage bucket is private.

**Response**: JSON object with device catalog structure

**Caching**: 1 hour (`Cache-Control: public, max-age=3600`)

## 🛠️ Development

### Local Development

1. Install dependencies: `npm install`
2. Set up `.env` file with your credentials
3. Start dev server: `npm run dev`
4. Visit `http://localhost:4321`

### Deploying Edge Functions

The Supabase CLI is required to deploy Edge Functions. Choose one of these installation methods:

#### Option 1: Use npx (No Installation Required - Recommended)

You can use `npx` to run Supabase CLI commands without installing:

```bash
# Deploy a function
npx supabase functions deploy fetchDeviceCatalog

# Or deploy all functions
npx supabase functions deploy
```

#### Option 2: Install via Scoop (Windows)

```powershell
# Install Scoop if you don't have it
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# Install Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

#### Option 3: Direct Download

Download the latest release from: https://github.com/supabase/cli/releases

#### Deploying to Production

Before deploying, you need to link your project:

```bash
# Link to your Supabase project (use npx if CLI not installed)
npx supabase link --project-ref your-project-ref

# Deploy functions
npx supabase functions deploy fetchDeviceCatalog
npx supabase functions deploy getDeviceCatalog  # Optional
```

#### Testing Edge Functions Locally (Requires Docker)

```bash
# Start local Supabase (requires Docker Desktop)
npx supabase start

# Serve functions locally
npx supabase functions serve fetchDeviceCatalog
```

### Building for Production

```bash
npm run build
npm run preview
```

## 📝 Additional Resources

- [Astro Documentation](https://docs.astro.build)
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [MobileAPI.dev Documentation](https://mobileapi.dev/docs)

## 👀 Want to learn more?

Feel free to check [Astro documentation](https://docs.astro.build) or [Supabase documentation](https://supabase.com/docs).
