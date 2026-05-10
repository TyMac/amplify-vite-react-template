# Barista AI model routing, fallback, and attribution

Last updated: 2026-05-10

This document explains how Barista routes chat/vision requests across Gemma 4 and Gemini, how fallback works, and how the UI shows which model produced each assistant response.

## Backend entry points

The AppSync custom queries are defined in:

- `amplify/data/resource.ts`

The Lambda handler is defined in:

- `amplify/function/gemini-api/handler.ts`

Current AI query entry points:

- `geminiChat`
  - normal chat
  - recipe generation
  - anonymous daily quota enforcement
  - RAG retrieval/injection
  - Gemma 4 first if `CHAT_MODEL_PROVIDER=gemma4`
  - Gemini Flash Lite fallback
- `geminiVision`
  - image analysis
  - Gemma 4 first if `VISION_MODEL_PROVIDER=gemma4`
  - Gemini Flash fallback
- `extractJournalFields`
  - structured extraction from chat/journal context
  - Gemini Flash Lite

## Important environment variables

Configured in `amplify/function/gemini-api/resource.ts` and deployed into the Lambda environment.

| Variable | Purpose |
| --- | --- |
| `CHAT_MODEL_PROVIDER` | Set to `gemma4` to try Gemma 4 first for chat. Otherwise uses Gemini directly. |
| `VISION_MODEL_PROVIDER` | Set to `gemma4` to try Gemma 4 first for image analysis. Otherwise uses Gemini directly. |
| `GEMMA4_MAAS_MODEL` | Gemma 4 MaaS model name, currently `google/gemma-4-26b-a4b-it-maas`. |
| `GEMMA4_CHAT_TIMEOUT_MS` | Max time to wait for Gemma 4 chat before fallback. Currently 8000 ms. |
| `GEMMA4_VISION_TIMEOUT_MS` | Max time to wait for Gemma 4 vision before fallback. Currently 20000 ms. |
| `VERTEX_LOCATION` | Gemini/RAG location, currently `us-south1`. Do not change casually because the RAG corpus lives there. |
| `VERTEX_OPENAI_LOCATION` | Vertex OpenAI-compatible endpoint location for Gemma MaaS, currently `global`. |
| `RAG_LOCATION` | RAG retrieval location, currently `us-south1`. |
| `RAG_CORPUS` | Full Vertex RAG corpus resource path. |

## Gemma 4 chat route

`geminiChat()` builds the prompt, retrieves RAG context, then logs model selection:

```ts
console.info('Chat model selection started', {
  requestedProvider,
  gemmaModel: GEMMA4_MAAS_MODEL,
  openAiLocation: VERTEX_OPENAI_LOCATION,
  messageCount: messages.length,
  latestUserMessageLength: latestUserMessage.length,
  ragContextLength: ragContext.length,
  maxOutputTokens,
});
```

If `CHAT_MODEL_PROVIDER === 'gemma4'`, the Lambda calls Vertex AI's OpenAI-compatible endpoint:

```ts
https://aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${VERTEX_OPENAI_LOCATION}/endpoints/openapi/chat/completions
```

Payload essentials:

```ts
{
  model: GEMMA4_MAAS_MODEL,
  stream: false,
  max_tokens: maxOutputTokens,
  messages: [...],
  temperature: 0.7,
  top_p: 0.95,
  chat_template_kwargs: {
    enable_thinking: false,
  },
}
```

`enable_thinking: false` is intentional. Previous testing showed thinking mode and large outputs made Gemma 4 too slow for Barista's interactive chat path.

## Chat max output tokens

Normal chat defaults to a lower output budget:

```ts
const maxOutputTokens = Math.min(Math.max(Number(args.maxOutputTokens || 1536), 256), 4096);
```

Reason:

- Gemma 4 MaaS can be latency-sensitive.
- Normal coffee chat rarely needs 4096 output tokens.
- Smaller output caps reduce the chance that Gemma exceeds `GEMMA4_CHAT_TIMEOUT_MS` and falls back.

Recipe generation explicitly opts back into 4096 tokens:

- `src/services/recipeGeneration.ts`

```ts
chatWithGemini(messages, RECIPE_SYSTEM_PROMPT, { maxOutputTokens: 4096 })
```

Reason:

- Recipe generation expects structured JSON.
- Earlier 1024-token limits caused truncated/malformed recipe JSON.
- Do not lower recipe generation without validating JSON completeness.

## Chat fallback behavior

Gemma 4 chat is wrapped in:

```ts
withTimeout(callGemma4Chat(), GEMMA4_CHAT_TIMEOUT_MS, 'gemma4_chat')
```

If Gemma 4 succeeds and returns non-empty text, the response metadata is:

```json
{
  "providerUsed": "gemma4",
  "modelUsed": "google/gemma-4-26b-a4b-it-maas",
  "requestedProvider": "gemma4",
  "fallbackUsed": false,
  "fallbackReason": null
}
```

If Gemma 4 times out, returns empty text, or throws, the Lambda falls back to Gemini Flash Lite:

- fallback model: `gemini-2.0-flash-lite-001`
- fallback reason examples:
  - `gemma_error:gemma4_chat_timeout_8000ms`
  - `gemma_empty_response`
  - `gemma_error:429`
  - `gemma_error:403`

