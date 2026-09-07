const nodemailer = require('nodemailer');

let transporter;

function initEmailService() {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_AUTH_CODE,
    },
  });

  console.log('📧 邮箱服务初始化完成');
}

async function sendVerificationCode(email, code, type = 'register') {
  if (!transporter) initEmailService();

  const typeText = {
    register: '注册账号',
    reset: '重置密码',
    change: '修改邮箱',
  }[type] || '验证邮箱';

  const mailOptions = {
    from: `"云屿官方" <${process.env.SMTP_EMAIL}>`,
    to: email,
    subject: `【云屿】您的${typeText}验证码`,
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">云屿</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">年轻、温暖、有陪伴感的软件社区</p>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 16px 16px;">
          <h2 style="color: #333; margin-top: 0;">${typeText}验证码</h2>
          <p style="color: #666; line-height: 1.6;">您好，您正在使用云屿进行${typeText}，请使用以下验证码完成验证：</p>
          <div style="background: white; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <span style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px;">${code}</span>
          </div>
          <p style="color: #999; font-size: 14px;">验证码有效期为5分钟，请尽快使用。</p>
          <p style="color: #999; font-size: 14px;">如果这不是您本人操作，请忽略此邮件。</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">此邮件由云屿官方自动发送，请勿直接回复。</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ 验证码已发送到 ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ 发送验证码失败:`, error.message);
    return false;
  }
}

async function sendPasswordResetEmail(email, token) {
  if (!transporter) initEmailService();

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost'}?reset_token=${token}`;

  const mailOptions = {
    from: `"云屿官方" <${process.env.SMTP_EMAIL}>`,
    to: email,
    subject: '【云屿】密码重置链接',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">云屿</h1>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 16px 16px;">
          <h2 style="color: #333; margin-top: 0;">重置密码</h2>
          <p style="color: #666; line-height: 1.6;">您好，您请求重置云屿账号密码，请点击下方按钮重置密码：</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; border-radius: 25px; text-decoration: none; font-size: 16px; display: inline-block;">重置密码</a>
          </div>
          <p style="color: #999; font-size: 14px;">链接有效期为30分钟，请尽快使用。</p>
          <p style="color: #999; font-size: 14px;">如果这不是您本人操作，请忽略此邮件。</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ 密码重置邮件已发送到 ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ 发送密码重置邮件失败:`, error.message);
    return false;
  }
}

async function sendNotificationEmail(email, title, content) {
  if (!transporter) initEmailService();

  const mailOptions = {
    from: `"云屿官方" <${process.env.SMTP_EMAIL}>`,
    to: email,
    subject: `【云屿】${title}`,
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">云屿</h1>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 16px 16px;">
          <h2 style="color: #333; margin-top: 0;">${title}</h2>
          <p style="color: #666; line-height: 1.6;">${content}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">此邮件由云屿官方自动发送，请勿直接回复。</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error(`❌ 发送通知邮件失败:`, error.message);
    return false;
  }
}

module.exports = {
  initEmailService,
  sendVerificationCode,
  sendPasswordResetEmail,
  sendNotificationEmail,
};
