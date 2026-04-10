import { Injectable } from '@nestjs/common';

interface EmailTemplateOptions {
  brandName?: string;
  brandColor?: string;
  supportEmail?: string;
  websiteUrl?: string;
}

@Injectable()
export class EmailTemplateService {
  private defaultOptions: EmailTemplateOptions = {
    brandName: 'BizRecord',
    brandColor: '#2563eb',
    supportEmail: 'support@bizrecord.tech',
    websiteUrl: 'https://bizrecord.tech',
  };

  private baseStyles = `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #374151;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .header-subtitle {
      margin-top: 8px;
      font-size: 14px;
      opacity: 0.9;
      font-weight: 500;
    }
    .content {
      padding: 40px 30px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
    }
    .code-box {
      background-color: #f3f4f6;
      border-left: 4px solid #2563eb;
      padding: 20px;
      border-radius: 4px;
      margin: 20px 0;
      text-align: center;
    }
    .code-box .code {
      font-size: 32px;
      font-weight: 700;
      color: #2563eb;
      letter-spacing: 4px;
      font-family: 'Courier New', monospace;
    }
    .code-box .expiry {
      font-size: 12px;
      color: #6b7280;
      margin-top: 12px;
      font-weight: 500;
    }
    .button {
      display: inline-block;
      padding: 12px 28px;
      background-color: #2563eb;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      margin: 16px 0;
      transition: background-color 0.2s;
    }
    .button:hover {
      background-color: #1d4ed8;
    }
    .button-secondary {
      background-color: #6b7280;
    }
    .button-secondary:hover {
      background-color: #4b5563;
    }
    .info-box {
      background-color: #eff6ff;
      border-left: 4px solid #2563eb;
      padding: 16px;
      border-radius: 4px;
      margin: 20px 0;
      font-size: 14px;
    }
    .info-box strong {
      color: #1e40af;
    }
    .divider {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 30px 0;
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    .footer-link {
      color: #2563eb;
      text-decoration: none;
      margin: 0 8px;
    }
    .footer-link:hover {
      text-decoration: underline;
    }
    .logo {
      font-size: 18px;
      font-weight: 700;
      color: white;
      letter-spacing: -1px;
    }
    .highlight {
      color: #2563eb;
      font-weight: 600;
    }
    .success {
      color: #059669;
    }
    .warning {
      color: #d97706;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      background-color: #f3f4f6;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #111827;
      border-bottom: 2px solid #e5e7eb;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    tr:last-child td {
      border-bottom: none;
    }
  `;

  constructor() {}

  private getBaseTemplate(
    content: string,
    title: string,
    subtitle?: string,
    options?: Partial<EmailTemplateOptions>,
  ): string {
    const config = { ...this.defaultOptions, ...options };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>${this.baseStyles}</style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <div class="logo">${config.brandName}</div>
            ${subtitle ? `<div class="header-subtitle">${subtitle}</div>` : ''}
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${config.brandName}. All rights reserved.</p>
            <p>
              <a href="${config.websiteUrl}" class="footer-link">Website</a>
              <a href="mailto:${config.supportEmail}" class="footer-link">Support</a>
            </p>
            <p style="margin-top: 16px; color: #9ca3af;">
              You're receiving this email because you have an account with ${config.brandName}.
              <br/>If you didn't request this, please ignore this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  emailVerification(
    code: string,
    options?: Partial<EmailTemplateOptions>,
  ): string {
    const config = { ...this.defaultOptions, ...options };
    const content = `
      <h2 style="margin-top: 0; color: #111827;">Verify Your Email</h2>
      <p>Welcome to ${config.brandName}! To complete your account setup and ensure the security of your account, please verify your email address.</p>
      
      <div class="code-box">
        <div class="code">${code}</div>
        <div class="expiry">This code expires in 10 minutes</div>
      </div>

      <p><strong>What's next?</strong></p>
      <ol style="color: #374151;">
        <li>Open ${config.brandName} on your device</li>
        <li>Enter the verification code above</li>
        <li>Complete your account setup</li>
      </ol>

      <div class="info-box">
        <strong>Security Note:</strong> Never share this code with anyone. ${config.brandName} support will never ask for your verification code.
      </div>
    `;

    return this.getBaseTemplate(
      content,
      'Verify Your Email',
      'Email Verification Required',
      options,
    );
  }

