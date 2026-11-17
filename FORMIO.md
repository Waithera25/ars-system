# Data capture with Form.io

## What is included

Sign into ARS and choose **Data capture**. The app embeds the official Form.io JavaScript builder and renderer (`@formio/js` 5.7.1, MIT) using local assets. A Form.io cloud account or separate Form.io API server is not required for this implementation. Submissions are saved by ARS, not sent to Form.io.

Clients can complete published forms and see their own submissions. Staff can capture on behalf of a selected client, view all submissions, create new forms, and edit/publish form versions using the embedded drag-and-drop builder. Two starter forms are included: Travel enquiry and Client details.

Supported fields: text, paragraph text, email, phone, number, date, static dropdown, checkbox, and submit. Unsupported fields, scripts, dynamic data sources, and conditional logic are rejected on save. Form schemas are normalized to supported properties. Required fields, length limits, dropdown choices, dates, and numeric bounds are checked on the server. File uploads and identity documents are not included.

The admin screen is a local integration of Form.io's open-source builder, not the hosted Form.io Developer Portal. External Form.io project/API synchronization and the full Form.io platform are not configured.

## Docker update

Replace the app source with the updated files, keeping your existing `.env` and Docker volumes. Rebuild using the same Compose files you normally use. For the basic lab:

```
docker compose -f compose.yaml -f compose.lab.yaml up -d --build
```

Refresh ARS with Ctrl+F5 and choose Data capture. Existing client accounts and records are preserved; new tables are added automatically. Do not delete the volumes. These files update the packaged source; an existing Desktop checkout or running container is not automatically changed.

## Form versions and submissions

Saving creates a new version; previous submissions keep the exact schema and title from their submitted version. Draft forms are hidden from clients. Submitting an outdated version returns a reload message. Each submission has a retry identifier to avoid storing duplicate network retries. A new intentional submission receives a new ID.

Clients cannot choose another client's identity in their submission. Staff must select a valid client. Captured answers do not automatically overwrite the client's profile or create service requests. The submissions screen displays up to the latest 500 entries visible to the account; there is no bulk export or pagination in this version.

## n8n / Notion

Each accepted submission and its outgoing event commit in the same transaction. The event is:

```json
{
  "type": "capture.submitted",
  "event_id": "unique delivery ID",
  "created": "event timestamp",
  "data": {
    "id": "submission ID",
    "form_id": "travel-enquiry",
    "form_title": "Travel enquiry",
    "version": 1,
    "client_id": "authenticated client ID",
    "data": {"travellerName": "Example Traveller"},
    "created": "submission timestamp"
  }
}
```

The existing request-only n8n draft does not handle this event. Add an explicit `capture.submitted` route, map each form's fields to the intended Notion properties, deduplicate by submission/event ID, and test before redirecting delivery from the lab. No live Notion records or workflows are changed by this source update.

This remains the experimentation app. Your supplied Operations Tooling Stack identifies separate official records and leaves some tool choices unapproved. Captured information currently persists in ARS and its event queue; decide the approved record destination, retention, and deletion process before using real client information. No automated customer messages are added.

## Assets and documentation

Vendored files retain Form.io and bundled third-party notices in `public/vendor/`. Bootstrap 4.6.2 is bundled for the embedded form's layout. The form runs in a same-origin frame to keep Bootstrap from changing the portal design. Browser connections are restricted to the ARS origin; arbitrary script evaluation is disabled. Only local styles allow inline declarations for the builder's layout.

- https://help.form.io/developers/form-development/form-renderer
- https://help.form.io/developers/form-development/form-builder
- https://github.com/formio/formio.js