Fallback response metadata example:

```json
{
  "providerUsed": "gemini",
  "modelUsed": "gemini-2.0-flash-lite-001",
  "requestedProvider": "gemma4",
  "fallbackUsed": true,
  "fallbackReason": "gemma_error:gemma4_chat_timeout_8000ms"
}
```

## Vision fallback behavior

`geminiVision()` uses the same general pattern:

- request Gemma 4 first when `VISION_MODEL_PROVIDER=gemma4`
- wrap Gemma in `GEMMA4_VISION_TIMEOUT_MS`
- fall back to `gemini-2.0-flash-001`

Common fallback reasons:

- `gemma_error:gemma4_vision_timeout_20000ms`
- `gemma_error:429`
- `gemma_empty_response`

Vision response metadata includes:

```json
{
  "analysis": "...",
  "requestedProvider": "gemma4",
  "providerUsed": "gemini",
  "modelUsed": "gemini-2.0-flash-001",
  "fallbackUsed": true,
  "fallbackReason": "gemma_error:gemma4_vision_timeout_20000ms",
  "tokensUsed": 298,
  "latencyMs": 21111,
  "providerLatencyMs": 1095
}
```

## RAG interaction and latency

`geminiChat()` always retrieves RAG context from the latest user message and injects it before the base system prompt.

Important latency implication:

- A very short follow-up like `roast date is 5/5/2026` can still retrieve and inject a large context block.
- Example observed on 2026-05-10: 11,226 chars of RAG context caused Gemma 4 chat to hit the 8000 ms timeout and fall back.

If Gemma 4 keeps timing out even after the 1536-token chat cap, next candidates are:

1. skip RAG for short/low-information follow-ups
2. cap total injected RAG chars
3. lower `similarityTopK`
4. raise `GEMMA4_CHAT_TIMEOUT_MS` to 15000-20000 ms

## Frontend model attribution

The backend response includes metadata, but the UI needs to preserve it.

Web implementation:

- `src/services/gemini.ts`
  - `AiTextResult`
  - `chatWithGeminiResult()`
  - `analyzeImageWithGeminiResult()`
  - `getModelDisplayLabel()`
  - legacy string helpers still exist for compatibility
- `src/services/chatStorage.ts`
  - `ChatMessage.modelLabel?: string`
- `src/pages/ChatPage.tsx`
  - stores `modelLabel` on assistant messages
  - renders a small label inside assistant bubbles
- `src/components/LiveBrewCoachDock.tsx`
  - stores `modelLabel` for vision/photo coaching responses

The display label intentionally stays simple:

```ts
if (combined.includes('gemma')) return 'Gemma';
if (combined.includes('gemini')) return 'Gemini';
```

Check `gemma` before `gemini` so any provider/model fallback text cannot mislabel Gemma variants.

## Debugging commands

Tail recent Lambda logs:

```bash
/snap/bin/aws logs tail /aws/lambda/amplify-d1dfxp3jics5eo-dev-geminiapilambda02F67C34-uudH072jtxrS \
  --since 30m --format short 2>&1 | tail -100
```

Find routing/fallback messages:

```bash
/snap/bin/aws logs tail /aws/lambda/amplify-d1dfxp3jics5eo-dev-geminiapilambda02F67C34-uudH072jtxrS \
  --since 30m --format short 2>&1 \
  | grep -E 'Chat model|Vision model|Gemma 4|fallback|providerUsed|modelUsed|maxOutputTokens'
```

Check Lambda environment:

```bash
/snap/bin/aws lambda get-function-configuration \
  --function-name amplify-d1dfxp3jics5eo-dev-geminiapilambda02F67C34-uudH072jtxrS \
  --query 'Environment.Variables' --output json
```

Check current Amplify dev deployment:

```bash
/snap/bin/aws amplify list-jobs --app-id d1dfxp3jics5eo --branch-name dev \
  --max-results 3 --query 'jobSummaries[*].{jobId:jobId,status:status,commitId:commitId,commitMessage:commitMessage}' --output table
```

## Verification checklist after changes

1. Run web build:

```bash
cd ~/amplify-vite-react-template
npm run build
```

2. Push to `dev`.

3. Wait for Amplify dev build to finish.

4. Send a normal chat message and check CloudWatch logs for:

- `requestedProvider: 'gemma4'`
- `maxOutputTokens: 1536`
- `providerUsed: 'gemma4'` or fallback metadata

5. Generate a recipe and check logs for:

- `maxOutputTokens: 4096`

6. In the web UI, assistant bubbles should show a tiny `Gemma` or `Gemini` label when model metadata is present.

## Common pitfalls

- Do not remove the legacy `chatWithGemini()` and `analyzeImageWithGemini()` string-returning wrappers; older call sites may still use them.
- Do not lower recipe generation tokens without testing full JSON parsing.
- Do not move `VERTEX_LOCATION` away from `us-south1` unless the RAG corpus also moves.
- Do not call Gemma MaaS through the normal Gemini publisher endpoint; Gemma MaaS uses the OpenAI-compatible endpoint.
- If logs show `gemma4_chat_timeout_8000ms`, Gemma was selected and called. The failure was latency, not model selection.
