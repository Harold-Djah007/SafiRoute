# SafiRoute

**Every delivery. Verified.**

SafiRoute is Safisana Ghana’s digital waybill and proof-of-delivery system for the Sales department: create, approve, load, dispatch, sign, verify, and archive deliveries — including when drivers are offline.

Repository: https://github.com/Harold-Djah007/SafiRoute

## What’s in this repo

| Path | What it is |
| --- | --- |
| `backend/` | Django REST API (runnable locally with SQLite) |
| `frontend/` | Next.js web dashboard, field (driver) UI, and public QR verification |
| `mobile/` | Flutter Android-first driver app |
| `docs/` | Project blueprint |
| `assets/` | SafiRoute logo and app icon |
| `scripts/` | One-command API and web starters |

## Test run (local)

You need **Python 3.12+** and **Node 20+**. Flutter is optional.

**Terminal 1 — API**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

**Terminal 2 — Web app**

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**

Or from the repo root:

```bash
./scripts/run-api.sh    # terminal 1
./scripts/run-web.sh    # terminal 2
```

### Demo logins

Password for every seeded account: **`safiroute`**

| Username | Use this to… |
| --- | --- |
| `sales` | Create and submit waybills |
| `supervisor` | Approve |
| `warehouse` | Confirm load and dispatch |
| `driver` | Complete a field delivery (`/field`) |
| `finance` | Read-only operations view |
| `admin` | Everything, plus `/admin/` |

API: http://127.0.0.1:8000/api/  
Django admin: http://127.0.0.1:8000/admin/  
Health: http://127.0.0.1:8000/api/health/

### Suggested click-through

1. Sign in as `sales` → **New waybill** → save draft → **Submit for approval**
2. Sign in as `supervisor` → open the waybill → **Approve**
3. Sign in as `warehouse` → **Confirm loaded** → assign driver/vehicle → **Dispatch**
4. Sign in as `driver` → **Field app** → open the assignment → sign both pads → **Complete delivery**
5. Open the verification link on the waybill, or download the branded PDF

## Mobile (Flutter)

The driver workflow is already testable in the browser at `/field`. To run the native app:

```bash
cd mobile
flutter create . --project-name safiroute_mobile --org org.safisana.safiroute
flutter pub get
flutter run --dart-define=SAFIROUTE_API=http://127.0.0.1:8000/api
```

On a physical phone, point `SAFIROUTE_API` at your computer’s LAN IP.

## Backend tests

```bash
cd backend
source venv/bin/activate
python manage.py test
```

## Architecture

Django REST + Next.js + Flutter, as recommended in the blueprint. Local demo uses SQLite so nothing else has to be installed. PostgreSQL, object storage, and Redis workers are the production path (see `docs/Safisana_Digital_Waybill_Project_Blueprint.md`).

## Branding

- `assets/safiroute-logo.png` — wordmark lockup
- `assets/safiroute-icon.png` — app / favicon mark
- Palette: forest `#0F5C2E`, gold `#C9A227`, cream `#F4EFE2`

The product name should still undergo a formal trademark and domain check before public release.
