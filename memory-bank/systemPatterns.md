# System Patterns

## Architecture
- **Frontend**: React (Vite) with AWS Amplify Gen 2 Client.
- **Backend**: AWS Amplify Gen 2 (Cognito, AppSync, DynamoDB).
- **Hosting**: AWS Amplify Hosting.

## Key Patterns

### 1. Isolated Amplify Configuration
**Context**: To prevent initialization race conditions, Amplify configuration logic is isolated in a separate file (`src/configureAmplify.ts`) and imported as the very first module in the application entry point (`src/main.tsx`).
**Reasoning**: JavaScript imports are hoisted. If configuration happens in the same file as imports that rely on Amplify (e.g., `generateClient`), the dependent code may run before configuration is complete.

### 2. Explicit Client Authorization Mode
**Context**: For data models requiring specific authorization (e.g., `userPool` for private data) when the API default is different (e.g., `apiKey`), the client must be explicitly configured.
**Implementation**: `generateClient<Schema>({ authMode: 'userPool' })` ensures requests are signed with the correct credentials, overriding the API default.
