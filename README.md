# ARC NCGP Research Points Planner

An unofficial, zero-backend static planning workbench for Australian researchers modelling multi-year grant pipelines under the Australian Research Council (ARC) National Competitive Grants Program (NCGP) 13-point system (2027-2032).

**Live App:** [arc-points.zhipenghe.me](https://arc-points.zhipenghe.me)

> **Unofficial Tool:** Built independently for planning purposes. Rules reflect publicly available ARC NCGP announcements verified **November 2026**. Always confirm eligibility, dates, and point limits against final Grant Opportunity Guidelines and RMS before submitting.

## Key Capabilities

- **Synchronized Quarterly Timeline & 13-Point Capacity Chart (2027-2032):** Stacked Gantt timeline directly aligned with a quarterly point-load bar chart, red `13-point` threshold line, and synchronized quarter crosshair.
- **Full Point Lifecycle Modelling:**
  - **Pending (Submitted):** Points lock from submission/closing date until outcome announcement.
  - **If Funded vs. If Unfunded (1-Click Toggle):** Stress-test Plan A vs. Plan B instantly (locks points through project end date if funded, or releases points at outcome date if unsuccessful).
  - **Already Awarded / Active Lock:** Mark won NCGP grants as locked in RMS (skips pending phase and prevents accidental toggling, reflecting ARC's no-early-relinquishment rule).
  - **Legacy Grants (0 Points):** Plot existing DP, LP, DECRA, and FT grants for real-world workload visibility without consuming Research Points.
- **"What Fits My Remaining Points?" Helper:** Click any quarter to list valid scheme + role combinations that fit your free point balance, with eligibility filtering and multi-year peak impact checks.
- **Scenario Comparison & Starter Templates:** Create, duplicate, rename, and compare strategies side-by-side (`Fresh Postdoc / ECR`, `Mid-Career Researcher`, `Senior Lead`).
- **Collaborator / Team Point Check:** Add Co-CI profiles manually or import colleagues' `#plan=...` Shareable URLs to inspect 2027-2032 overlap mini-charts and switch into any collaborator's full timeline.
- **Optional Eligibility Profile:** Enter PhD conferral date (+ career interruption months) to render a vertical dashed 5-year ECR cutoff line and flag ineligible roles (`Initiate`, `SCI (ECR)`), plus an Aboriginal and Torres Strait Islander researcher toggle for `Indigenous Excellence` and `SCI (MCR)`.
- **Funding Band & Teaching Relief Roll-Up:** Summarizes indicative annual/total funding bands and unsalaried CI teaching relief eligibility (up to $50,000/yr), flagging overlaps with active `SCI` salaried roles.
- **Custom Rules Override:** Locally override the hard cap, role point weights, or launch quarters for hypothetical testing (with one-click reset to defaults).
- **Exports, Privacy-Safe Sharing & AI Support:**
  - High-DPI Canvas PNG timeline export and landscape print/PDF stylesheet.
  - `.ics` calendar export for indicative round open, close, outcome, start, and end dates.
  - JSON workspace backup/restore and compressed client-side `#hash` share URLs (with automatic custom title stripping enabled by default).
  - One-click **Copy Plan for AI** (Markdown or JSON), `/llms.txt`, `/rules.json`, and browser-native **WebMCP** tool registration.

## Privacy & Architecture

- **100% Static, Zero Backend:** Built with React, TypeScript, Vite, and Tailwind CSS.
- **Local-Only Data:** Plans, collaborator profiles, and eligibility dates live solely in your browser's `localStorage`. No accounts, no cookies, no analytics, and no server storage.
- **Isolated Rules Data (`public/rules.json`):** Every scheme, role weight, launch window, quirk hint, status badge (`Confirmed` vs. `Indicative`), official ARC URL, and changelog entry lives in [`public/rules.json`](public/rules.json). Updating ARC rules requires editing only `rules.json`, and returning users automatically see a non-destructive changelog notice when rules update.

## Development

Requires Node.js 20+ and [`pnpm`](https://pnpm.io/).

```sh
# Install dependencies
pnpm install

# Start local dev server
pnpm dev

# Run typecheck, unit tests, and production build
pnpm typecheck && pnpm test && pnpm build

# Preview production build locally
pnpm preview
```

The production bundle is written to `dist/` (including `dist/rules.json`, `dist/llms.txt`, and `dist/favicon.svg`) and is configured for Cloudflare Workers Static Assets via [`wrangler.jsonc`](wrangler.jsonc) (`pnpm dlx wrangler deploy` or Cloudflare Workers Git Builds).

## Updating ARC Rules

Edit [`public/rules.json`](public/rules.json):

1. Bump `"version"` (e.g., `"2027.01.0"`), `"verifiedDate"`, and `"verifiedDisplay"`.
2. Add an entry at the top of `"changelog"`.
3. Update scheme definitions, `"status"` (`"Confirmed"` or `"Indicative"`), `"roles"`, or `"officialUrl"` links.
4. Keep [`public/llms.txt`](public/llms.txt) in sync with any major rule changes.

## Official ARC References

- [ARC Research Points (Primary Rules)](https://www.arc.gov.au/research-points)
- [New NCGP Schemes: Overview](https://www.arc.gov.au/funding-research/applying-grant/new-ncgp-schemes-overview)
- [Revitalised NCGP: FAQ & Information Webinar](https://www.arc.gov.au/funding-research/applying-grant/national-competitive-grants-program/revitalised-ncgp-faq)
- [Changes to the NCGP (Revitalised Program)](https://www.arc.gov.au/funding-research/applying-grant/national-competitive-grants-program/revitalised-program-australias-research-future-changes-ncgp)
- [NCGP Policy Review Final Report (July 2026)](https://www.arc.gov.au/news-and-publications/publications/ncgp-review-final-report) ([Direct PDF](https://www.arc.gov.au/system/files/2026-07/ncgp-policy-review_finalreport-20262207_0.pdf))
- [GrantConnect (Binding Grant Guidelines & Forecasts)](https://www.arc.gov.au/funding-research/grantconnect)
- [ARC Research Management System (RMS)](https://rms.arc.gov.au/)

## Author & License

Built by [Zhipeng He](https://zhipenghe.me/). Released under the [MIT License](LICENSE).
