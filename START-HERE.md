# Your Air Royal Services experimentation kit

This ZIP contains editable source code, a Dockerfile, and a Docker Compose stack. Docker builds the ARS container on your computer; this is not a prebuilt image archive. The first build needs internet access to download Node and n8n images.

This version includes **Data capture with Form.io**. After signing in, choose Data capture to complete the starter forms. Staff can use Manage forms and New form to build forms and see All submissions. Read FORMIO.md before mapping the new `capture.submitted` events into n8n and Notion.

## Start on Windows

1. Extract the entire ZIP to a normal folder.
2. Start Docker Desktop with Linux containers enabled.
3. Open PowerShell in the extracted `ars-system` folder.
4. Run `powershell -ExecutionPolicy Bypass -File .\Start-Lab.ps1`. This bypass applies only to that script process.
5. Open `.env` in a text editor to find `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The script generates unique credentials on first run and preserves existing settings.

| Tool | Browser address | Purpose |
|---|---|---|
| ARS | http://localhost:3000 | Team and client workflows |
| n8n | http://localhost:5678 | Build automation and app connections; complete its separate owner signup |
| Connection lab | http://localhost:3100 | Inspect authenticated test events |

The experiment launcher deliberately sends ARS events to the connection lab first. No Notion or email credentials are needed for this first test. Only use fictional client data while experimenting.

## First experiment — check that ARS sends data

1. Sign into ARS as the admin and create a fictional client account.
2. Submit a request, change its status, and publish a report for that client.
3. Wait about 15 seconds. Open the connection lab, enter `N8N_WEBHOOK_SECRET` from `.env`, and select **Load captured events**.
4. You should see `client.created`, `request.created`, `request.updated`, and `report.published` events. The receiver saves each event ID once, even when it is retried.
5. Open a private browser window, sign in as the client, and check that only that client's information and published reports appear.

Connection lab records persist in a separate Docker volume. Its viewer shows the last 100 events; it is a test tool rather than a production monitoring system.

## Second experiment — put n8n in the middle

1. Follow `INTEGRATIONS.md` to create an authenticated production Webhook in n8n at `/webhook/ars-events`.
2. For an initial workflow, follow the webhook with an HTTP Request node: POST to `http://webhook-lab:3100/events`, send the incoming webhook's body as JSON, and add `X-ARS-Secret` using an n8n Header Auth credential with the same secret. Configure the webhook to respond after the final node succeeds.
3. Copy `compose.lab.yaml` to `compose.n8n.yaml`. In the copy, change only ARS's `N8N_WEBHOOK_URL` to `http://n8n:5678/webhook/ars-events`.
4. Run `docker compose -f compose.yaml -f compose.n8n.yaml up -d --build`.
5. Create another ARS request. Check n8n's execution history and the connection lab. This tests ARS → n8n → connection lab.

Use the same Compose file combination for subsequent starts/stops. `Start-Lab.ps1` always switches ARS back to sending directly to the lab. Existing successfully delivered events are not automatically replayed when changing destinations: create new test records.

## Third experiment — add Notion and other apps

Add a Notion node in n8n, authorize a test Notion workspace/database, and map the ARS event fields. See `INTEGRATIONS.md` for the suggested database structure. Notion remains an external connected service; it is not installed inside this Docker stack.

You can then try other n8n-supported app connectors or HTTP APIs. Each external service may require its own account, key, permissions, or subscription. A container provides a place to run software; it does not automatically make every app compatible.

For another self-hosted app, copy `compose.apps.example.yaml` to `compose.apps.yaml`, replace its placeholders using that app's official instructions, and run:

```
docker compose -f compose.yaml -f compose.lab.yaml -f compose.apps.yaml up -d --build
```

Each app runs in its own container on the shared Compose network. From n8n use `http://extra-app:PORT` for your added service. Inside a container, `localhost` refers to that container, not your computer or another app. Keep browser-facing ports unique. Add required databases, volumes, and credentials according to each app's documentation.

## Stop, inspect, and resume

- Stop the basic lab: `powershell -File .\Stop-Lab.ps1`.
- Resume: `powershell -ExecutionPolicy Bypass -File .\Start-Lab.ps1`.
- See container status: `docker compose -f compose.yaml -f compose.lab.yaml ps`.
- See logs: `docker compose -f compose.yaml -f compose.lab.yaml logs --tail 100`.
- Rebuild after editing source: `docker compose -f compose.yaml -f compose.lab.yaml up -d --build`.

Named volumes retain client data and n8n workflows when containers stop or rebuild. Do not remove volumes unless you intend to erase their contents. Changing the admin password in `.env` does not reset an existing database account; change it in ARS Account settings.

## Scope and verification

The app includes private client access, client profiles, requests, written reports, and outbound automation events. It does not include a general plugin installer, inbound automation API, attachments, password recovery, or automatic compatibility testing for arbitrary tools. Notion synchronization is outbound through workflows you configure.

The app's access-control tests have passed. The Docker configuration can be checked without starting containers, but this package has not been run end to end in Docker here because the Docker engine is stopped. Test the first and second experiments before connecting live client accounts. See README.md for remote hosting and backup guidance.

References: https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/ and https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
