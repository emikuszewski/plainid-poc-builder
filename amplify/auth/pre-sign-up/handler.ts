import type { PreSignUpTriggerHandler } from 'aws-lambda';

const ALLOWED_DOMAIN = 'plainid.com';

export const handler: PreSignUpTriggerHandler = async (event) => {
  const email = event.request.userAttributes.email?.toLowerCase() ?? '';
  const domain = email.split('@')[1];

  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`Sign-up is restricted to @${ALLOWED_DOMAIN} email addresses.`);
  }

  // Auto-confirm @plainid.com users so they can sign in immediately after sign-up.
  // Remove this if you want to require email verification.
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;

  return event;
};
