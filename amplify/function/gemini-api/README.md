# Gemini API Lambda Function

This Lambda function provides secure access to Google Cloud Vertex AI (Gemini) from the Barista mobile app using **Workload Identity Federation** (no service account keys needed!).

## How It Works

### Architecture

```
Mobile App → AppSync → Lambda (AWS) → Workload Identity → GCP Vertex AI
```

1. **Mobile app** calls AppSync GraphQL API
2. **AppSync** invokes Lambda function
3. **Lambda** uses its AWS IAM role credentials
4. **Workload Identity Federation** exchanges AWS credentials for GCP access token
5. **GCP** allows access to Vertex AI Gemini APIs
6. **Responses** flow back through the chain

### Security Benefits

✅ **No service account keys** stored anywhere  
✅ **No credentials in mobile app** (can't be extracted)  
✅ **Automatic credential rotation** (AWS manages Lambda role)  
✅ **Rate limiting** via Lambda concurrency  
✅ **Cost control** via usage monitoring  
✅ **Audit trail** via CloudWatch logs  

## Configuration

### GCP Setup (Already Done)

- **Project ID**: `deductive-jet-464913-p8`
- **Project Number**: `720226322251`
- **Workload Identity Pool**: `aws-barista`
- **Provider**: `aws-lambda`
- **Service Account**: `barista-vertex-ai@deductive-jet-464913-p8.iam.gserviceaccount.com`
- **Permissions**: Vertex AI User role

### AWS IAM Requirements

The Lambda execution role needs permission to call:
- `sts:GetCallerIdentity` - Required for Workload Identity Federation
- `sts:AssumeRole` - Required for token exchange

Already configured in `backend.ts`.

## API Usage

### GraphQL Queries

#### Chat with Gemini

```graphql
query GeminiChat {
  geminiChat(
    messages: [
      "{\"role\":\"user\",\"content\":\"I have Ethiopian beans, light roast. How should I brew them?\"}",
      "{\"role\":\"assistant\",\"content\":\"Great choice! Ethiopian light roasts...\"}",
      "{\"role\":\"user\",\"content\":\"I have a Comandante grinder\"}"
    ]
    systemPrompt: "You are an expert barista assistant..."
  )
}
```

**Response** (JSON string):
```json
{
  "response": "Perfect! With a Comandante and Ethiopian light roast...",
  "tokensUsed": 245
}
```

#### Analyze Image

```graphql
query GeminiVision {
  geminiVision(
    imageBase64: "/9j/4AAQSkZJRg..." # base64 JPEG
    prompt: "What kind of coffee beans are these?"
  )
}
```

**Response** (JSON string):
```json
{
  "analysis": "This appears to be a light roast Ethiopian coffee...",
  "tokensUsed": 156
}
```

## Cost Monitoring

### Google Developer Credits

- **Monthly budget**: $45 (from Google Developer Program)
- **Current balance**: $90 available (Nov + Dec credits)

### Cost Estimates

**Gemini 2.0 Flash** (Chat):
- ~$0.10 per 1M tokens
- Average message: ~500 tokens
- ~2,000 messages per dollar
- **Monthly budget**: ~90,000 messages

**Gemini Pro Vision** (Images):
- ~$1.00 per 1M tokens  
- Average image analysis: ~1,000 tokens
- ~1,000 analyses per dollar
- **Monthly budget**: ~45,000 image scans

### Expected Usage (Development)

Estimated monthly cost during development: **$5-10**
- ~1,000 chat messages
- ~100 image analyses
- Plenty of headroom with $45/month credits

## Troubleshooting

### Lambda Errors

**Check CloudWatch Logs**:
```bash
aws logs tail /aws/lambda/gemini-api --follow
```

**Common issues**:

1. **"google.auth.exceptions.RefreshError"**
   - Workload Identity Federation not configured properly
   - Check GCP service account has Vertex AI User role
   - Verify Lambda role has STS permissions

2. **"403 Forbidden"**
   - Service account lacks Vertex AI permissions
   - Workload pool → service account binding missing

3. **"Timeout"**
   - Increase Lambda timeout (currently 30s)
   - Check network connectivity to GCP

### Test Locally

To test the Workload Identity Federation flow:

```bash
# Set AWS credentials
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...

# Run handler
node handler.ts
```

## Deployment

### Via Amplify CLI

```bash
cd /home/tmcadams/barista
npx ampx sandbox  # local dev
npx ampx deploy   # production
```

### Manual Deploy

If Amplify doesn't pick up the function:

```bash
cd amplify/function/gemini-api
npm install
zip -r function.zip .
aws lambda update-function-code \
  --function-name gemini-api \
  --zip-file fileb://function.zip
```

## Next Steps

1. **Update mobile app** to call AppSync instead of local mocks
2. **Add error handling** for offline/network failures
3. **Implement caching** for common queries
4. **Monitor usage** via CloudWatch metrics
5. **Set up alerts** for high token usage

## References

- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Vertex AI Gemini API](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini)
- [Amplify Functions](https://docs.amplify.aws/react/build-a-backend/functions/)
