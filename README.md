# Flashcard by DeTLeng

A static, GitHub-ready website for transforming **three-column DOCX or text-based PDF question banks** into interactive multiple-choice flashcards.

Website target: **https://flashcard.detleng.com/**

## Quick start

1. Extract the delivered ZIP into a folder.
2. Open `index.html` in a modern browser, or serve the folder with `python -m http.server 8000` and visit `http://localhost:8000`.
3. Upload a `.docx` / `.pdf` containing **Question Number | Question Statement | Answer** in that order.
4. Review extracted questions (particularly for PDFs), choose a question-number range, then click **Generate Flashcards**.
5. Practice, flip, shuffle, and export.

The app has no npm install step, build command, server API, database, or authentication requirement.

## What's inside

- `index.html` — landing page, study application, help sections and modals.
- `styles.css` — responsive light/dark UI.
- `app.js` — parsing, answer-bank MCQ generator, flashcard interactions, and exports.
- `vendor/jszip.min.js` — bundled JSZip (from the `pptxgenjs` package installation) for DOCX reading and ZIP/XLSX writing.
- `assets/favicon.svg` — application favicon.

## Question file requirements

DOCX: a real Word table, at least three cells/columns per question row. One source file can contain hundreds or thousands of rows. The first row may be headers. Numeric question IDs are required and need not be consecutive. When duplicate IDs are present, the first occurrence is kept. DOCX input is parsed fully in-browser using a local JSZip bundle.

PDF: **selectable-text** three-column layout; PDF text layers often do not preserve original table structure, so extraction is best-effort. Review imported questions using **View / Edit extracted questions** before generating. Scanned or image-only PDFs require conversion/OCR outside the website. PDF.js 3.11.174 is loaded over the internet from the Cloudflare CDN (with jsDelivr fallback) when a PDF is imported, so **PDF import requires internet on first load**. Uploaded file content is processed locally and not uploaded to this project server.

DOCX import, generation, study, CSV/XLSX/HTML/ZIP exports work without network connection; fonts gracefully fall back to system fonts if Google Fonts is unavailable.

## MCQ generation

- For each chosen question, the source answer is always the correct choice.
- Two distractors are randomly drawn from the **entire uploaded answer bank**, not just the selected range.
- Equal and near-identical answers are filtered first. When the answer bank does not offer enough distinct alternatives, similarity filtering relaxes in stages.
- At least **three distinct answer values** are required for proper three-option MCQs. The app never silently invents an alternative answer if the source has fewer than three distinct answers.
- The right answer is shuffled into A, B, or C.
- **Shuffle options** on one card reshuffles A/B/C correctly. **Shuffle questions** changes the card sequence.
- Generated distractors are based on lexical similarity, not semantic validation. If two answers mean the same thing but have very different wording, they may still be selected. Users should review question banks when accuracy matters.

## Study and exports

- **Flip** to reveal the answer, or turn on **Instant answer feedback** to highlight selections.
- Previous, next, restart, and keyboard Left / Right / Space controls.
- No accounts, previous-session recovery, progress persistence, or Supabase integration in V1.
- **Interactive HTML**: self-contained browser deck, fully offline after download.
- **Offline ZIP**: interactive `index.html`, CSV answer key and instructions.
- **CSV**: UTF-8 with BOM for spreadsheet compatibility.
- **Excel XLSX**: native `.xlsx` workbook, generated in-browser.
- **Printable PDF**: opens a printable page in a new tab; choose **Save as PDF** from your browser's print dialog. It includes an answer key on a separate page. Allow popups for this feature.

All exports contain the current generated cards (not the entire uploaded bank) and the current option ordering.

## Deploy from GitHub

### GitHub Pages

1. Create a repository and push the **contents** of this folder to the repository root.
2. In **Settings → Pages**, set source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. GitHub Pages will publish it at `https://YOUR_USERNAME.github.io/REPOSITORY/`.
4. For a custom domain, configure the Pages custom domain as `flashcard.detleng.com` and create the DNS CNAME record pointing to `YOUR_USERNAME.github.io` with your DNS provider. Enable HTTPS when available. Consult current GitHub Pages instructions for DNS verification and propagation.

### Cloudflare Pages / Netlify / Vercel

Connect the GitHub repo as a static site. Set the publish/output directory to the **repository root**; there is no build command. Connect `flashcard.detleng.com` in your hosting dashboard and update DNS accordingly.

> Note: This package does not modify your DNS, GitHub account, or any live website. You perform deployment with your own credentials.

## Future features

The Login/Create Account UI is intentionally a demonstration only: fields are **not submitted** and show a **Continue Free** launch-period message. Future auth, user accounts, saved sessions, progress, and cloud sync are reserved for Supabase in V2.

## Privacy

Document data never leaves the browser through app code; the only external resources are the Google Fonts stylesheet and PDF.js CDN library, plus links opened explicitly by visitors. Browser/host platform logging and third-party asset requests may still occur. Do not use this app to process highly sensitive files without reviewing your hosting and browser policies.

## Development and review

The website uses vanilla HTML, CSS and JavaScript intentionally: no npm dependency installation or bundler required. Use Chrome, Edge, Firefox, or Safari current stable release. To test manually: upload a sample `.docx`, verify counts and random answer options, shuffle A/B/C, flip and navigate, download offline HTML, and export CSV, XLSX, ZIP and PDF print view.
