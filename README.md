# Google Maps Platform pricing calculator — US vs India

An uncapped cost estimator for Google Maps Platform, with the **US (global) price
list and the India price list side by side**.

Google's own [pricing calculator](https://mapsplatform.google.com/pricing/#pricing-calculator)
stops estimating once your volume passes its slider limits and switches to
"contact sales". This one doesn't: enter any monthly call volume — 10 or 500
million — and it computes the cost from the published rate tables all the way up.

## What it does

- **Two panels, one set of inputs.** Enter monthly volumes once; the US and India
  panels price the same workload simultaneously and show the percentage gap.
- **All 74 core-service SKUs**, including the legacy Places and Routes SKUs
  (hidden behind a toggle).
- **Graduated tier maths, shown transparently.** Expand any line to see exactly
  how many calls landed in each volume tier and at what rate.
- **Free monthly caps applied** (10K/5K/1K per SKU for the US list, 70K/35K/7K
  for India), with a toggle to price the raw volume instead.
- **INR display** for the India panel at an editable USD→INR rate — Google
  publishes both lists in USD but bills India accounts in INR.
- Shareable URL state, CSV export, dark mode.

## Where the numbers come from

`src/data/pricing.json` is generated — not hand-typed — from Google's two
published price lists:

- <https://developers.google.com/maps/billing-and-pricing/pricing>
- <https://developers.google.com/maps/billing-and-pricing/pricing-india>

```bash
npm run pricing:refresh   # re-scrape both price lists into src/data/pricing.json
npm run verify            # check the engine against Google's own worked examples
```

The generator matches the two pages SKU-by-SKU and **fails loudly** if Google
reorders or renames rows, so a silent mismatch can't slip into the data.

`npm run verify` reproduces the two worked examples Google publishes on those
pages (US Autocomplete @ 200,000 = $481.70; India Autocomplete @ 6,000,000 =
$4,400.50) plus free-cap, unlimited-SKU and top-tier edge cases. It runs as part
of `npm run build`, so a bad scrape fails the deploy.

## Develop

```bash
npm install
npm run dev
```

## Deploy to Vercel

This repo is a self-contained app. Deploy it as its own Vercel project:

- **Root Directory:** `./` (the repo root)
- Framework preset: Vite (auto-detected), build `npm run build`, output `dist`
- Node 22.18 or newer — `npm run verify` runs a TypeScript file directly and
  relies on Node's native type stripping

Or from the CLI, inside this folder:

```bash
npx vercel --prod
```

No API keys, no backend, no environment variables — it's a static SPA.

## Caveats

- India pricing applies only to accounts with billing **and** a large majority of
  usage in India, and those accounts can't use subscription plans.
- India gets larger free caps but only two volume tiers instead of five, so it is
  cheaper at low volume and the gap narrows as you scale.
- Estimates cover core-service SKUs only: no taxes, subscriptions, negotiated
  discounts, or non-core products.
- The USD→INR rate is yours to set; Google converts at rates published by leading
  financial institutions, which will differ.

Not affiliated with Google.