  passwordReset(
    code: string,
    options?: Partial<EmailTemplateOptions>,
  ): string {
    const config = { ...this.defaultOptions, ...options };
    const content = `
      <h2 style="margin-top: 0; color: #111827;">Reset Your Password</h2>
      <p>We received a request to reset your ${config.brandName} account password. If you didn't make this request, you can ignore this email.</p>
      
      <div class="code-box">
        <div class="code">${code}</div>
        <div class="expiry">This code is valid for 10 minutes</div>
      </div>

      <p><strong>To reset your password:</strong></p>
      <ol style="color: #374151;">
        <li>Open the password reset form in ${config.brandName}</li>
        <li>Enter the reset code above</li>
        <li>Create a new password</li>
        <li>Sign in with your new password</li>
      </ol>

      <div class="info-box">
        <strong>Need help?</strong> If you didn't request this reset, your account may be at risk. Please contact our support team immediately at <a href="mailto:${config.supportEmail}" class="footer-link">${config.supportEmail}</a>.
      </div>
    `;

    return this.getBaseTemplate(
      content,
      'Password Reset',
      'Password Reset Request',
      options,
    );
  }

  workspaceInvite(
    inviteCode: string,
    workspaceName: string,
    inviteRole: string,
    expiresAt: Date,
    branchInfo?: { name: string; role: string },
    options?: Partial<EmailTemplateOptions>,
  ): string {
    const config = { ...this.defaultOptions, ...options };
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const content = `
      <h2 style="margin-top: 0; color: #111827;">You're Invited!</h2>
      <p>You have been invited to join the <span class="highlight">${workspaceName}</span> workspace as a <span class="highlight">${inviteRole}</span>.</p>
      
      ${
        branchInfo
          ? `<p style="margin-bottom: 20px; color: #059669;"><strong>✓ Branch Access:</strong> You'll also be added to the <span class="highlight">${branchInfo.name}</span> branch as a <span class="highlight">${branchInfo.role}</span>.</p>`
          : ''
      }

      <div class="code-box">
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 12px;">Your Invite Code:</div>
        <div class="code">${inviteCode}</div>
        <div class="expiry">Valid until ${expiryDate}</div>
      </div>

      <p><strong>How to accept the invitation:</strong></p>
      <ol style="color: #374151;">
        <li>Sign in to ${config.brandName} with your account</li>
        <li>Go to "Workspaces" → "Join Workspace"</li>
        <li>Enter the invite code: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">${inviteCode}</code></li>
        <li>Confirm to join</li>
      </ol>

      <div class="info-box">
        <strong>Questions?</strong> Reach out to the workspace owner or contact us at <a href="mailto:${config.supportEmail}" class="footer-link">${config.supportEmail}</a>.
      </div>
    `;

    return this.getBaseTemplate(
      content,
      'Workspace Invitation',
      'You\'re Invited to Join a Workspace',
      options,
    );
  }

  paymentSuccess(
    plan: string,
    amount: string,
    reference: string,
    renewalDate?: Date,
    options?: Partial<EmailTemplateOptions>,
  ): string {
    const config = { ...this.defaultOptions, ...options };
    const renewalText = renewalDate
      ? new Date(renewalDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

    const content = `
      <h2 style="margin-top: 0; color: #111827;">Payment Confirmed ✓</h2>
      <p>Your payment has been processed successfully. Thank you for choosing ${config.brandName}!</p>
      
      <table>
        <tr>
          <th style="text-align: left; font-weight: 600; color: #111827;">Plan</th>
          <td>
            <span class="highlight" style="font-size: 16px; font-weight: 700;">${plan}</span>
          </td>
        </tr>
        <tr>
          <th style="text-align: left; font-weight: 600; color: #111827;">Amount Paid</th>
          <td style="font-size: 18px; font-weight: 700; color: #059669;">${amount}</td>
        </tr>
        <tr>
          <th style="text-align: left; font-weight: 600; color: #111827;">Reference</th>
          <td><code style="background: #f3f4f6; padding: 4px 8px; border-radius: 3px; font-family: monospace; font-size: 12px;">${reference}</code></td>
        </tr>
        ${
          renewalText
            ? `
        <tr>
          <th style="text-align: left; font-weight: 600; color: #111827;">Next Renewal</th>
          <td>${renewalText}</td>
        </tr>
        `
            : ''
        }
      </table>

      <div class="info-box">
        <strong>📋 What you can do now:</strong>
        <ul style="margin: 12px 0 0 0; padding-left: 20px;">
          <li>Access all ${plan} features immediately</li>
          <li>Invite team members to collaborate</li>
          <li>Set up your workspaces and branches</li>
        </ul>
      </div>

