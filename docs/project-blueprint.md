# SafiRoute

## Safisana Ghana Digital Waybill and Proof of Delivery

## Initial Project Blueprint — Version 0.1

**Department:** Sales  
**Product type:** Standalone web and mobile system  
**Primary objective:** Replace paper-based sales waybills with a secure, trackable digital workflow that works reliably in the field, including when internet connectivity is unavailable.

**Product name:** SafiRoute  
**Tagline:** Every delivery. Verified.

## 1. Working Assumption

This blueprint assumes the waybill records the dispatch and delivery of products sold by Safisana Ghana to customers. It covers the process from Sales creating an order or waybill through warehouse dispatch, driver delivery, customer acceptance, and final document archiving.

This assumption must be validated against Safisana's current paper waybill and sales process before development begins.

## 2. Product Vision

The system will give Safisana one reliable record for every sales delivery. Staff will be able to create, approve, dispatch, deliver, sign, verify, and retrieve waybills without relying on paper or manually combining information from different sources.

The product will consist of:

- A web dashboard for Sales, warehouse staff, supervisors, finance/audit users, and administrators.
- An Android-first mobile application for drivers and field delivery staff.
- A customer-facing QR verification page that does not require the customer to install an app.
- A backend API and central database shared by the web and mobile applications.

## 3. MVP Workflow

1. Sales creates a draft waybill from a confirmed customer sale.
2. The system assigns a unique waybill number.
3. A supervisor approves the waybill when approval is required.
4. Warehouse staff confirm the items and quantities loaded.
5. A driver and vehicle are assigned.
6. The driver downloads the assigned delivery to the mobile app before departure.
7. At delivery, the app captures GPS coordinates, arrival time, photos, notes, delivered quantities, and any discrepancy.
8. The customer enters their name and signs on the driver's device.
9. The driver signs and completes the delivery, even when offline.
10. The app synchronizes automatically when connectivity returns.
11. The server generates a tamper-evident PDF waybill with a QR verification code.
12. Sales and authorized staff can view, download, print, or share the completed PDF.

## 4. Waybill Statuses

| Status | Meaning |
| --- | --- |
| Draft | Sales is preparing the waybill. |
| Pending approval | Waiting for an authorized reviewer. |
| Approved | Cleared for loading and dispatch. |
| Loaded | Warehouse has confirmed loaded quantities. |
| Dispatched | Driver has departed with the goods. |
| In transit | Delivery is active. |
| Delivered | Customer received and signed for the goods. |
| Partially delivered | Some quantities were not accepted or delivered. |
| Delivery failed | Delivery could not be completed. |
| Cancelled | Waybill was cancelled with a recorded reason. |
| Synced | Offline field changes have reached the server. |

Completed waybills must not be silently edited. Corrections should create an auditable amendment or authorized reversal.

## 5. Core Information to Capture

### Waybill identity

- Unique waybill number
- QR verification code
- Creation date and time
- Related sales order, invoice, or purchase order reference
- Branch, site, or dispatch location
- Current status

### Customer

- Customer or company name
- Customer account number
- Delivery address
- Primary contact name and telephone number
- Optional GhanaPost GPS/digital address

### Products

- Product name and SKU/code
- Unit of measure
- Ordered quantity
- Loaded quantity
- Delivered quantity
- Rejected or returned quantity
- Batch or lot number when applicable
- Notes on discrepancies or damaged items

### Transport

- Driver name and telephone number
- Vehicle registration number
- Optional transport company
- Dispatch date and time
- Departure GPS coordinates
- Delivery date and time
- Delivery GPS coordinates
- Optional odometer readings

### Proof of delivery

- Customer representative's full name and role
- Customer signature
- Driver signature
- Delivery photos and attachments
- Delivery notes
- Failure or discrepancy reason
- Device-recorded timestamps and GPS accuracy

## 6. Required Capabilities

### Offline operation

- Assigned waybills can be downloaded to the phone before travel.
- Field users can complete deliveries without internet access.
- Records, signatures, photos, GPS, and timestamps are stored securely on the device until synchronized.
- The user can see whether each record is pending, syncing, synced, or failed.
- Synchronization retries automatically and never creates duplicate deliveries.
- Conflicts are flagged for review rather than overwriting data silently.

### Digital signatures

- Finger or stylus signature capture.
- Signatory name, role, timestamp, and delivery record are bound to the signature.
- A consent/acknowledgement statement appears before signing.
- Completed signatures are included in the final PDF.

### GPS and timestamps

- Capture dispatch and delivery coordinates, device time, server time, and GPS accuracy.
- Do not block delivery when GPS is unavailable; require a reason and flag the record for review.
- Clearly distinguish device-captured data from manually entered corrections.

### Photos and attachments

- Capture delivery condition, damaged items, returned goods, or supporting documents.
- Compress photos for practical mobile synchronization while retaining useful quality.
- Store capture time and uploader identity.

### QR verification

- Every finalized PDF includes a unique QR code.
- Scanning opens a read-only verification page showing the waybill number, status, customer, dispatch/delivery dates, and document validity.
- The QR must use an opaque verification token rather than exposing a predictable database ID.

### Automatic PDFs

