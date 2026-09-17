# SafiRoute

**Every delivery. Verified.**

SafiRoute is Safisana Ghana’s digital waybill and proof-of-delivery system. This repository now includes a runnable **offline-first Progressive Web App** at the repo root, plus the Django / Next.js / Flutter stack for the full product.

## What works in this milestone (offline PWA)

- Installable mobile-friendly web app shell
- Offline app loading through a service worker, with a **Reload** prompt when a new shell is waiting (`skipWaiting`)
- Device-local IndexedDB storage
- Automatic draft saving while you type (“Saved on this device.”)
- The **same Safisana paper pad** as the NCR book, used by Sales when a customer buys compost: Deliver to, Date, Contact, Address, Description / Qty / Remarks, then Sales, Dispatch, and the customer sign
- A **Before Complete** checklist (Deliver to, lines, three signatures, GPS/photo)
- Draft and completed waybill workflows
- Customer, product, driver, and vehicle information
- GPS capture with accuracy and timestamp
- Customer signature pad
- Delivery photo capture/upload
- Online/offline status indicator
- Read-only protection after a delivery is completed
- Honest HQ sync: completed pads stay `pending` on the phone until Django accepts `POST /api/pwa/ingest/`
- JSON backup export, with a nag if many pads exist and none has been exported
- Operator setup, Settings page, and session lock / log out on this phone
- Responsive phone and desktop layouts

## Important current limitations

This PWA is the offline sales pad plus a one-way ingest pipe, not the finished production HQ system:

- There is **no Safisana account login on the phone**. Name-only setup stays. HQ sync uses a Django origin URL, not a role dropdown.
- Multi-device accounts, the Next.js dashboard, Flutter, QR verification, and the full approval/load/dispatch workflow still live in `frontend/` + `backend/` + `mobile/`
- Conflict handling is first-write-wins on `client_uuid`; HQ does not push edits back to the phone
- Clearing browser data can remove locally stored waybills — use **Export backup**
- GPS requires permission and normally needs HTTPS or localhost

Set **Settings → HQ server** to the Django origin (for local testing, `http://127.0.0.1:8000`). Completed pads POST to `/api/pwa/ingest/` only when the phone is online. A pad is marked **On HQ** only after the server returns `accepted`. Optional env `PWA_INGEST_TOKEN` on Django requires header `X-SafiRoute-Ingest`.

## Test run (offline PWA — no Django)

Requirements: Python 3 and a modern browser.

```bash
git clone https://github.com/Harold-Djah007/SafiRoute.git
cd SafiRoute
git checkout cursor/offline-pwa-foundation-cd9e   # or pull this branch

npm test
python3 -m http.server 4173
```

On Windows PowerShell, from the clone:

```powershell
cd "$HOME\SafiRoute"
npm test
python -m http.server 4173
```

Open <http://127.0.0.1:4173>

Alternatively, with Docker Desktop running:

```bash
docker compose up
```

That serves the PWA on port 4173.

### To test offline mode

1. Open the application once.
2. Create part of a waybill and wait for **Saved on this device.**
3. Open Chrome DevTools → Network → select **Offline**.
4. Refresh and continue the waybill.
5. Restore **No throttling** and confirm the record remains.

## Automated checks

```bash
npm test
npm run check
```

The PWA has no runtime npm dependencies.

## Product blueprint

See [docs/project-blueprint.md](docs/project-blueprint.md) for the planned full product scope and rollout phases.

---

## Full stack (Django API + Next.js + Flutter)

The folders `backend/`, `frontend/`, and `mobile/` are the broader SafiRoute system (roles, paper pad, PDF, QR, field sync). Django and `manage.py` live in **`backend/`**, not the repo root.

```powershell
cd "$HOME\SafiRoute\backend"
py -3 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8877
```

Second window:

```powershell
cd "$HOME\SafiRoute\frontend"
npm install
npm run dev
```

Open http://localhost:3000 — demo password **`safiroute`**.
