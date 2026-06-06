# Barista environment variables and secrets

Last updated: 2026-05-27

This document explains the Barista Amplify web/backend environment variables and secrets used for Cognito social sign-in and the LLM Lambda.

Do **not** commit real secret values. Store secrets through Amplify/AWS-managed secret mechanisms and keep only variable names, console locations, and non-secret resource identifiers in source control.

## Where these values are used

- Cognito social-provider secrets are declared in `amplify/auth/resource.ts` with `secret(...)`.
- Cognito custom-domain deployment variables are read in `amplify/backend.ts` from `process.env`.
- LLM Lambda environment variables are declared in `amplify/function/gemini-api/resource.ts` and read in `amplify/function/gemini-api/handler.ts`.
- The frontend normally reads generated Amplify configuration from `amplify_outputs.json` / Amplify hosting outputs, not from hand-authored `VITE_` auth secrets.

## Secret and environment variable inventory

### Cognito social sign-in secrets

Defined in `amplify/auth/resource.ts`:

| Name | Type | Purpose | Where to generate |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Amplify secret | Google OAuth web client ID used by Cognito federation | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Amplify secret | Google OAuth web client secret used by Cognito federation | Google Cloud Console |
| `APPLE_CLIENT_ID` | Amplify secret | Apple Services ID used as the OAuth client ID | Apple Developer Console |
| `APPLE_TEAM_ID` | Amplify secret | Apple Developer Team ID | Apple Developer Console |
| `APPLE_KEY_ID` | Amplify secret | Sign in with Apple private-key ID | Apple Developer Console |
| `APPLE_PRIVATE_KEY` | Amplify secret | Contents of the downloaded Sign in with Apple `.p8` private key | Apple Developer Console |

### Cognito custom domain deployment variables

Read in `amplify/backend.ts`:

| Name | Type | Purpose |
| --- | --- | --- |
| `COGNITO_CUSTOM_DOMAIN` | Amplify branch environment variable | Custom Cognito hosted UI domain to attach to the generated user pool |
| `COGNITO_CERT_ARN` | Amplify branch environment variable | ACM certificate ARN for the custom Cognito domain |

Notes:

- These are deployment-time variables, not app runtime secrets.
- The ACM certificate for a Cognito custom domain must be issued in `us-east-1`.
- After Cognito creates the custom domain, configure the required DNS record in Route 53/Cloudflare according to Cognito's target domain.

### LLM Lambda environment variables

Defined in `amplify/function/gemini-api/resource.ts`; details and routing behavior are in `docs/ai-model-routing.md`.

| Name | Current/default use |
| --- | --- |
| `GCP_PROJECT_ID` | Google Cloud project for Vertex AI / RAG |
| `GCP_PROJECT_NUMBER` | Numeric project ID used by Workload Identity Federation |
| `WORKLOAD_POOL_ID` | GCP Workload Identity Pool ID, currently `aws-barista` |
| `WORKLOAD_PROVIDER_ID` | GCP Workload Identity Provider ID, currently `aws-lambda` |
| `SERVICE_ACCOUNT_EMAIL` | GCP service account impersonated by Lambda |
| `VERTEX_LOCATION` | Gemini/RAG location, currently `us-south1` |
| `VERTEX_OPENAI_LOCATION` | Vertex OpenAI-compatible MaaS location, currently `global` |
| `CHAT_MODEL_PROVIDER` | Chat route selector; `gemma4` uses OpenAI-compatible route first |
| `VISION_MODEL_PROVIDER` | Vision route selector; `gemma4` uses OpenAI-compatible route first |
| `EXTRACTION_MODEL_PROVIDER` | Extraction route selector; currently `gemini` |
| `GEMMA4_MAAS_MODEL` | Vertex Gemma MaaS model name |
| `OPENAI_COMPAT_CHAT_URL` | Optional full `/chat/completions` URL for Ollama/Cloudflare/on-prem gateways; blank uses Vertex MaaS |
| `OPENAI_COMPAT_MODEL` | Default OpenAI-compatible model name |
| `OPENAI_COMPAT_CHAT_MODEL` | Optional chat/extraction-specific override, read by handler if set |
| `OPENAI_COMPAT_VISION_MODEL` | Optional vision-specific override, read by handler if set |
| `OPENAI_COMPAT_PROVIDER_LABEL` | Metadata label returned to UI |
| `OPENAI_COMPAT_API_KEY` / `OPENAI_API_KEY` | Bearer token for external OpenAI-compatible endpoints; declared with `secret("OPENAI_COMPAT_API_KEY")`; do not commit real values |
| `RAG_ENABLED` | Set `false` to skip Vertex RAG retrieval |
| `RAG_LOCATION` | RAG retrieval location, currently `us-south1` if set or defaulted |
| `RAG_CORPUS` | Full Vertex RAG corpus resource path if overriding handler default |
| `GEMMA4_CHAT_TIMEOUT_MS` | Max time to wait for OpenAI-compatible chat before fallback |
| `GEMMA4_VISION_TIMEOUT_MS` | Max time to wait for OpenAI-compatible vision before fallback |
| `STORAGE_BUCKET_NAME` | Added in `amplify/backend.ts` from Amplify-managed S3 bucket name |
| `AI_USAGE_LIMIT_TABLE_NAME` | Added in `amplify/backend.ts` from Amplify-managed DynamoDB table name |
| `ANONYMOUS_DAILY_CHAT_LIMIT` | Optional handler override; defaults to `3` if not set |