- Generate the official PDF only from server-validated data.
- Include Safisana branding, waybill details, item table, delivery evidence summary, both signatures, QR code, and document version.
- Regenerate through controlled amendments, retaining prior versions and a complete audit history.

## 7. User Roles

| Role | Main permissions |
| --- | --- |
| Sales officer | Create and update drafts; submit waybills; monitor deliveries. |
| Sales supervisor | Approve, reject, cancel, or authorize amendments. |
| Warehouse officer | Confirm loaded items and quantities. |
| Driver / delivery officer | View assigned deliveries; capture proof of delivery offline. |
| Finance / audit viewer | Read and export finalized records and audit history. |
| Administrator | Manage users, roles, products, customers, vehicles, numbering, and system settings. |

Access must follow least privilege. Drivers should only see deliveries assigned to them unless explicitly authorized otherwise.

## 8. Recommended Technical Architecture

- **Web:** Responsive React/Next.js application for the dashboard and public QR verification page.
- **Mobile:** Flutter application, initially packaged for Android, with a path to iOS from the same codebase.
- **Backend:** Django REST API, reusing the team's existing Python/Django experience while remaining independent from Collectra HQ.
- **Database:** PostgreSQL.
- **Offline storage:** Encrypted SQLite database on mobile with a durable synchronization queue.
- **Files:** S3-compatible object storage for photos, signatures, attachments, and generated PDFs.
- **Background jobs:** Redis-backed workers for PDF generation, notifications, and retryable processing.
- **Authentication:** Role-based accounts with short-lived access tokens, secure refresh, device/session revocation, and optional MFA for privileged users.
- **Deployment:** Containerized services with separate development, testing, and production environments.

## 9. Security and Audit Requirements

- Encrypt traffic using HTTPS and encrypt sensitive stored data.
- Record who performed every important action and when it occurred.
- Preserve original device timestamps alongside trusted server timestamps.
- Keep an immutable audit trail for approvals, dispatch, delivery, cancellation, amendment, PDF generation, and downloads.
- Apply file type and size limits, malware scanning where available, and signed/private file access.
- Support remote session revocation for lost or reassigned phones.
- Define retention, backup, restore, and deletion policies with Safisana management.
- Complete Ghana data-protection and internal policy review before production rollout.

## 10. Dashboard and Reports

- Today's planned, dispatched, delivered, failed, and pending deliveries
- Deliveries awaiting signatures or synchronization
- Partial deliveries, rejected quantities, and damaged goods
- Delivery turnaround time by customer, driver, route, or product
- Search by waybill, customer, order/invoice reference, vehicle, driver, and date
- PDF and spreadsheet exports subject to user permissions

## 11. MVP Acceptance Criteria

The first version is ready for pilot when:

- A sales officer can create and submit a complete waybill.
- Authorized staff can approve, load, and dispatch it.
- A driver can download, open, and complete it with no internet connection.
- GPS, timestamps, photos, customer signature, and driver signature are captured.
- Offline completion synchronizes exactly once when connectivity returns.
- A valid QR code verifies the finalized waybill.
- A branded PDF is generated automatically and can be retrieved from the web dashboard.
- All important actions appear in an audit log.
- Role permissions prevent unauthorized viewing and modification.
- Backup and restore have been tested successfully.

## 12. Delivery Phases

### Phase 1 — Discovery and process validation

- Collect the current paper waybill and any Excel templates.
- Map the real Sales, approval, warehouse, dispatch, delivery, and finance processes.
- Confirm mandatory fields, numbering rules, approval thresholds, and signature wording.
- Identify existing customer, product, invoice, and inventory systems that may require integration.

### Phase 2 — UX and technical foundation

- Create screen flows and a clickable prototype.
- Finalize the data model, API contract, permissions, offline sync rules, and audit model.
- Establish development, test, and production environments.

### Phase 3 — MVP implementation

- Build the web dashboard, mobile field workflow, backend API, QR verification, and PDF service.
- Add automated tests, monitoring, backup, and administrative controls.

### Phase 4 — Safisana pilot

- Train a small Sales, warehouse, and driver pilot group.
- Run digital and paper processes in parallel for a controlled period.
- Measure completion time, sync reliability, discrepancies, and user feedback.

### Phase 5 — Production rollout

- Resolve pilot issues, import approved master data, document support procedures, and roll out by team or site.
- Retire paper only after management approves the pilot evidence and contingency process.

## 13. Decisions Needed Before Screen Design

1. A clear photo or scan of Safisana's current paper sales waybill.
2. Product types sold and their units of measure.
3. Whether one waybill can contain several sales orders or invoices.
4. Who creates, approves, loads, dispatches, delivers, and closes a waybill today.
5. Whether approval depends on value, quantity, customer, product, or another rule.
6. Whether customers need the PDF by email, WhatsApp, printed copy, or a combination.
7. Whether the system must integrate with accounting, inventory, CRM, or another Safisana system.
8. Android versions and phone models used by drivers; whether iOS is required at launch.
9. Safisana's official waybill numbering format, logo assets, document wording, and retention policy.

## 14. Recommended Immediate Next Step

Obtain the current Safisana sales waybill and walk through one real delivery from order creation to customer signature. That source document and workflow should drive the database fields and first screen prototype; otherwise the team risks building a polished system that does not match daily operations.
