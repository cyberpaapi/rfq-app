# RFQ Hub — Procurement Suite

React + Vite frontend with an Express backend, an OpenAI document pipeline, and role-based access.

## Run it

```bash
npm install
cp .env.example .env        # add your OPENAI_API_KEY (optional — see below)
npm run dev:all             # starts the API (:4000) and the web app (:5173) together
```

Or run them separately: `npm run server` and `npm run dev`.

> **No OpenAI key?** The AI import still works — it falls back to a built-in
> line parser. Add `OPENAI_API_KEY` to `.env` for full vision/structured extraction.

## What's here

**Frontend (`src/`)**
- Dashboard, RFQ list/detail, Quote Comparison, Evaluation & Award, Reports, Audit
- IAM: roles + permissions, account creation, permission matrix, "View as" switcher (`src/context/AuthContext.jsx`, `src/data/auth.js`)
- Backend-driven modules: **Item Catalogue**, **AI Import**, **Assign Suppliers**, **Suppliers** (CRUD + tags), **Supplier Portal**

**Backend (`server/`)** — Express, JSON-file store (`server/data/db.json`)
- `GET/POST/PUT/DELETE /api/suppliers` · `/api/items` · `/api/rfqs`
- `POST /api/rfqs/:id/assign` — full or partial assignment; auto-tags the supplier
- `POST /api/rfqs/:id/quote` — supplier portal submission
- `POST /api/ingest` — upload xlsx/csv/txt/pdf/image → extract → AI split → de-dup → catalogue match
- `GET /api/tags`, `POST /api/reset`

## Key behaviours

- **AI document pipeline** (`server/lib/extract.js`, `server/lib/ai.js`): spreadsheets/text are parsed to text; **PDFs are sent directly to the model** (it reads each page's text and layout natively — no local rasterisation); images go straight to vision with `detail: 'high'`. Items are split into distinct rows with duplicates merged. (pdfjs/`@napi-rs/canvas` are no longer required for the PDF path.)
- **Tagging** (`server/lib/tags.js`): `Sand 5kg` and `Sand 10kg` are separate items, but both carry the base tag **`Sand`** — size is stripped. Tags are globally unique (case-insensitive); no duplicates.
- **Assignment auto-tagging**: sending an RFQ item to a supplier adds that item's base tag to the supplier automatically.

## Swapping the store for a real DB

`server/store.js` exposes `all / find / insert / update / remove / upsertItem`. Re-implement those against Postgres/SQLite and the routes are unchanged.
