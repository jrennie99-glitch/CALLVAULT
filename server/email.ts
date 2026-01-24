interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  
  if (resendApiKey) {
    return sendWithResend(options, resendApiKey);
  } else if (sendgridApiKey) {
    return sendWithSendGrid(options, sendgridApiKey);
  } else {
    console.log('Email service not configured. Would have sent:', {
      to: options.to,
      subject: options.subject
    });
    return { success: true, messageId: 'mock-' + Date.now() };
  }
}

async function sendWithResend(options: EmailOptions, apiKey: string): Promise<EmailResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'CallVS <noreply@callvault.app>',
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const data = await response.json();
    
    if (response.ok) {
      return { success: true, messageId: data.id };
    } else {
      return { success: false, error: data.message || 'Resend API error' };
    }
  } catch (error) {
    console.error('Resend email error:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function sendWithSendGrid(options: EmailOptions, apiKey: string): Promise<EmailResult> {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: process.env.EMAIL_FROM || 'noreply@callvault.app' },
        subject: options.subject,
        content: [
          { type: 'text/html', value: options.html },
          ...(options.text ? [{ type: 'text/plain', value: options.text }] : []),
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      return { success: true, messageId: response.headers.get('x-message-id') || 'sendgrid-' + Date.now() };
    } else {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }
  } catch (error) {
    console.error('SendGrid email error:', error);
    return { success: false, error: (error as Error).message };
  }
}

export function generateWelcomeEmail(appUrl: string, plan: string): { subject: string; html: string; text: string } {
  const subject = 'Your CallVS app is ready!';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to CallVS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #1e293b; border-radius: 12px; padding: 32px; text-align: center;">
      <div style="width: 64px; height: 64px; background-color: rgba(16, 185, 129, 0.2); border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 32px;">✓</span>
      </div>
      
      <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 8px;">Welcome to CallVS!</h1>
      <p style="color: #94a3b8; font-size: 16px; margin: 0 0 24px;">Your ${plan} subscription is now active</p>
      
      <a href="${appUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-bottom: 24px;">
        Open CallVS
      </a>
      
      <div style="background-color: #334155; border-radius: 8px; padding: 20px; text-align: left; margin-top: 24px;">
        <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 12px;">📱 Install on Your Phone</h3>
        
        <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px;"><strong>iPhone:</strong></p>
        <ol style="color: #94a3b8; font-size: 14px; margin: 0 0 16px; padding-left: 20px;">
          <li>Open ${appUrl} in Safari</li>
          <li>Tap the Share button</li>
          <li>Select "Add to Home Screen"</li>
        </ol>
        
        <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 12px;"><strong>Android:</strong></p>
        <ol style="color: #94a3b8; font-size: 14px; margin: 0; padding-left: 20px;">
          <li>Open ${appUrl} in Chrome</li>
          <li>Tap the menu (⋮) button</li>
          <li>Select "Install app"</li>
        </ol>
      </div>
      
      <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
        Need help? Reply to this email or visit our support page.
      </p>
    </div>
  </div>
</body>
</html>
  `;
  
  const text = `
Welcome to CallVS!

Your ${plan} subscription is now active.

Open CallVS: ${appUrl}

INSTALL ON YOUR PHONE

iPhone:
1. Open ${appUrl} in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

Android:
1. Open ${appUrl} in Chrome
2. Tap the menu button
3. Select "Install app"

Need help? Reply to this email.
  `;
  
  return { subject, html, text };
}

export function generateTrialInviteEmail(appUrl: string, inviteCode: string, trialDays: number): { subject: string; html: string; text: string } {
  const inviteUrl = `${appUrl}/invite/${inviteCode}`;
  const subject = `You're invited to try CallVS Pro for ${trialDays} days!`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #1e293b; border-radius: 12px; padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 8px;">You're Invited!</h1>
      <p style="color: #94a3b8; font-size: 16px; margin: 0 0 24px;">Try CallVS Pro free for ${trialDays} days</p>
      
      <a href="${inviteUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
      
      <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
        This invitation gives you full access to CallVS Pro features.
      </p>
    </div>
  </div>
</body>
</html>
  `;
  
  const text = `You're Invited to CallVS!

Try CallVS Pro free for ${trialDays} days.

Accept your invitation: ${inviteUrl}

This invitation gives you full access to CallVS Pro features.`;
  
  return { subject, html, text };
}
