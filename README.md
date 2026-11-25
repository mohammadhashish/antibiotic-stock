# رصيد الأدوية — Antibiotic Stock Tracker

Shared antibiotic stock dashboard. Everyone with the link sees current stock; an admin (code-protected) uploads a new Excel sheet to update it for everyone.

## Sheet format
First sheet, three columns (header row optional, Arabic or English headers detected):

| اسم الدواء | الرصيد الحالي | المعدل الشهري |
|---|---|---|
| Meropenem 1g | 4200 | 6000 |

## Status rules
- **غير متوفر / Out of stock**: stock = 0
- **أقل من أسبوع / < 1 week**: under 7 days of cover
- **أقل من شهر / < 1 month**: under 30 days
- **كافي / Sufficient**: 30+ days, or no usage recorded
- Days of cover = stock ÷ monthly rate × 30. Suggested order = rate × target days ÷ 30 − stock.

## Stack
- `public/index.html` — the whole UI (vanilla JS, SheetJS for Excel parsing, PWA)
- `api/stock.js` — Vercel Function; every upload is saved as a snapshot in a **private Vercel Blob** store (history + restore)
- Env vars: `ADMIN_PIN` (admin code), `BLOB_READ_WRITE_TOKEN` (added automatically when the Blob store is connected)

## Local dev
```
npm i -g vercel && vercel link && vercel env pull && vercel dev
```
