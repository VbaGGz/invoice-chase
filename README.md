# Invoice Chase

A dead-simple, mobile-first Progressive Web App that lets small business owners scan unpaid invoices, extract key details with on-device OCR, and automatically schedule polite payment reminder emails.

**Zero backend. Zero cost beyond your own free EmailJS account (200 emails/mo). Data stays on your phone.**

## Quick Start (End Users)

1. Open `index.html` in any modern browser (best on phone).
2. Tap **Scan New Invoice** → use camera or gallery.
3. Or tap **Load Demo Invoice** (great for trying without a real photo).
4. Review/edit the extracted fields (especially the customer email!).
5. Tap **Start Chasing** — reminders are scheduled relative to the due date.
6. Go to **My Invoices** to see status and manually trigger sends.

Reminders only fire when you open the app (reliable client-side limitation). Open it regularly or pin to your home screen.

## Email Reminders (one-time setup)

1. Go to [emailjs.com](https://www.emailjs.com) and create a free account.
2. Add your email provider (Gmail is easiest).
3. Create a new **Email Template** and paste the exact content from the template below.
4. In the app → Settings (gear icon) → paste your **Public Key**, **Service ID**, and **Template ID**.
5. Save. You're done.

### Recommended EmailJS Template

Subject:
```
Payment Reminder - Invoice {{invoice_number}} from {{business_name}}
```

Body:
```
Hi {{customer_name}},

This is a polite reminder about invoice **{{invoice_number}}** for **{{amount}}** which was due on {{due_date}}.

{{reminder_label}} ({{days_late}} days {{late_or_until}}).

Please arrange payment at your earliest convenience. If you've already paid, please disregard this message.

Thank you for your business!

Best regards,
{{business_name}}
```

Declare these template variables in EmailJS: `customer_name`, `customer_email`, `invoice_number`, `amount`, `due_date`, `business_name`, `reminder_label`, `days_late`, `late_or_until`.

## Hosting (Vercel / Netlify — 30 seconds)

- Netlify Drop: drag the whole folder onto https://app.netlify.com/drop
- Vercel: import the repo or use `vercel --prod`
- Any static host works. No build step.

## For Developers / Customization

The entire app is three files (`index.html`, `app.js`, `styles.css` if you split it) + manifest + sw.

Everything is commented and intentionally simple.

### Live Development with Visual + E2E Feedback (Recommended)

This project is wired to the excellent **playwright-toolkit** (located at `C:\Users\Vincent\Tools\playwright-toolkit`).

```bash
# 1. Serve the current files
cd "C:\Users\Vincent\Documents\Coding\Invoice Chase"
python -m http.server 8080
# (or `npm run serve` after `npm install`)

# 2. After any edit to HTML/JS/CSS, immediately run live checks:
PWTK_BASE_URL=http://localhost:8080 node C:\Users\Vincent\Tools\playwright-toolkit\bin\pwtk.mjs capture --dry-run --devices=mobile

# Fast visual on real device sizes + slow 3G (perfect for the "fast on slow connections" goal)
PWTK_BASE_URL=http://localhost:8080 PWTK_THROTTLE=slow3g node C:\Users\Vincent\Tools\playwright-toolkit\bin\pwtk.mjs capture --devices=iphone-15-pro,pixel-7

# Functional E2E tests
PWTK_BASE_URL=http://localhost:8080 npx playwright test

# View gorgeous multi-device gallery
start ui-captures/index.html
```

See `package.json` scripts and the "UI Testing" section below for more.

## UI Testing with playwright-toolkit

(Full details in the toolkit's CLAUDE.md / SETUP.md)

**First time setup (already done for you):**
- `package.json`, `playwright.config.ts`, `routes.json`, `e2e/`, `.env.example` are present.
- Run `npm install` once in this folder (only needed for the test runner).

**Common commands (use the direct node paths for live dev):**
- Dry run: `node C:\Users\Vincent\Tools\playwright-toolkit\bin\pwtk.mjs capture --dry-run`
- Mobile + slow3g: `PWTK_THROTTLE=slow3g node ... capture --devices=mobile`
- Visual regression: `... capture --baseline` then `... diff`
- E2E: `PWTK_BASE_URL=http://localhost:8080 npx playwright test`

The toolkit gives you 22 device profiles, pixel-perfect diffs, and throttled network testing — exactly what is needed to prove the app is fast and beautiful on real phones.

## Roadmap / Phases (how this was built)

- **Phase 1** (current): Core shell, camera + demo canvas, basic persistence, UI, PWA stubs, testing loop.
- **Phase 2**: Real Tesseract.js OCR + smart field extraction + review form polish.
- **Phase 3**: EmailJS integration, real scheduling engine (on-open + manual sync), full My Invoices actions, Settings, final polish + README.

## Limitations (honest)

- True background sending without a server is not reliably possible on all devices (Periodic Sync is limited). The app checks and sends the next time you open it.
- First OCR download is ~15 MB (then cached forever).
- 200 emails/month free from EmailJS (plenty for most small businesses).

## License

MIT — do whatever you want with it. Make your small business life easier.

---

Built with care for non-technical users who just want to get paid faster.
