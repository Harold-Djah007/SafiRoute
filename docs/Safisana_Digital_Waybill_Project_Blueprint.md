# SafiRoute — Safisana Digital Waybill Blueprint

## Product definition

SafiRoute is a **Sales Department digital waybill system** for Safisana Ghana.

Both the website and the Android/iOS/PWA mobile app are for the Sales team. SafiRoute is not a warehouse-management, driver-dispatch, finance, or multi-department approval system.

## Users

There are only two SafiRoute account types:

- **Sales User** — creates, signs, completes, syncs, searches and reviews waybills.
- **Sales Administrator** — a Sales-side administrator with the same waybill access plus user/reference-data administration and oversight.

The following are **not SafiRoute accounts**:

- Authorised by
- Dispatched by
- Received by

They are fields/signatures on the waybill itself.

## Waybill lifecycle

The supported lifecycle is deliberately simple:

1. Sales opens SafiRoute.
2. Sales creates a waybill using the same structure as the Safisana paper form.
3. The waybill may remain a Draft while being filled.
4. Authorised by signs on the waybill.
5. Dispatched by signs on the waybill.
6. Received by signs on the waybill.
7. Sales completes the waybill.
8. If offline, it stays safely on the device as Waiting for HQ.
9. When connectivity returns, it syncs exactly once to HQ.
10. HQ stores the completed immutable record, generates the PDF/QR verification record, and retains the audit trail.

There is **no separate supervisor approval queue**, no warehouse loading stage, no driver assignment stage, and no finance workflow.

## Paper waybill fields

The digital form follows the physical Safisana waybill:

- Deliver to
- Date
- Delivery Contact Name
- Contact Phone
- Address
- Description
- Remarks
- Authorised by
- Authorised signature
- Authorised date
- Authorised remarks
- Dispatched by
- Dispatch signature
- Dispatch date
- Received by
- Received signature
- Received date

Digital proof such as GPS and a delivery photo is optional and remains secondary to the paper-style form.

## Website

The Sales website is the larger-screen workspace for:

- Sales overview
- all waybills
- search/filter
- viewing completed records
- PDFs
- QR verification
- audit history
- reference data
- Sales-user administration

## Mobile

The native/PWA mobile app is the field pad for:

- creating the waybill
- offline drafts
- signatures
- optional GPS/photo
- completing the waybill
- automatic reconnect sync

## Status model

Supported document statuses:

- **Draft**
- **Completed**
- **Voided** — retained only for audit/legal record handling when required

Sync state is separate from document status.

## Security and integrity

- Django session authentication for the website
- short-lived signed Sales credentials for native mobile
- role restriction to Sales User / Sales Administrator
- encrypted native local waybill storage
- passphrase-protected PWA backups
- HTTPS required for production native builds
- idempotent client UUID sync
- immutable completed records
- hash-chained audit history
- PDF SHA-256 integrity checks
- production PostgreSQL requirement
- encrypted server backups

## Release evidence still required

Repository tests can prove code and build behavior. Production release still requires:

- real Safisana Sales field pilot
- permanent Azure deployment
- production Android signing
- Apple Developer/TestFlight signing
- backup/restore drill
- independent security review
