# Safisana Ghana Digital Waybill — SafiRoute

**Product:** SafiRoute  
**Tagline:** Every delivery. Verified.  
**Department:** Sales  
**Type:** Standalone web and mobile system  
**Version:** 0.2 — first runnable MVP

Primary objective: replace paper-based sales waybills with a secure, trackable digital workflow that works in the field, including when internet connectivity is unavailable.

This document is the working blueprint. Field names, approval rules, and PDF layout must still be validated against Safisana’s current paper waybill.

## 1. Working assumption

SafiRoute records dispatch and delivery of products sold by Safisana Ghana to customers — primarily Fortifer organic fertilizer and related soil products from the Ashaiman plant. The flow runs from Sales creating an order/waybill through warehouse dispatch, driver delivery, customer acceptance, and final document archiving.

## 2. Product vision

Staff can create, approve, dispatch, deliver, sign, verify, and retrieve waybills without paper or stitching information together from different sources.

- Web dashboard for Sales, warehouse, supervisors, finance/audit, and administrators
- Android-first mobile app for drivers (Flutter), plus a mobile web field app at `/field`
- Customer-facing QR verification page (no app install)
- Shared Django REST API and PostgreSQL-ready database

## 3. MVP workflow

1. Sales creates a draft waybill from a confirmed customer sale.
2. The system assigns a unique waybill number (`SR-YYYY-NNNNNN`).
3. A supervisor approves the waybill when approval is required.
4. Warehouse staff confirm the items and quantities loaded.
5. A driver and vehicle are assigned.
6. The driver downloads the assigned delivery before departure.
7. At delivery, the app captures GPS, arrival time, photos, notes, delivered quantities, and discrepancies.
8. The customer enters their name and signs on the driver’s device.
9. The driver signs and completes the delivery, including offline.
10. The app synchronizes automatically when connectivity returns (idempotent `client_uuid`).
11. The server generates a tamper-evident PDF with a QR verification code.
12. Sales and authorized staff view, download, print, or share the PDF.

## 4. Waybill statuses

| Status | Meaning |
| --- | --- |
| Draft | Sales is preparing the waybill |
| Pending approval | Waiting for an authorized reviewer |
| Approved | Cleared for loading and dispatch |
| Loaded | Warehouse has confirmed loaded quantities |
| Dispatched | Driver has departed with the goods |
| In transit | Delivery is active |
| Delivered | Customer received and signed |
| Partially delivered | Some quantities were not accepted or delivered |
| Delivery failed | Delivery could not be completed |
| Cancelled | Cancelled with a recorded reason |

Completed waybills are not silently edited. Corrections must create an auditable amendment or authorized reversal.

## 5. Core information captured

Waybill identity, customer (including GhanaPost GPS), products (ordered/loaded/delivered/rejected, batch), transport, and proof of delivery (signatures, photos, device + server timestamps, GPS accuracy).

## 6. Required capabilities (MVP coverage)

| Capability | First version |
| --- | --- |
| Offline operation | Field web + Flutter cache assignments; complete_delivery is idempotent |
| Digital signatures | Canvas / stylus capture bound to the waybill |
| GPS and timestamps | Captured when available; reason required when missing |
| Photos and attachments | Multipart upload on complete |
| QR verification | Opaque token, public `/verify/{token}` page |
| Automatic PDFs | Server-side ReportLab PDF after delivery |
| Roles and audit | Role-filtered API + immutable audit log |

## 7. User roles

Administrator, Sales officer, Sales supervisor, Warehouse officer, Driver / delivery officer, Finance / audit viewer.

Drivers only see waybills assigned to them.

## 8. Architecture

- Web: Next.js (React) dashboard + public verification + `/field` driver UI
- Mobile: Flutter (Android first)
- Backend: Django REST Framework
- Database: SQLite for local demo; PostgreSQL in production
- Files: local media in demo; S3-compatible storage later
- Auth: DRF token auth (MFA and refresh tokens in a later phase)

## 9. Demo accounts

Password for all seeded users: `safiroute`

| Username | Role |
| --- | --- |
| admin | Administrator |
| sales | Ama Mensah — Sales officer |
| supervisor | Kwame Asante — Sales supervisor |
| warehouse | Efua Boateng — Warehouse officer |
| driver | Kofi Owusu — Driver |
| driver2 | Abena Sarpong — Driver |
| finance | Yaw Agyeman — Finance / audit |

## 10. Decisions still needed

A clear photo or scan of Safisana’s current paper sales waybill remains the most important input. Also confirm numbering format, approval thresholds, signature wording, customer PDF delivery channel (email / WhatsApp / print), and whether accounting or inventory integration is required for v1.

## 11. Branding note

The name SafiRoute should undergo a formal trademark and domain check before public release. Palette: forest green `#0F5C2E` and gold `#C9A227`, reflecting Safisana’s work in renewable energy and organic fertilizer.
