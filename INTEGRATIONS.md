# ARS automation connections

## Configure the webhook

Create an n8n workflow with a **Webhook** trigger:

- Method: POST.
- Path: `ars-events`.
- Authentication: Header Auth, header name `X-ARS-Secret`, and a new long random secret.
- Response: only after the workflow has processed and durably saved the event. Configure errors to return a non-2xx status. Do not acknowledge the event before its essential work succeeds.

Publish/activate the workflow. In `.env` set:

```
N8N_WEBHOOK_URL=http://n8n:5678/webhook/ars-events
N8N_WEBHOOK_SECRET=<the same secret configured in n8n>
```

Then run `docker compose up -d ars`. Docker's internal `n8n` hostname is used by ARS; your browser still uses localhost for the editor.

## Event contract

All events are POSTed as JSON:

```json
{
  "event_id": "unique event identifier",
  "type": "request.created",
  "created": "ISO timestamp",
  "data": {
    "id": "request identifier",
    "client_id": "client identifier",
    "title": "Service request",
    "details": "Client supplied description",
    "status": "New",
    "created": "ISO timestamp"
  }
}
```

Event types:

| Type | Data fields |
|---|---|
| `client.created`, `client.updated` | `id`, `name`, `email`, `phone`, `company` |
| `request.created`, `request.updated` | `id`, `client_id`, `title`, `details`, `status`, `created` |
| `report.published` | `id`, `client_id`, `title`, `body`, `published`, `created` |

Passwords, session cookies, and internal draft reports are never placed in automation events. Published report content and client contact details are sent to your configured webhook, so connect only to a service you control.

Delivery is at least once, in event creation order. Timeouts, failures, and restarts can cause duplicates. Deduplicate using `event_id` before sending email; upsert Notion records by `data.id`. The oldest failed event blocks later delivery until the workflow recovers. There is no dead-letter UI in this version. Requests time out after 10 seconds, so keep intake processing short and persist work before acknowledging it.

## Recommended Notion workspace

Create private team databases and connect them to a Notion integration through n8n's credentials UI. Do not put a Notion token into browser code, ARS forms, or a client-shared page.

| Database | Suggested properties |
|---|---|
| Clients | Name (title), ARS Client ID (text), Email (email), Phone (phone), Company (text) |
| Requests | Name (title), ARS Request ID (text), ARS Client ID (text), Details (text), Status (select), Created (date) |
| Reports | Name (title), ARS Report ID (text), ARS Client ID (text), Content (text), Published (checkbox), Created (date) |
| Automation events | Name (title), ARS Event ID (text), Type (text), Processed (date) |

Notion contains the internal team copy. Clients use ARS, where access is restricted by their account. Do not share the all-client Notion databases with clients.

## First workflow

1. Webhook receives the authenticated event. In n8n expressions the payload is typically under `$json.body`.
2. Look up `event_id` in the event ledger. If already completed, acknowledge without repeating side effects.
3. Route by `type` with a Switch node.
4. Upsert the relevant Notion record by the ARS entity ID. Split long report text into blocks if needed to meet Notion field limits.
5. Mark the event processed only after essential writes succeed.
6. Respond with a successful HTTP response. If writing fails, return an error so ARS retries.

Keep client records, status updates, and published reports flowing from ARS to Notion initially. Editing Notion does not update ARS in this version. Bidirectional updates require a separately authenticated service API and conflict rules; browser session endpoints should not be used as a substitute.

For email confirmations and report notifications, add your chosen email provider to n8n and use a separate durable email job with its own deduplication key. Sending email and writing a ledger are not an atomic operation; design retries to avoid duplicate notifications. Scheduled reporting can be added with n8n's Schedule Trigger after the report format and recipients are agreed.
