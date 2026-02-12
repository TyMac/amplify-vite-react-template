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
      callbackUrls: [
        'http://localhost:5173/',
        'https://main.d1dfxp3jics5eo.amplifyapp.com/',
        'https://dev.d1dfxp3jics5eo.amplifyapp.com/',
      ],
      logoutUrls: [
        'http://localhost:5173/',
        'https://main.d1dfxp3jics5eo.amplifyapp.com/',
        'https://dev.d1dfxp3jics5eo.amplifyapp.com/',
      ],
    },
  },
});
