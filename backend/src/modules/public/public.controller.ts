import { Controller, Get } from '@nestjs/common';

@Controller()
export class PublicController {
  private layout(title: string, body: string) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;margin:0;color:#0f172a}
    .container{max-width:960px;margin:36px auto;padding:0 20px}
    header{display:flex;align-items:center;justify-content:space-between}
    h1{margin:0;font-size:28px;color:#111827}
    .lead{color:#374151;margin-top:12px;font-size:16px}
    .features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:28px}
    .card{border-radius:8px;padding:18px;background:#fff;box-shadow:0 6px 18px rgba(15,23,42,0.06)}
    a.cta{display:inline-block;background:#0ea5a4;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600}
    footer{margin-top:48px;color:#6b7280;font-size:13px}
    nav a{margin-left:14px;color:#0ea5a4;text-decoration:none}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>BizRecord — Simple bookkeeping for small businesses</h1>
      <nav>
        <a href="/">Home</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </nav>
    </header>
    <p class="lead">Turn your phone into a point-of-sale and inventory manager. Track sales, debts, receipts, and subscriptions with an offline-first mobile app and secure backend.</p>
    ${body}
    <footer>
      <p>© ${new Date().getFullYear()} BizRecord. All rights reserved.</p>
    </footer>
  </div>
</body>
</html>`;
  }

  @Get()
  landing() {
    const body = `
      <section style="margin-top:28px">
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <p style="margin:0 0 12px;color:#374151">Beautiful, fast small-business accounting on mobile. Capture sales, manage stock, and keep customers in sync — even offline.</p>
            <a class="cta" href="mailto:hello@bizrecord.tech?subject=Get%20started">Get in touch</a>
            <p style="color:#6b7280;margin-top:12px">Trusted by shop owners to track sales, send receipts, and automate reminders. Works with your existing cash flow and simplifies bookkeeping.</p>
          </div>
          <div style="flex:1;min-width:240px">
            <img alt="app-preview" src="https://via.placeholder.com/640x360?text=BizRecord+Preview" style="width:100%;border-radius:8px;object-fit:cover" />
          </div>
        </div>
      </section>
      <section style="margin-top:28px">
        <h2>Key features</h2>
        <div class="features">
          <div class="card"><h3 style="margin-top:0">Point of Sale</h3><p style="margin:6px 0 0;color:#6b7280">Quickly record sales, accept cash, and generate PDF receipts customers can receive by email or WhatsApp.</p></div>
          <div class="card"><h3 style="margin-top:0">Inventory & Branches</h3><p style="margin:6px 0 0;color:#6b7280">Track stock across multiple branches, with low-stock alerts and easy transfers.</p></div>
          <div class="card"><h3 style="margin-top:0">Debt tracking</h3><p style="margin:6px 0 0;color:#6b7280">Record credit sales, monitor outstanding balances, and send reminders automatically.</p></div>
          <div class="card"><h3 style="margin-top:0">Reports & Analytics</h3><p style="margin:6px 0 0;color:#6b7280">Daily sales reports, staff performance, and simple export to CSV for accountants.</p></div>
        </div>
      </section>
      <section style="margin-top:28px">
        <h2>Subscriptions & Billing</h2>
        <div class="card">
          <p style="color:#6b7280">We manage subscriptions via Google Play Billing for Android. Purchases made in the Play Store are verified by our backend to activate Pro features and add-ons.</p>
          <ul>
            <li>Monthly and yearly plans</li>
            <li>Add-ons: extra workspaces, extra staff seats, WhatsApp messaging bundles</li>
            <li>Automatic receipt emails and push notifications on activation</li>
          </ul>
        </div>
      </section>
      <section style="margin-top:28px">
        <h2>How it works</h2>
        <div class="card">
          <p style="color:#6b7280">Install the app from Google Play, choose a plan in the app, and complete the purchase using Google Play Billing. Our server verifies the purchase and unlocks your workspace features. For migration or support contact hello@bizrecord.tech.</p>
        </div>
      </section>
      <section style="margin-top:28px">
        <h2>FAQ</h2>
        <div class="card">
          <p style="color:#6b7280"><strong>Can I switch plans?</strong> Yes — upgrade/downgrade from the app. Billing is handled by Google Play; refunds follow Google Play policies.</p>
          <p style="color:#6b7280"><strong>What if I change device?</strong> Your subscription is tied to the Play account; sign in and the app will restore subscription status.</p>
        </div>
      </section>
    `;
    return this.layout('BizRecord — bookkeeping app', body);
  }

  @Get('privacy')
  privacy() {
    const body = `
      <section style="margin-top:28px">
        <div class="card">
          <h2 style="margin-top:0">Privacy Policy</h2>
          <p style="color:#6b7280">This Privacy Policy describes how BizRecord collects, uses, and protects your personal information when you use our mobile app and services.</p>
          <h3>Information we collect</h3>
          <ul>
            <li>Account information (name, email)</li>
            <li>Workspace and transaction data needed to provide the service</li>
            <li>Device identifiers and push notification tokens</li>
          </ul>
          <h3>How we use data</h3>
          <p style="color:#6b7280">We use data to provide and improve the service, process payments, generate receipts, and send notifications. We do not sell your personal data.</p>
          <h3>Security</h3>
          <p style="color:#6b7280">We store data securely using industry best practices. For details about our backend security, contact hello@bizrecord.tech.</p>
        </div>
      </section>
    `;
    return this.layout('Privacy — BizRecord', body);
  }

  @Get('terms')
  terms() {
    const body = `
      <section style="margin-top:28px">
        <div class="card">
          <h2 style="margin-top:0">Terms & Conditions</h2>
          <p style="color:#6b7280">These Terms govern your use of BizRecord. By using the app you agree to these terms.</p>
          <h3>Use of service</h3>
          <p style="color:#6b7280">You may use the service to manage your small business operations. You are responsible for data entered and permissions granted on your account.</p>
          <h3>Billing and subscriptions</h3>
          <p style="color:#6b7280">Paid features are billed via the platform you install the app from (Google Play). Subscription management and refunds follow the store's policies.</p>
          <h3>Contact</h3>
          <p style="color:#6b7280">Contact us at <a href="mailto:hello@bizrecord.tech">hello@bizrecord.tech</a> for questions.</p>
        </div>
      </section>
    `;
    return this.layout('Terms — BizRecord', body);
  }
}

export default PublicController;
