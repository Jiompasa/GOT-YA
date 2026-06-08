# GOT-YA — Firestopping Detail Finder

A simple, installable web app for finding the right passive fire protection
(firestopping) installation detail. Filter by **Substrate**, **Penetration type**,
**Seal**, **Batt type** and **Manufacturer / Brand** (Quelfire, Rockwool, Nullifire).

Works on iPhone and desktop, and can be **installed to the home screen** like a
native app (it's a PWA). No App Store needed.

---

## Status — Phase 1

- ✅ Filter search across the 5 facets, with live result counts
- ✅ Detail pages with a deep link to the manufacturer + related documents
- ✅ Projects (group details for a job) and Recently-viewed
- ✅ Installable / works offline
- ⚠️ **Data is currently SAMPLE/placeholder** — see "Loading real data" below
- ⏳ Login, weekly link-health checks + OneDrive backup, and the optional guided/AI
  search come in later phases

Projects and Recently-viewed are stored **on the device** for now. Proper login and
shared storage arrive with the hosting phase.

---

## Running it locally (to preview)

The app loads its catalogue with `fetch`, so it must be served over HTTP — opening
`index.html` straight off disk won't load the data. Any static server works:

```bash
# from this folder
python3 -m http.server 8080
# then open http://localhost:8080
```

To install on iPhone: open the hosted URL in Safari → Share → **Add to Home Screen**.

---

## Loading real data

All details live in **`data/details.json`**. Each entry looks like:

```json
{
  "id": "QF-001",
  "manufacturer": "Quelfire",
  "name": "Single metallic pipe through flexible wall — Intumescent sealant",
  "product": "QuelStop Acoustic Intumescent Sealant",
  "substrate": ["Flexible wall"],
  "penetration": ["Single metallic pipe"],
  "seal": ["Intumescent sealant"],
  "batt": ["N/A"],
  "description": "…",
  "detailUrl": "https://…/the-actual-detail.pdf",
  "relatedLinks": [{ "label": "Product data sheet", "url": "https://…" }],
  "linkStatus": "unverified",
  "samplePlaceholder": true
}
```

Replace the sample entries with the real ones (from the supplied PDFs), set
`detailUrl` to the exact detail PDF, fill in `relatedLinks`, and remove
`samplePlaceholder`. The filters update themselves from whatever values are present.

---

## Hosting (for the server / IT manager)

This is a fully static site (HTML/CSS/JS + a JSON file) — no server runtime or
database required for Phase 1. It can be hosted on:

- **Azure Static Web Apps** (recommended; free tier is sufficient) — point it at this
  repo, no build step, app artifact location = repository root.
- Any static host or an internal IIS/nginx site.

> Note: Microsoft 365 does **not** include Azure hosting — Azure is billed separately,
> though the free Static Web Apps tier covers an app this size. If existing in-house
> Microsoft hosting is available, this drops straight onto it.

---

## Roadmap

1. **Phase 1 (done):** Filter search, detail pages, projects, recent, installable.
2. **Phase 2:** Login, weekly link-health monitoring (flag broken/changed links),
   weekly catalogue backup to work OneDrive.
3. **Phase 3:** Optional guided search + "ask me anything" assistant (cheap, metered AI).
4. **Later:** Additional brands (Hilti, FSI).