## Setting secrets for Amplify

For local sandbox work, use the Amplify Gen 2 sandbox secret workflow, for example:

```bash
npx ampx sandbox secret set GOOGLE_CLIENT_ID
npx ampx sandbox secret set GOOGLE_CLIENT_SECRET
npx ampx sandbox secret set APPLE_CLIENT_ID
npx ampx sandbox secret set APPLE_TEAM_ID
npx ampx sandbox secret set APPLE_KEY_ID
npx ampx sandbox secret set APPLE_PRIVATE_KEY
```

For hosted Amplify branches, set the corresponding secrets/environment variables in the Amplify Console for the correct app and branch. Keep dev/prod values separate when callback URLs, domains, or client IDs differ.

Current dev LLM routing uses the Mac Studio Ollama proxy exposed through Home Assistant Cloudflared:

- `CHAT_MODEL_PROVIDER=ollama`
- `OPENAI_COMPAT_CHAT_URL=https://llm.y337.org/v1/chat/completions`
- `OPENAI_COMPAT_CHAT_MODEL=llama3.2:latest`
- `OPENAI_COMPAT_PROVIDER_LABEL=mac-studio-ollama`
- `OPENAI_COMPAT_API_KEY` is stored as an Amplify/SSM SecureString secret, not committed.
- `VISION_MODEL_PROVIDER=gemini` and `EXTRACTION_MODEL_PROVIDER=gemini` remain on Gemini for image analysis and structured field extraction.

Before rotating any value, confirm whether the old value is still needed by an existing mobile build. Mobile builds can keep older generated Cognito config until a new EAS/TestFlight/App Store build ships.

## Generating Google OAuth values

Barista uses Google as an external provider for Cognito, so Google should redirect back to the Cognito hosted UI domain, not directly to arbitrary app pages.

### 1. Configure OAuth consent screen

In Google Cloud Console:

1. Select the Barista/Barizta Google Cloud project.
2. Go to **APIs & Services → OAuth consent screen**.
3. Choose the appropriate publishing mode/user type for the app.
4. Set app name, support email, developer contact email, and branding details.
5. Add the required scopes for this app:
   - `openid`
   - `email`
   - `profile`
6. Add authorized/test users if the OAuth app is still in testing mode.
7. Save/publish according to the environment's needs.

### 2. Create the OAuth client

In Google Cloud Console:

1. Go to **APIs & Services → Credentials**.
2. Click **Create credentials → OAuth client ID**.
3. Choose **Web application**.
4. Name it clearly, for example `Barizta Cognito dev` or `Barizta Cognito prod`.
5. Add the Cognito hosted UI callback URI as an **Authorized redirect URI**:

   ```text
   https://<cognito-hosted-ui-domain>/oauth2/idpresponse
   ```

   Examples of the domain portion:
   - Amplify/Cognito-generated domain from **Cognito User Pool → App integration → Domain**
   - Custom Cognito domain configured by `COGNITO_CUSTOM_DOMAIN`

6. If Google asks for JavaScript origins, add only the app origins that actually host the web app, for example:

   ```text
   https://dev.barizta.ai
   https://www.dev.barizta.ai
   ```

7. Create the client and copy:
   - OAuth client ID → `GOOGLE_CLIENT_ID`
   - OAuth client secret → `GOOGLE_CLIENT_SECRET`

### 3. Keep callback/logout URLs aligned

The app callback/logout URLs are declared in `amplify/auth/resource.ts`. Current examples include:

```text
barista://
https://dev.d1dfxp3jics5eo.amplifyapp.com/
https://dev.barizta.ai/
https://www.dev.barizta.ai/
```

When adding a new domain or prod branch, update both:

- Google OAuth redirect URI: Cognito domain `/oauth2/idpresponse`
- Cognito callback/logout URLs: actual app redirect/logout URLs in `amplify/auth/resource.ts`

