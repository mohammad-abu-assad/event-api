# Event API runbook

Project: `activity-tracker-514608` · Region: `europe-west1` · Service: `event-api`

## Roll back a bad revision

1. In Google Cloud Console, open **Cloud Run → event-api → Revisions** and
   identify the last known-good revision and the revision receiving traffic.
   Alternatively, list revisions from your terminal:

   ```sh
   gcloud run revisions list --service=event-api --region=europe-west1 --project=activity-tracker-514608
   ```

2. Replace `GOOD_REVISION` with the exact known-good name, start a timer, and
   send all traffic to it:

   ```sh
   gcloud run services update-traffic event-api --region=europe-west1 --project=activity-tracker-514608 --to-revisions=GOOD_REVISION=100
   ```

3. Confirm that the selected revision receives 100% of traffic, then check
   the public endpoint and stop the timer when it returns HTTP 200:

   ```sh
   gcloud run services describe event-api --region=europe-west1 --project=activity-tracker-514608 --format='yaml(status.traffic)'
   curl -i https://event-api-401789805659.europe-west1.run.app/health
   ```

   The body should be `{"status":"ok"}`. Traffic changes can take time to
   propagate; retry the health check until it succeeds.

4. Fix the problem and deploy a verified revision. Routing to a named
   revision pins traffic there; when ready for future deployments to receive
   traffic automatically, restore routing to the latest ready revision:

   ```sh
   gcloud run services update-traffic event-api --region=europe-west1 --project=activity-tracker-514608 --to-latest
   ```

## Deploy and inspect logs

Pushes to `main` run CI and deploy after checks pass. See
[manual cloud setup](manual-cloud-setup.md) and
[GitHub federation setup](github-federation-setup.md) for the setup commands.
In the console, open **Cloud Run → event-api → Logs** to inspect structured
request logs, or use **Logging → Logs Explorer** and filter by service and
revision. Never include an API key or event properties in a log query.

For unexpected request failures, the structured request log includes an
`errorCategory` derived from a small allowlist of numeric gRPC status
codes. Examples are `PERMISSION_DENIED`, `FAILED_PRECONDITION`, and
`UNAVAILABLE`; other errors are recorded as `UNKNOWN`. Use the category
as a troubleshooting clue, not proof of a specific cause. Raw exception
messages and request data are deliberately excluded from the log.

## Rotate an API key

Create a new private JSON file containing the full client-ID-to-key mapping.
Add it as a new version of Secret Manager's `api-keys` secret, then update
the Cloud Run `API_KEYS` secret reference to that version and deploy the new
revision. Coordinate the change with clients: the previous key stops working
once the new revision serves traffic. The GitHub workflow preserves the
existing secret reference. Never put keys in Git, command arguments, or logs.
