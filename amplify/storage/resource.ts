import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'user-files',
  access: (allow) => ({
    'private/{entity_id}/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
      allow.entity('identity').to(['read', 'write', 'delete'])
    ]
  })
});