## Generating Apple Sign in with Apple values

Cognito's Sign in with Apple provider needs a Services ID, Team ID, Key ID, and private key.

### 1. Confirm the primary App ID

In Apple Developer Console:

1. Go to **Certificates, Identifiers & Profiles → Identifiers**.
2. Create or select the primary app identifier for Barista/Barizta.
3. Enable **Sign in with Apple** for that App ID.
4. Save the identifier.

For iOS/native login, the app bundle ID must also have Sign in with Apple enabled and match the app's shipped bundle configuration.

### 2. Create the Services ID

In Apple Developer Console:

1. Go to **Certificates, Identifiers & Profiles → Identifiers**.
2. Add a new identifier and choose **Services IDs**.
3. Enter a description such as `Barizta Cognito Web`.
4. Set the identifier string. This value becomes `APPLE_CLIENT_ID`.
   - Use a stable reverse-DNS style identifier, for example `ai.barizta.auth`.
5. Enable **Sign in with Apple** on the Services ID.
6. Configure Sign in with Apple for that Services ID:
   - Choose the primary App ID from step 1.
   - Add the web domain(s), for example `dev.barizta.ai` and later the production domain.
   - Add the return URL:

     ```text
     https://<cognito-hosted-ui-domain>/oauth2/idpresponse
     ```

7. Save the Services ID.

### 3. Create the Sign in with Apple private key

In Apple Developer Console:

1. Go to **Certificates, Identifiers & Profiles → Keys**.
2. Create a new key.
3. Enable **Sign in with Apple** for the key.
4. Configure it with the primary App ID.
5. Register the key.
6. Download the `.p8` file immediately. Apple only allows downloading it once.
7. Record:
   - Key ID → `APPLE_KEY_ID`
   - Team ID from the Apple Developer account membership page → `APPLE_TEAM_ID`
   - Services ID from step 2 → `APPLE_CLIENT_ID`
   - Full `.p8` file contents → `APPLE_PRIVATE_KEY`

Keep the private key exactly as issued, including:

```text
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

If the secret entry UI supports multi-line values, paste it as multi-line text. If a tool requires a single-line value, preserve newlines as escaped `\n` sequences and test sign-in after deployment.

## Cognito hosted UI domain checklist

Google and Apple both need the Cognito hosted UI redirect URI:

```text
https://<cognito-hosted-ui-domain>/oauth2/idpresponse
```

Find the active domain in AWS Console:

1. Open **Amazon Cognito → User pools**.
2. Select the Amplify-generated Barista user pool for the target branch/environment.
3. Open **App integration → Domain**.
4. Copy either the Cognito-managed domain or the custom domain.

If using `COGNITO_CUSTOM_DOMAIN`:

1. Ensure the ACM certificate ARN in `COGNITO_CERT_ARN` is valid in `us-east-1`.
2. Deploy the Amplify branch so `amplify/backend.ts` creates the custom domain.
3. Add the DNS record requested by Cognito.
4. Update Google and Apple return/redirect URLs to use the final custom Cognito domain.

## Workload Identity / Vertex AI notes

The LLM Lambda uses Google Workload Identity Federation instead of a downloaded service account JSON key.

Current non-secret identifiers are documented in `amplify/function/gemini-api/README.md` and `docs/ai-model-routing.md`:

- GCP project: `deductive-jet-464913-p8`
- GCP project number: `720226322251`
- Workload pool: `aws-barista`
- Provider: `aws-lambda`
- Service account: `barista-vertex-ai@deductive-jet-464913-p8.iam.gserviceaccount.com`

Do not create or store long-lived GCP service account keys for this Lambda path unless there is an explicit migration decision. If auth breaks, verify the Lambda execution role is still allowed to impersonate the service account through the workload identity provider.

## Verification after changing auth/env values

1. Deploy the target Amplify branch.
2. Wait for the Amplify job to reach `SUCCEED`.
3. Confirm the generated Cognito hosted UI domain is active.
4. Test email/password login.
5. Test Google login.
6. Test Apple login on both web and the relevant iOS/mobile build if applicable.
7. Exercise an LLM chat request and check CloudWatch logs for model routing/fallback metadata.
8. Confirm no real secret values were committed:

```bash
git diff --cached
git grep -n "GOOGLE_CLIENT_SECRET\|APPLE_PRIVATE_KEY\|OPENAI_COMPAT_API_KEY\|OPENAI_API_KEY" -- . ':!docs/environment-and-secrets.md'
```

The grep command above should only find variable names or safe placeholders, never real secret values.
