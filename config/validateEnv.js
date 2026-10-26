function validateEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_SECRET', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'BUCKET_PATH', 'BUCKET_BASE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
  for (const key of ['JWT_SECRET', 'REFRESH_SECRET']) {
    if (process.env[key].length < 32 || /change_me|replace_me/i.test(process.env[key])) throw new Error(`${key} must be a unique secret of at least 32 characters`);
  }
  if (process.env.JWT_SECRET === process.env.REFRESH_SECRET) throw new Error('JWT_SECRET and REFRESH_SECRET must differ');
  if (process.env.DATABASE_URL.includes('@localhost') || process.env.DATABASE_URL.includes('@127.0.0.1')) {
    // Local MySQL on the same VPS is valid; the account still needs a password.
    if (/mysql:\/\/[^:]+:@/.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must use a password in production');
  }
}

module.exports = validateEnv;
