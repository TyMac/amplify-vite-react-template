## AWS Amplify React+Vite Starter Template

This repository provides a starter template for creating applications using React+Vite and AWS Amplify, emphasizing easy setup for authentication, API, and database capabilities.

## Overview

This template equips you with a foundational React application integrated with AWS Amplify, streamlined for scalability and performance. It is ideal for developers looking to jumpstart their project with pre-configured AWS services like Cognito, AppSync, and DynamoDB.

## Features

- **Authentication**: Setup with Amazon Cognito for secure user authentication.
- **API**: Ready-to-use GraphQL endpoint with AWS AppSync.
- **Database**: Real-time database powered by Amazon DynamoDB.

## Configuration

Barista-specific environment variables and secrets are documented in [docs/environment-and-secrets.md](docs/environment-and-secrets.md), including:

- Cognito Google and Apple sign-in secrets
- Cognito custom-domain deployment variables
- Gemini/Gemma/OpenAI-compatible Lambda environment variables
- How to generate Google OAuth and Apple Sign in with Apple values

AI model routing, fallback behavior, and CloudWatch debugging details are documented in [docs/ai-model-routing.md](docs/ai-model-routing.md).

## Deploying to AWS

For detailed instructions on deploying your application, refer to the [deployment section](https://docs.amplify.aws/react/start/quickstart/#deploy-a-fullstack-app-to-aws) of our documentation.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.