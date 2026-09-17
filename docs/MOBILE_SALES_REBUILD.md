# SafiRoute Sales mobile rebuild

The supported phone experience is the Sales digital waybill pad at `/field`.

## Product scope

- Sales-only mobile workflow; there is no driver phone workflow.
- Local-first waybill drafts in IndexedDB with autosave.
- Three signatures: Sales/Authorised, Dispatch, and Customer/Received-by.
- GPS (or an explicit unavailable reason), delivery photo, timestamps, and offline completion.
- Completed waybills remain `Waiting for HQ` until the authenticated Django ingest endpoint accepts the client UUID.
- Idempotent mobile ingest prevents duplicate waybills when a queued completion is retried.
- HQ generates the tamper-evident PDF and QR-verifiable record after acceptance.
- Grouped phone Settings includes phone, usual vehicle, saved Sales signature, optional PIN lock, backup export, install instructions, and manual sync.
- The mobile home includes a subtle live waybill-route animation to communicate the delivery/verification flow without distracting from field work.

## Routes

- `/field` — Sales mobile home and saved waybills.
- `/field/new` — create a new local-first waybill.
- `/field/waybill/<local-uuid>` — reopen a draft or view a completed local record.
- `/field/settings` — grouped phone settings.

Legacy driver routes under `/field/run` and `/field/queue` are not part of the supported Sales mobile experience.
