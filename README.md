# SafiRoute

**Every delivery. Verified.**

SafiRoute is Safisana Ghana’s digital waybill and proof-of-delivery system.

## Package contents

| Folder       | Description                                      |
|--------------|--------------------------------------------------|
| `backend/`   | Django REST API (runnable)                       |
| `frontend/`  | Next.js web dashboard + public QR verification   |
| `mobile/`    | Flutter Android-first driver app (scaffold)      |
| `docs/`      | Full project blueprint                           |
| `scripts/`   | Helper scripts                                   |

## Quick start – Backend (API)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

- API root: http://127.0.0.1:8000/api/
- Admin:    http://127.0.0.1:8000/admin/
- Token:    POST http://127.0.0.1:8000/api/auth/token/  `{ "username": "...", "password": "..." }`

## Quick start – Frontend (Web)

```bash
cd frontend
npm install
# optional: create .env.local with NEXT_PUBLIC_API_URL=http://localhost:8000/api
npm run dev
```

Open http://localhost:3000

## Mobile (Flutter)

```bash
cd mobile
flutter pub get
flutter run
```

(Requires Flutter SDK installed)

## Key API endpoints

| Method | Endpoint                        | Description                    |
|--------|---------------------------------|--------------------------------|
| POST   | /api/auth/token/                | Obtain auth token              |
| GET    | /api/waybills/                  | List waybills (role-filtered)  |
| POST   | /api/waybills/                  | Create draft waybill           |
| POST   | /api/waybills/{id}/submit/      | Submit for approval            |
| POST   | /api/waybills/{id}/approve/     | Approve                        |
| POST   | /api/waybills/{id}/load/        | Confirm loaded                 |
| POST   | /api/waybills/{id}/dispatch/    | Dispatch to driver             |
| POST   | /api/waybills/{id}/complete_delivery/ | Complete PoD (offline OK) |
| GET    | /api/verify/{token}/            | Public QR verification         |

## Next steps

1. Obtain a photo/scan of the current paper waybill.
2. Create a private GitHub repo named `SafiRoute` and push this code.
3. Continue with Phase 1 process validation from the blueprint.

---

© Safisana Ghana – Internal project
