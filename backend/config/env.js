// Production env for WhatsApp SaaS / Meta onboarding
module.exports = {
  PORT: process.env.PORT || 5000,
  APP_ID: process.env.APP_ID || process.env.META_APP_ID,
  APP_SECRET: process.env.APP_SECRET || process.env.META_APP_SECRET,
  REDIRECT_URI: process.env.REDIRECT_URI || process.env.META_REDIRECT_URI,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || process.env.Verify_Token,
};
