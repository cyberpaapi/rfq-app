# RFQ Hub — Procurement Suite

React + Vite frontend with an Express backend, a parallel OpenAI document pipeline, and role-based access.

## Run it

```bash
npm install
cp .env.example .env        # add your OPENAI_API_KEY (optional — see below)
npm run dev:all             # starts the API (:4000) and the web app (:5173) together
```

Or run them separately: `npm run server` and `npm run dev`.

### `.env`

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini       # per-page/row extraction (default)
OPENAI_CLUB_MODEL=gpt-5.5       # "clubbed view" consolidation (default)
# tuning (optional):
# AI_CONCURRENCY=4              # chunks processed in parallel
# AI_PAGES_PER_CALL=1          # PDF pages per request
# AI_ROWS_PER_CALL=10          # spreadsheet rows per request
```

> **No OpenAI key?** The app still runs — extraction falls back to a built-in
> line parser (no clubbing, no unit prices). Add a key for full extraction.

## What's here

**Frontend (`src/`)** — Dashboard, RFQ list/detail, AI Import, Assign Suppliers, Item Catalogue, Suppliers, Quote Comparison, Evaluation & Award, Supplier Portal, Reports, Audit, Users & Access (live-wired to the backend).

**Backend (`server/`)** — Express + JSON-file store (`server/data/db.json`). RFQs, suppliers, items, quotes, audit, notifications, reports, Excel exports, AI ingest + re-cluster, supplier quote-upload.

## Key behaviours

- **Parallel AI pipeline** (`server/lib/ai.js`, `pool.js`, `pdf.js`): big documents are split into chunks — **PDF pages**, **10-row spreadsheet blocks**, or image groups — sent to the model **4 at a time** and stitched back in order. Spreadsheets are parsed **row by row** (multi-line cells preserved). Every item records the **page/row it was found on**.
- **Basic vs Clubbed view**: Basic lists every line individually; Clubbed (GPT‑5.5) groups near-duplicate items.
- **Verification**: open the source document beside the items and click an item to jump to its page/row (crisp PDF render, zoom + pan).
- **Supplier quotes by document**: suppliers upload a quote file; the AI extracts unit prices and matches them back to the RFQ lines by **name + quantity** (order-independent).

---

# Testing the new features — step by step

Start the app (`npm run dev:all`) and open **http://localhost:5173**. The seed data ships an RFQ (`RFQ-2026-0042`, "Landscape Lighting") assigned to **Supplier 1/2/3**, with quotes already in from Supplier 1 & 2.

> Tip: to restore the seed at any time, run `curl -X POST http://localhost:4000/api/reset` (or delete `server/data/db.json`) and refresh.

## 1) Items table + parallel extraction + verification (AI Import)

1. Sidebar → **AI Import**.
2. Drag in a document (a multi-page **PDF** or a **.xlsx/.csv**, ideally with 10+ rows) and click **Extract items**.
3. You land on the **Basic view** — now a proper table with columns **Item Name · Specification · Brand · Model No. · Part No. · Quantity · Unit · Upload Photo · Remark**.
   - Brand/Part may be blank — that's fine.
   - Each cell shows up to **3 lines then `…`**. **Click any cell** to expand it into a full editor; click away to collapse.
   - Click the **chevron** on the left of a row to reveal extra fields (Required delivery date, **Secondary requirements**, Additional details).
   - If the file had >1 page/row block, you'll see a **"N pages/rows · N chunks"** chip — that's the parallel split working.
4. Each item shows an amber **"Page N" / "Row N"** label. Click **Open Verification** (top right), then click a label → the document opens beside the table and **scrolls to that exact page/row**. Click the same item again to cycle to its next occurrence.
   - In the viewer: **scroll to zoom**, **drag / arrow keys / WASD to pan**, zoom buttons + reset in the header. (Spreadsheets render as a **table** and scroll to the row.)
5. Click the **Clubbed view** tab → similar items are grouped by GPT‑5.5 (warning banner reminds you the Basic view is the source of truth). Expand a club to see its members.
6. **Multi-document**: click **Process another document**, pick a second file → its items are appended (tagged with their own source doc), and the Clubbed view re-clusters across **all** documents. Verification opens the correct document per item.
7. Click **Create RFQ** to turn the basic items into a new RFQ (you're taken to **Assign Suppliers**).

## 2) Supplier Portal — sign in & upload a quote

1. Sidebar → **Supplier Portal** (or use the "View as" switcher / open it directly).
2. You get a **sign-in screen with 3 profiles: Supplier 1 / Supplier 2 / Supplier 3** — **no password**. Click **Supplier 3** (it's assigned to the demo RFQ but hasn't quoted yet).
3. The RFQ `RFQ-2026-0042` is selected; you see the **items you must quote** (read-only). There is **no manual rate form** — the only action is **Upload quote document**.
4. Prepare a small quote file (CSV/XLSX/PDF) with the item names, **the same quantities** (50, 60, 150, 35) and a unit price column, e.g.:
   ```
   Item, Qty, Unit Price
   Wall Light, 50, 1.40
   Wall Light, 60, 1.45
   Spike Light, 150, 40.00
   Foot Light Type-1, 35, 9.00
   ```
   (Item order doesn't matter — matching uses name + quantity.)
5. Click **Upload quote document**. The AI extracts the unit prices and matches them to the RFQ lines — you'll see a **"matched X/Y"** summary and a **Your Rate** column appear next to each item, with a **matched / not found** status.
6. Optionally use **Ask a Clarification** to message the buyer. **Sign out** is top-right.

## 3) Quote Comparison

1. Sidebar → **Quote Comparison** (as a buyer/admin via "View as").
2. Pick `RFQ-2026-0042`. You get the **side-by-side table** of every supplier's rates per line, with the lowest highlighted and spec notes flagged.
3. **Export to Zoho PO** and **Costing Sheet** buttons download real `.xlsx` files (the costing sheet uses the OPRO Stock values you type per line).

## 4) Evaluation & Award — Lowest Cost + Segregate

1. Sidebar → **Evaluation & Award**, pick `RFQ-2026-0042`.
2. The view now defaults to **Lowest Cost**.
3. Click **Segregate** → each line item is auto-assigned to its **cheapest** quoting supplier, and a **per-supplier breakdown** appears:
   - Each supplier is a **collapsible block that starts collapsed**, showing only the **totals**: total cost, number of line items, and total quantity.
   - **Click a block to expand** it and see exactly which items were awarded to that supplier (qty, rate, line total).
   - A **Grand total** row sums everything.
4. As a Buyer/Finance role, click **Award this split** to commit the segregated award (status → Awarded). Use **Approve HOD / Approve Finance** (switch identities via "View as") to record approvals.

## 5) Everything else (still live)

- **RFQ Detail**: Publish / Cancel change status; item rows show brand/model/part, secondary requirements ("+ also needs…"), approvals and award.
- **Audit & Compliance**: every action above is logged with user + old→new value.
- **Reports / Dashboard**: savings, participation, aging — computed from the live data.
- **Bell icon**: in-app notifications for quotes, awards, clarifications.

## Swapping the store for a real DB

`server/store.js` exposes `all / find / insert / update / remove / upsertItem` plus `logAudit / notify`. Re-implement those against Postgres/SQLite and the routes are unchanged.
