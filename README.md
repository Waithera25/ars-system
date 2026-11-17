# Air Royal Services — client hub

**Want to experiment? Start with `START-HERE.md`.** The included `Start-Lab.ps1` prepares unique local credentials and launches ARS, n8n, and an authenticated event inspector. Additional apps can be added as separate containers.

**Form.io data capture is included.** Choose Data capture after signing in. Staff can build and publish forms; clients can submit them and view their own answers. See `FORMIO.md` for setup and n8n event mapping.

A self-hosted first version for collecting client details, tracking requests, and sharing written reports. The app runs with Node.js 24 and a persistent SQLite database; the embedded Form.io builder and renderer are bundled locally. Docker Compose also runs n8n. Notion is connected through your n8n workflows; no accounts have been connected automatically.

## Start with Docker Desktop

1. Start Docker Desktop with its Linux engine.
2. In this folder, copy `.env.example` to `.env`.
3. Set your real `ADMIN_EMAIL`, a unique `ADMIN_PASSWORD` of at least 12 characters, and a random `N8N_ENCRYPTION_KEY` of at least 32 characters. Never share or commit `.env`.
4. Run `docker compose up -d --build`.
5. Open http://localhost:3000 for ARS and http://localhost:5678 for n8n. Complete n8n's owner-account setup.
6. Sign into ARS with the admin account. In **Clients**, create a client account. Share the initial password privately. Clients can change it under **Account settings**.

The admin environment variables create the first account only. Changing them later does not reset an existing password. Use Account settings to change a password. This version has one initial staff account; additional staff invitations and email password recovery are future work.

For a direct local start without Docker, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `STAFF_PASSWORD` in your shell and run `node server.mjs` using Node 24+. Data is stored in `data/` unless `DATA_DIR` is configured.

## What works

- Staff: create client accounts, read all clients, create requests, update request status, write internal report drafts, publish a report to its client.
- Clients: view and edit their name, company, and phone; submit requests; view their own request statuses and published reports.
- Passwords are salted and hashed. Sessions expire after eight hours. Changing a password invalidates that user's sessions.
- Authorization is enforced on the server. A client-supplied client ID cannot redirect a request to someone else's account.
- Database writes and outgoing automation events commit together. Undelivered events retry every 15 seconds when the webhook is configured.
- Draft reports are internal. Publishing a report makes it visible immediately in that client's portal. Email delivery requires an n8n workflow and an email connection.

## Connect n8n and Notion

See `INTEGRATIONS.md` for event fields, webhook authentication, recommended Notion databases, and workflow steps. The Connections screen reports configured webhook settings and pending deliveries. It does not claim that Notion is connected.

## Before inviting remote clients

This Compose configuration binds ARS and n8n to this computer only. Put ARS behind a reverse proxy with HTTPS on your chosen domain, set `PUBLIC_URL` to that exact HTTPS origin, set `COOKIE_SECURE=true`, and recreate the ARS container. Keep the n8n editor private. For remote access, deliberately configure the proxy and firewall rather than exposing the application ports directly.

Back up both Docker volumes and `.env` securely. Stop ARS before copying its SQLite files so the backup includes committed WAL data. Keep the n8n encryption key with the backup: it is needed to recover encrypted credentials. Test restoration before collecting live client information.

This first version does not include attachments, invoicing, account deletion, MFA, password recovery, multiple staff roles, or scheduled report generation. Confirm your service categories, fields, retention policy, domain, and email sender before production rollout. Review and test deployment and access controls on your server.

## Reference documentation

- n8n self-hosting: https://docs.n8n.io/hosting/installation/docker/
- Official deployment examples: https://github.com/n8n-io/n8n-hosting
- Notion page creation: https://developers.notion.com/reference/post-page
- Notion API versioning: https://developers.notion.com/reference/versioning
