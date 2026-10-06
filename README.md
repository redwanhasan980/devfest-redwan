# NothiSetu — Tender Package Studio

NothiSetu turns a tender requirements file and a folder of PDFs into a validated, correctly ordered submission package. The entire workflow runs inside the browser: tender files are never uploaded to an application server, database, or third-party document service.

- **Live site:** [nothisetu.169-58-98-206.sslip.io](https://nothisetu.169-58-98-206.sslip.io)
- **Repository:** [github.com/redwanhasan980/devfest-redwan](https://github.com/redwanhasan980/devfest-redwan)

## Participant

- Name: Md Redwan Hasan
- Registration number: pending confirmation
- Competition: AI DevFest 2026 Vibe Coding Contest

## What it does

1. Loads and strictly validates `requirements.json`, then sorts every requirement by its declared order.
2. Accepts up to 30 PDFs by picker or drag-and-drop, reads page counts locally, and reports unsupported, damaged, or password-protected files without breaking the session.
3. Matches one PDF to one requirement, suggests clear filename matches, collects expiry dates, and applies the exact contest statuses: `Missing`, `Expiry date needed`, `Expired`, `Not provided`, and `OK`.
4. Computes SHA-256 hashes in the browser, flags byte-identical files even when their names differ, and prevents the same content from satisfying two requirements.
5. Enables generation only when every mandatory check passes. Optional unmatched documents stay `Not provided` and are skipped.
6. Produces one PDF with an English cover, optional package index, all matched documents in requirement order, and `tender_id | Page X of Y` below every page without covering source content.
7. Provides PDF previews, a UTF-8 CSV checklist export, responsive layouts, motion with reduced-motion support, and a complete English/Bangla interface.

## Privacy and architecture

NothiSetu is a static React application. JSON parsing, PDF inspection, SHA-256 hashing, status calculation, previewing, CSV creation, and PDF generation all happen on the user's device. The production deployment serves only the compiled HTML, CSS, JavaScript, and icons.

## Tech stack

- React 19 and TypeScript 5
- Vite 7
- `pdf-lib` for inspection, merging, metadata, cover/index creation, and safe footer composition
- Web Crypto API for exact SHA-256 duplicate detection
- Lucide React icons
- Node's built-in test runner for deterministic status and matching tests
- Nginx and Let's Encrypt for the public static deployment

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`. A production build is created with:

```bash
pnpm test
pnpm build
pnpm preview
```

## Verification

- Seven focused tests cover date validation, deadline equality, optional requirements, requirement sorting, duplicate-content assignments, numeric filename noise, and ambiguous duplicate suggestions.
- The supplied sample pack produces `output/T-2026-0417_Package.pdf` with 17 pages: cover, index, and 15 source pages.
- `screenshots/document-statuses.jpg` records the completed sample checklist at 100% readiness.
- The production build and generated PDF were visually checked at desktop and mobile widths. Cover, index, source pages, scanned content, and all page footers were inspected.

## Known limitations

- Workspace selections live in memory and reset when the page reloads.
- Password-protected PDFs are reported and skipped.
- The interface is bilingual; generated cover and index pages use English.
- The browser workspace is capped at 30 PDFs and 50 MB to keep processing predictable on ordinary office computers.

## AI use

OpenAI Codex was used to interpret the rulebook and problem pack, plan the product, implement the application, write focused tests, run browser QA, validate the generated PDF, and prepare deployment.

Most useful prompt:

> Implement the complete browser-only tender package builder end to end. Make it bilingual, polished, interactive, and safe for an office user. Follow the contest's exact status, duplicate, ordering, expiry, and PDF footer rules; verify it against the supplied sample pack; commit and push feature milestones; and deploy the final static build over HTTPS.

## License

[MIT](LICENSE)
