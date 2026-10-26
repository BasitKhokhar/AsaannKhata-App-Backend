const nodemailer = require('nodemailer');

let transport;

function getTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.MAIL_FROM) {
    throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM are required for password recovery');
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

exports.sendPasswordResetCode = async (email, code) => {
  const appName = process.env.APP_NAME || 'AsaanKhata';
  await getTransport().sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: `${appName} password reset code`,
    text: `Your ${appName} password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
  });
};