      <p style="margin-top: 24px; text-align: center;">
        <a href="${config.websiteUrl}/app" class="button">Go to ${config.brandName}</a>
      </p>
    `;

    return this.getBaseTemplate(
      content,
      'Payment Successful',
      'Your Payment Has Been Processed',
      options,
    );
  }

  inventoryAlert(
    itemName: string,
    workspaceName: string,
    alertType: 'created' | 'low_stock' | 'out_of_stock',
    additionalInfo?: Record<string, string>,
    options?: Partial<EmailTemplateOptions>,
  ): string {
    const config = { ...this.defaultOptions, ...options };

    const titles = {
      created: { head: 'Inventory Item Created', sub: 'New item added to your inventory' },
      low_stock: { head: 'Low Stock Alert', sub: 'An item is running low' },
      out_of_stock: { head: 'Out of Stock Alert', sub: 'An item has run out of stock' },
    };

    const title = titles[alertType];
    const iconMap = {
      created: '✓',
      low_stock: '⚠',
      out_of_stock: '🚨',
    };

    const content = `
      <h2 style="margin-top: 0; color: #111827;">${iconMap[alertType]} ${title.head}</h2>
      <p>In workspace <span class="highlight">${workspaceName}</span>:</p>
      
      <div class="info-box">
        <strong style="font-size: 16px; color: #111827;">${itemName}</strong>
        ${
          additionalInfo
            ? Object.entries(additionalInfo)
                .map(
                  ([key, value]) =>
                    `<div style="margin-top: 8px;"><strong>${key}:</strong> ${value}</div>`,
                )
                .join('')
            : ''
        }
      </div>

      <p><strong>Recommended Action:</strong></p>
      <ul style="color: #374151;">
        ${
          alertType === 'created'
            ? '<li>Review the new item to ensure all details are correct</li><li>Set appropriate stock levels</li>'
            : ''
        }
        ${
          alertType === 'low_stock'
            ? '<li>Consider placing a new order to avoid stockouts</li><li>Check your reorder thresholds</li>'
            : ''
        }
        ${
          alertType === 'out_of_stock'
            ? '<li>Place an order immediately if needed</li><li>Update reorder settings to prevent future stockouts</li>'
            : ''
        }
      </ul>

      <p style="margin-top: 24px; text-align: center;">
        <a href="${config.websiteUrl}/app/inventory" class="button">Check Inventory</a>
      </p>
    `;

    return this.getBaseTemplate(
      content,
      title.head,
      title.sub,
      options,
    );
  }

  genericNotification(
    title: string,
    message: string,
    details?: string,
    actionButton?: { text: string; url: string },
    options?: Partial<EmailTemplateOptions>,
  ): string {
    let content = `
      <h2 style="margin-top: 0; color: #111827;">${title}</h2>
      <p>${message}</p>
    `;

    if (details) {
      content += `
        <div class="info-box">
          ${details}
        </div>
      `;
    }

    if (actionButton) {
      content += `
        <p style="text-align: center; margin-top: 24px;">
          <a href="${actionButton.url}" class="button">${actionButton.text}</a>
        </p>
      `;
    }

    return this.getBaseTemplate(content, title, '', options);
  }

  invoiceEmail(transaction: any, receiptUrl: string, options?: Partial<EmailTemplateOptions>) {
    const config = { ...this.defaultOptions, ...options };
    const lineItems = (transaction.lineItems || []).map((li: any) => ({
      name: li.name || li.itemId,
      quantity: li.quantity,
      unitPrice: `NGN ${Number(li.unitPrice || 0).toLocaleString()}`,
      discountAmount: `NGN ${Number(li.discountAmount || 0).toLocaleString()}`,
      total: `NGN ${Number(li.total || 0).toLocaleString()}`,
    }));

    const grandTotal = `NGN ${Number(transaction.totalAmount || 0).toLocaleString()}`;

    // Simple templating: inject into the HTML template file if present, otherwise build inline
    let html = '';
    try {
      // load template file relative to this service
      // NOTE: synchronous read to keep implementation simple
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      const path = require('path');
      const tplPath = path.join(__dirname, 'email-templates', 'invoice.html');
      let tpl = fs.readFileSync(tplPath, 'utf8');
      tpl = tpl.replace(/{{receiptUrl}}/g, receiptUrl);
      const rows = lineItems
        .map((li: any) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eef2ff">${li.name}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2ff;text-align:right">${li.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2ff;text-align:right">${li.unitPrice}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2ff;text-align:right">${li.discountAmount}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2ff;text-align:right">${li.total}</td>
          </tr>`)
        .join('\n');
      tpl = tpl.replace(/{{#each lineItems}}[\s\S]*?{{\/each}}/, rows);
      tpl = tpl.replace(/{{grandTotal}}/g, grandTotal);
      html = tpl;
    } catch (e) {
      // fallback inline HTML
      html = `
        <div>
          <h2>Your Receipt</h2>
          <p><a href="${receiptUrl}">View receipt</a></p>
          <p>Grand Total: ${grandTotal}</p>
        </div>
      `;
    }

    return this.getBaseTemplate(html, 'Your Receipt', '', options);
  }

  plainText(htmlContent: string): string {
    // Basic HTML to plain text conversion
    return htmlContent
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }
}
