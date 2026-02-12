import { defineAuth, secret } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        attributeMapping: {
          email: 'email',
        },
        scopes: ['email', 'profile'],
      },
      signInWithApple: {
        clientId: secret('APPLE_CLIENT_ID'),
        teamId: secret('APPLE_TEAM_ID'),
        keyId: secret('APPLE_KEY_ID'),
        privateKey: secret('APPLE_PRIVATE_KEY'),
        attributeMapping: {
          email: 'email',
        },
        scopes: ['email', 'name'],
      },
      callbackUrls: [
        'exp://r_ecrrw-tymac-8081.exp.direct',
        'https://main.d1dfxp3jics5eo.amplifyapp.com/',
        'https://dev.d1dfxp3jics5eo.amplifyapp.com/',
      ],
      logoutUrls: [
        'exp://r_ecrrw-tymac-8081.exp.direct',
        'https://main.d1dfxp3jics5eo.amplifyapp.com/',
        'https://dev.d1dfxp3jics5eo.amplifyapp.com/',
      ],
    },
  },
});
