Play Console Integration Checklist

This checklist outlines the steps to prepare Google Play subscriptions and RTDN integration for BizRecord.

1. Create Google Cloud Service Account
- Go to Google Cloud Console -> IAM & Admin -> Service Accounts.
- Create a service account for Play Developer API access.
- Grant the role: "Service Account User" and any least-privilege roles required.
- Create and download a JSON key. Store in `GOOGLE_SERVICE_ACCOUNT_JSON` (env) for the backend.

2. Grant Play Console access to service account
- In Play Console -> Settings -> API access, link a Google Cloud project and grant the service account the "View financial data and download reports" and "Manage orders and subscriptions" (or appropriate) permissions.

3. Define Subscription SKUs in Play Console
- Create subscription products matching client SKUs (e.g., `bizrecord_pro_monthly`, `bizrecord_pro_yearly`, `bizrecord_basic_monthly`).
- Record the exact product IDs — they must match the client `SKU_MAP` in the app.

4. Set Up License Testers (for QA)
- In Play Console -> Setup -> License testing, add tester Google accounts for test purchases.
- Use license testers on test devices (signed into the Play Store) to make test purchases without charges.

5. Configure Real-time Developer Notifications (RTDN)
- In Play Console -> Setup -> API access -> Real-time developer notifications, configure a Pub/Sub topic and subscription.
- Create a Pub/Sub push subscription that forwards messages to your backend endpoint (or use a verification layer). Alternatively, use Cloud Pub/Sub + a small subscriber service that POSTs the payload to the backend `POST /billing/webhook/google` endpoint.
- Ensure the backend endpoint URL is reachable from Google (HTTPS). If self-hosted, consider using a Cloud Pub/Sub push gateway or forwarding service.

6. Verify Play Developer API access
- Use the service account JSON to call the Play Developer API (androidpublisher.purchases.subscriptions.get) and confirm you can retrieve subscription purchase info for a test purchase token.

7. Update client SKUs and package name
- Ensure the app `packageName` matches the Play Console app package (ANDROID_PACKAGE_NAME env or client config).
- Update the client `SKU_MAP` to match Play Console product IDs.

8. Test end-to-end flow
- On an Android test device signed into a license tester account, perform a purchase using the app's Play Billing integration.
- Confirm the backend `POST /billing/verify/google` verifies the token and updates the Subscription record.
- Simulate RTDN messages (Play Console test notifications or publish sample messages) and confirm `POST /billing/webhook/google` updates subscription status.

9. Security & Production
- Store the service account JSON securely (use secret manager or env injection during deploy).
- Limit the Google service account permissions to only what's required.
- Validate and rate-limit webhook endpoints.

10. Monitoring & Alerts
- Monitor Pub/Sub delivery failures and webhook errors.
- Record failed verification attempts and alert on repeated failures.

Notes
- For complex RTDN routing, consider a small Pub/Sub subscriber in GCP that forwards messages to your backend with signature verification.
- Coordinate SKU names with Product and Marketing teams to ensure naming and tiers align with billing logic.

If you want, I can convert these steps into a Shareable Playbook with exact CLI commands and example cURL requests for each verification step.