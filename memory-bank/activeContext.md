# Active Context: Dotos Privacy & Authentication

## Current State
- The `/dotos` route is private and protected by `Authenticator`.
- `Doto` model uses `allow.owner()` for per-user data isolation.
- Amplify configuration is isolated in `src/configureAmplify.ts`.
- Data client in `DotosPage` uses `authMode: "userPool"`.

## Recent Changes
- **Protected `/dotos` route**: Added `Authenticator` wrapper in `src/App.tsx`.
- **Private Data Model**: Updated `amplify/data/resource.ts` to use `allow.owner()` for `Doto`.
- **Fixed Configuration Timing**: Created `src/configureAmplify.ts` and imported it first in `src/main.tsx` to resolve "Amplify has not been configured" error.
- **Fixed Auth Mode Mismatch**: Updated `src/pages/DotosPage.tsx` to use explicit `authMode: "userPool"` to resolve `onCreate` errors caused by the API default being `apiKey`.

## Issue Resolution Log

### Issue 1: "Amplify has not been configured"
**Problem**: The application threw an error on startup stating Amplify was not configured.
**Cause**: JavaScript import hoisting caused `generateClient()` in `DotosPage.tsx` (imported via `App.tsx`) to run *before* `Amplify.configure()` in `main.tsx`.
**Solution**: Moved configuration to `src/configureAmplify.ts` and imported it at the very top of `src/main.tsx`, guaranteeing it runs first.

### Issue 2: `onCreate` Error (Authorization Mismatch)
**Problem**: Creating a Doto failed silently or with a generic `onCreate` error, despite being logged in.
**Cause**: The API's `defaultAuthorizationMode` was `apiKey` (public), but the `Doto` model required `owner` (User Pool) access. The client defaulted to using the API Key, which was rejected by the backend for the private model.
**Solution**: Explicitly configured the client in `DotosPage.tsx` with `generateClient<Schema>({ authMode: "userPool" })` to force the use of Cognito credentials.
