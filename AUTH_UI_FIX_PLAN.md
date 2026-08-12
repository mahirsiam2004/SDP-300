# ShopFlare — Auth / UI Fixes: Inspection & Change Plan

## Project Overview
- **Stack**: React Native (Expo Router) + TypeScript + Django REST Framework
- **Auth**: JWT (SimpleJWT) with email verification + forgot-password code flow
- **Deployment**: Frontend via Expo, Backend on Render with ngrok proxy
- **API base**: `https://django-ngrok-proxy.onrender.com/proxy`

---

## Critical Issues (block auth from working)

### 1. Malformed Authorization header in `authService.ts`
**File**: `Frontend/services/authService.ts` (lines 226, 246, 269, 291, 310)  
**Problem**: Every authenticated request uses a broken header:
```
Authorization: *** ${accessToken}`,
```
This is not valid HTTP. The server receives `*** <token>` which fails JWT parsing.  
**Impact**: `getCurrentUser`, `updateProfile`, `updateBrandProfile`, `changePassword`, and `logout` all silently fail auth.  
**Fix**:
```ts
Authorization: `Bearer ${accessToken}`,
```

### 2. Auth routing guard redirects unauthenticated users INTO the app
**File**: `Frontend/app/_layout.tsx` (lines 29-33)  
**Problem**:
```ts
if (isSignedIn && inAuthGroup) {
  router.replace('/(tabs)');
} else if (!isSignedIn && !inAuthGroup) {
  router.replace('/(tabs)');   // ← WRONG
}
```
The second branch says: if the user is **not** signed in and **not** in an auth screen, send them to `/(tabs)`. This means anyone can access protected screens.  
**Fix**:
```ts
} else if (!isSignedIn && !inAuthGroup) {
  router.replace('/login');
}
```

---

## High-Priority Issues

### 3. `authService.ts` bypasses the proxy `apiFetch` helper
**File**: `Frontend/services/authService.ts`  
**Problem**: `productService.ts` uses a shared `apiFetch` that injects `ngrok-skip-browser-warning: 69420`. `authService.ts` uses raw `globalThis.fetch`, so auth calls hit the ngrok interstitial page and return HTML instead of JSON.  
**Fix**: Replace all raw `fetch` calls in `authService.ts` with the same `apiFetch` helper (or import it from `productService.ts`).

### 4. No token-refresh flow
**File**: `Frontend/services/authService.ts`, `Frontend/context/AuthContext.tsx`  
**Problem**: Backend exposes `/auth/token/refresh/` but the frontend never calls it. When the access token expires, every authenticated API call returns 401 and the user is logged out mid-session.  
**Fix**:
- Add `refreshAccessToken()` in `authService.ts` that calls `/token/refresh/`.
- In `AuthContext`, intercept 401 responses, attempt a single refresh, and retry the original request. If refresh fails, clear auth and navigate to login.

### 5. `checkAuthStatus` trusts stored tokens blindly
**File**: `Frontend/context/AuthContext.tsx` (lines 60-77)  
**Problem**: On app cold start, `checkAuthStatus` loads the cached user + tokens from AsyncStorage without verifying them. If the access token expired and the refresh token is also stale/invalid, the app still sets `user` state and treats the session as valid until the first 401.  
**Fix**: After restoring tokens, call `getCurrentUser(accessToken)` to validate them. If it fails, clear tokens and user state.

---

## Medium-Priority Issues

### 6. Type mismatch: `authService.User` vs `context/AuthContext.tsx` User
**File**: `Frontend/context/AuthContext.tsx`, `Frontend/services/authService.ts`  
**Problem**: Both files declare their own `User` interface. In `authService.ts`, `first_name`/`last_name` are optional (`string | undefined`). In `AuthContext.tsx`, they are required (`string`). This causes TS2345 on lines 89 and 131.  
**Fix**: Remove the duplicate `User` interface from `AuthContext.tsx` and import it from `authService.ts`, or make all optional fields explicit in both places.

### 7. Auth screens duplicate styles heavily
**Files**: `LoginScreen.tsx`, `RegisterScreen.tsx`, `ForgotPasswordScreen.tsx`, `VerifyEmailScreen.tsx`  
**Problem**: Every screen redefines `header`, `logoContainer`, `brandName`, `innerContainer`, `inputContainer`, `button`, `link`, etc. with near-identical values.  
**Fix**: Extract a shared `useAuthScreenStyles()` hook or `AuthStyles.ts` constant. Each screen should only override what differs.

### 8. `ForgotPasswordScreen` shared loading state between two actions
**File**: `Frontend/app/forgot-password/index.tsx`  
**Problem**: `isSubmitting` is used for both “Send Reset Code” and “Reset Password”. If the user taps “Send Reset Code” and it fails, `isSubmitting` goes false, but the resend button’s disabled check still uses the same state. There is no separate resend spinner.  
**Fix**: Split into `isSendingCode` and `isResettingPassword`.

### 9. Verify-email / forgot-password allow empty email params
**Files**: `VerifyEmailScreen.tsx`, `ForgotPasswordScreen.tsx`  
**Problem**: If a user deep-links to `/verify-email` or `/forgot-password` without query params, the screen renders with empty email and silently fails.  
**Fix**: Add a guard at the top:
```ts
if (!email) {
  return <Redirect href="/login" />;
}
```

---

## Low-Priority / Polish

### 10. Theme color duplication
**File**: `Frontend/constants/theme.ts`  
**Problem**: `primary` and `accent` are both `#FF6B35`. The visual system loses the ability to distinguish a brand primary from a call-to-action accent.  
**Fix**: Decide on a two-tone system (e.g. keep `primary = #FF6B35`, change `accent` to a complementary deep charcoal `#1A1A1A` for contrast) and update buttons/icons accordingly.

### 11. Existing TypeScript errors in unrelated screens
- `Frontend/app/addresses.tsx` — missing `address_line1` in `AddressInput`
- `Frontend/components/ui/toast.tsx` — `_value` does not exist on `Value`
- `Frontend/context/FashionContext.tsx` — duplicate `Product` export
These are unrelated to auth but block a clean `tsc --noEmit`.

---

## Recommended Execution Order

| Step | File(s) | Action | Risk |
|------|---------|--------|------|
| 1 | `authService.ts` | Fix `Authorization` header + switch to `apiFetch` | Low |
| 2 | `app/_layout.tsx` | Fix auth guard redirect to `/login` | Low |
| 3 | `authService.ts` + `AuthContext.tsx` | Add `refreshAccessToken` + validate on cold start | Medium |
| 4 | `authService.ts` + `AuthContext.tsx` | Align `User` types (remove duplicate) | Low |
| 5 | `forgot-password/index.tsx` | Split loading states + param guard | Low |
| 6 | `verify-email/index.tsx` | Add param guard | Low |
| 7 | All auth screens | Extract shared styles | Medium |
| 8 | `theme.ts` | Resolve accent/primary duplication | Low |
| 9 | `addresses.tsx`, `toast.tsx`, `FashionContext.tsx` | Fix existing TS errors | Low |

---

## Notes
- The backend auth flow (`login_view`, `verify_email_view`, etc.) looks correct and handles both `User` and `Brand` properly.
- The ngrok proxy is a single point of failure; the `ngrok-skip-browser-warning` header is required for every request, not just product ones.
- `SimpleJWT` refresh tokens are already issued by the backend; the frontend just needs to consume them.
