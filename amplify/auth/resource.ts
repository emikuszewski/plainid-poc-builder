import { defineAuth } from '@aws-amplify/backend';
import { preSignUp } from './pre-sign-up/resource';

/**
 * Cognito User Pool restricted to @plainid.com email addresses.
 * The pre-sign-up trigger rejects signups from any other domain.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    email: { required: true, mutable: false },
    fullname: { required: false, mutable: true },
  },
  triggers: {
    preSignUp,
  },
});
