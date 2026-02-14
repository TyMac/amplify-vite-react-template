# Active Context: Dotos Privacy & Authentication

## Current State
- The `/chats` route is private and protected by `Authenticator`.
- `Dotos` feature has been removed.
- Amplify configuration is isolated in `src/configureAmplify.ts`.
- `ChatSession` model uses `allow.owner()` for per-user data isolation.
- Data client uses `authMode: "userPool"`.

## Recent Changes
- **Removed Dotos**: Deleted `DotosPage.tsx`, removed `Doto` model from schema, and cleaned up routing.
- **Added Chats Feature**: Created `ChatHistoryPage.tsx` to view chat sessions from the `barista-mobile` app.
- **Cross-Project Integration**: Updated `barista-mobile` app to use `authMode: "userPool"` for chat storage, ensuring ownership matches.
- **Protected `/chats` route**: Added `Authenticator` wrapper in `src/App.tsx`.
- **Fixed Configuration Timing**: Created `src/configureAmplify.ts` and imported it first in `src/main.tsx` to resolve "Amplify has not been configured" error.

## Issue Resolution Log

### Issue 1: "Amplify has not been configured"
**Problem**: The application threw an error on startup stating Amplify was not configured.
**Cause**: JavaScript import hoisting caused `generateClient()` in page components (imported via `App.tsx`) to run *before* `Amplify.configure()` in `main.tsx`.
**Solution**: Moved configuration to `src/configureAmplify.ts` and imported it at the very top of `src/main.tsx`, guaranteeing it runs first.

### Issue 2: Chat Visibility Mismatch
**Problem**: Chats created in `barista-mobile` were not visible in the web app.
**Cause**: The mobile app was using API Key (public) auth, while the web app queries using User Pool (owner) auth. Items created publicly did not have the `owner` field set.
**Solution**: Updated `barista-mobile` to use `authMode: "userPool"` for authenticated users, ensuring the `owner` field is populated.
