# 🔧 Fixing Authentication in Production Builds

## Problem
Authentication works in Expo Go but fails in production APK builds.

## Root Cause
Environment variables (Supabase URL and keys) are not being loaded in production builds.

## Solution

### Step 1: Get Your Supabase Credentials

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Project API keys** → **anon/public** key

### Step 2: Update app.json

Open `app.json` and replace the placeholder values:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "119794fc-e7eb-43a0-a462-b49829b8bb63"
      },
      "EXPO_PUBLIC_SUPABASE_URL": "https://YOUR_PROJECT_ID.supabase.co",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

⚠️ **IMPORTANT**: Replace with your actual values!

### Step 3: Create .env File (Optional - for Expo Go development)

1. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```

2. Edit `.env` and add your Supabase credentials:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### Step 4: Rebuild Your App

After updating `app.json`, rebuild your APK:

```bash
# For development build
npx eas build --profile development --platform android

# For production build
npx eas build --profile production --platform android
```

### Step 5: Test

1. Install the new APK on your device
2. Check the logs when app starts - you should see:
   ```
   [Supabase] Initializing with URL: ✅ Present
   [Supabase] Anon key: ✅ Present
   ```
3. Try logging in - it should work now! ✅

## Why This Happens

- **Expo Go**: Reads environment variables from your development machine
- **Production APK**: Needs environment variables baked into the build via `app.json`

## Security Note

The `anon` key is safe to include in `app.json` because:
- It's designed to be public (used in client apps)
- Row Level Security (RLS) in Supabase protects your data
- Never commit your `service_role` key (that's the secret one!)

## Troubleshooting

If authentication still doesn't work:

1. **Check logs**:
   - Connect device via USB
   - Run: `npx react-native log-android`
   - Look for `[Supabase]` messages

2. **Verify credentials**:
   - Make sure URL starts with `https://`
   - Make sure anon key is the full JWT token (starts with `eyJ...`)
   - No extra spaces or quotes

3. **Check internet**:
   - Make sure device has internet access
   - Try opening https://supabase.com in device browser

4. **Rebuild**:
   - After changing `app.json`, you MUST rebuild the APK
   - Installing over old APK won't update embedded config
