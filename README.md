# NothiSetu — Tender Package Studio

NothiSetu turns a tender requirements file and a folder of PDFs into a validated, correctly ordered submission package. The entire workflow runs inside the browser: tender files are never uploaded to an application server, database, or third-party document service.

- **Live site:** [nothisetu.169-58-98-206.sslip.io](https://nothisetu.169-58-98-206.sslip.io)
- **Repository:** [github.com/redwanhasan980/devfest-redwan](https://github.com/redwanhasan980/devfest-redwan)

## Participant

- Name: Md Redwan Hasan
- Competition: AI DevFest 2026 Vibe Coding Contest

## What it does

1. Loads and strictly validates `requirements.json`, then sorts every requirement by its declared order.
2. Accepts up to 30 PDFs by picker or drag-and-drop, reads page counts locally, and reports unsupported, damaged, or password-protected files without breaking the session.
3. Matches one PDF to one requirement, suggests evidence-based filename matches across 30 document categories and English/Bangla aliases, collects expiry dates, and applies the exact contest statuses: `Missing`, `Expiry date needed`, `Expired`, `Not provided`, and `OK`.
4. Computes SHA-256 hashes in the browser, flags byte-identical files even when their names differ, and prevents the same content from satisfying two requirements.
5. Enables generation only when every mandatory check passes. Optional unmatched documents stay `Not provided` and are skipped.
6. Produces one PDF with an English cover, optional package index, all matched documents in requirement order, and `tender_id | Page X of Y` below every page without covering source content.
7. Provides PDF previews, a UTF-8 CSV checklist export, responsive layouts, motion with reduced-motion support, and an English/Bangla interface with locally hosted Bengali fonts.

8. Offers a reference-matched pastel workspace with graph-paper texture, bold black outlines and offset shadows with the supplied NothiSetu logo, animated document stacks, checklist search/status filters, a visible match summary, undo, and a one-click official sample.
9. Keeps unnamed scans for manual review, prevents confusing related financial documents, and clears old expiry dates when a file is replaced.
10. Exports Bengali filenames and metadata with embedded fonts, preserves rotated pages, supports blank separator pages, and validates the package independently of the interface.

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

- **24 automated tests** (`pnpm test`) cover schema errors and reserved IDs, leap years and invalid dates, deadline equality, optional expired documents, conflicting categories, bilingual acronyms, duplicate content, unknown scans, stale matches, export validation, blank pages, and 90/180/270-degree source rotation.
- Browser checks cover the official sample, seven safe suggestions, undo, manual scan assignment, expiry blocking, filtering, search, CSV/PDF controls, preview Escape, invalid uploads, replacing a document, stale-output invalidation, Bangla mode, and mobile overflow.
- `output/T-2026-0417_Package.pdf` is the verified sample: 17 pages (cover, index, 15 source pages). Generated cover and index were rendered and reviewed. A separate Bengali filename/metadata export was also rendered and checked.
- `screenshots/document-statuses.png` records the complete sample checklist. The production bundle is built with TypeScript checks before deployment.

## Matching behavior

Suggestions use filenames, bilingual aliases, and specific document concepts; they do not perform OCR or certify document contents. Related categories such as tax returns/TIN, bank statements/solvency, financial statements/bids, and bid/performance security are distinguished. A newer year in a filename is only a tie-breaker, never proof of validity. Review suggested documents and enter expiry dates from their actual contents. Unnamed scans require manual assignment.

## Known limitations

- Workspace selections live in memory and reset when the page reloads. Save the generated package before leaving.
- Password-protected PDFs are reported and skipped.
- Generated cover/index labels use English; Bengali names, filenames, and tender metadata are supported. Other writing systems are not guaranteed.
- The browser workspace is capped at 30 PDFs and 50 MB to keep processing predictable on ordinary office computers.

## AI use

OpenAI Codex was used to interpret the rulebook and problem pack, plan the product, implement the application, write focused tests, run browser QA, validate the generated PDF, and prepare deployment.

Most useful prompt:

> Implement the complete browser-only tender package builder end to end. Make it bilingual, polished, interactive, and safe for an office user. Follow the contest's exact status, duplicate, ordering, expiry, and PDF footer rules; verify it against the supplied sample pack; commit and push feature milestones; and deploy the final static build over HTTPS.

## Bundled assets

The logo was supplied by the participant. The demo files are the fictional organizer-provided sample pack. Hind Siliguri fonts are bundled under the SIL Open Font License; see `public/fonts/OFL.txt`. No external font service is required.

## License

[MIT](LICENSE)
