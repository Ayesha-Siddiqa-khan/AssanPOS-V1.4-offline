# 🧹 Clear Old Authentication Data

## Problem: Still logging in with "1234"

If you can still login with "1234" but NOT with your Supabase access keys, it means:

1. **Old SQLite session is cached** on your device
2. **Old authentication data persisted** in secure storage
3. **App is using cached user** instead of checking Supabase

## ✅ Solution: Clear App Data

### Option 1: Uninstall and Reinstall (EASIEST)

This completely clears all local data:

1. **Uninstall the app** from your device/emulator
2. **Clear cache** (if on emulator, wipe data)
3. **Reinstall** by running `npx expo start` again

### Option 2: Clear Expo Dev Client Cache

If using Expo Dev Client:

```bash
cd "Shopkeeper POS App Mobile"
npx expo start --clear
```

Then reload the app on your device.

### Option 3: Clear Secure Store Programmatically

I've added logging to help debug. **Run the app and check your console logs**:

- Look for `[keyAuthService]` logs
- Should see: "Starting authentication with access key"
- Should see: "Supabase client is configured ✓"
- Should see: "Querying Supabase for user..."

If you see "User found in Supabase" but login still fails, there's an issue with the session handling.

### Option 4: Manual Database Reset (Android)

For Android devices:

1. Go to **Settings** → **Apps** → **AsaanPOS**
2. Tap **Storage**
3. Tap **Clear Data** (NOT just Clear Cache)
4. Tap **Clear All Data**
5. Restart the app

### Option 5: Manual Database Reset (iOS)

For iOS devices:

1. Delete the app completely
2. Restart your device
3. Reinstall the app

## 🧪 After Clearing Data

### Test These Steps:

1. **Start fresh**
   ```bash
   cd "Shopkeeper POS App Mobile"
   npx expo start --clear
   ```

2. **Open the app** - You should see the login screen with NO persisted session

3. **Try your Supabase key first:**
   - Enter: **798541** (Demo User)
   - Watch the console for `[keyAuthService]` logs
   - Should login successfully ✅

4. **Try the old hardcoded key:**
   - Enter: **123456** (old format) or **1234** (4 digits)
   - Should fail ❌ (invalid format)

## 🔍 Console Logs to Watch For

### Successful Supabase Login:
```
[keyAuthService] Starting authentication with access key: 798541
[keyAuthService] Supabase client is configured ✓
[keyAuthService] Key format valid ✓
[keyAuthService] Querying Supabase for user...
[keyAuthService] User found in Supabase: Demo User demo@asaanpos.com
[keyAuthService] ✅ Authentication successful!
[keyAuthService] User: Demo User - Trial: false
```

### Failed Login (Invalid Key):
```
[keyAuthService] Starting authentication with access key: 000000
[keyAuthService] Supabase client is configured ✓
[keyAuthService] Key format valid ✓
[keyAuthService] Querying Supabase for user...
[keyAuthService] Authentication failed: User not found
```

### Supabase Not Configured:
```
[keyAuthService] Supabase is NOT configured! Check your .env file
```

If you see "Supabase is NOT configured", then:
1. Check `.env` file exists in project root
2. Verify it has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Restart the dev server with `npx expo start --clear`

## 📱 Expected Behavior After Clear

| Access Key | Expected Result |
|------------|-----------------|
| **798541** | ✅ Login successful (Demo User) |
| **167702** | ✅ Login successful (Ahmad Khan) |
| **248688** | ✅ Login successful (Fatima Ali) |
| **657995** | ✅ Login successful (Trial User - active) |
| **748342** | ❌ Invalid PIN (Hassan - inactive) |
| **151552** | ❌ Invalid PIN (Trial expired) |
| **1234** | ❌ Invalid PIN (wrong format - 4 digits) |
| **123456** | ❌ Invalid PIN (not in database) |
| **000000** | ❌ Invalid PIN (not in database) |

## 🚨 Still Having Issues?

If after clearing data you STILL can login with "1234":

1. **Check which AuthContext is being used:**
   - Open `app/_layout.tsx`
   - Verify it imports from `contexts/AuthContext` (NOT old version)

2. **Check KeyLoginScreen:**
   - Open `components/auth/KeyLoginScreen.tsx`
   - Verify it uses `loginWithAccessKey` from `useAuth()`

3. **Verify .env is loaded:**
   - Add this to your login screen temporarily:
   ```tsx
   console.log('Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL);
   ```
   - Should print the URL, not undefined

4. **Check for multiple AuthContext files:**
   - Search for "AuthContext.tsx" files
   - Ensure only ONE exists in `contexts/AuthContext.tsx`

## 💡 Prevention

To prevent this issue in the future:

1. **Never hardcode authentication**
2. **Always use environment variables**
3. **Test with fresh installs** before deployment
4. **Clear data** when switching authentication systems
5. **Use TypeScript** to catch type mismatches

---

## ✅ Verification Checklist

After clearing data, verify:

- [ ] Can login with **798541** (Supabase key)
- [ ] Cannot login with **1234** (old hardcoded)
- [ ] Cannot login with **000000** (invalid)
- [ ] Inactive user **748342** is rejected
- [ ] Console shows `[keyAuthService]` logs
- [ ] Console shows "Supabase client is configured ✓"
- [ ] After login, user name appears correctly
- [ ] After logout and restart, session is NOT persisted (fresh login required)

If ALL checklist items pass ✅ - your authentication is working correctly!
