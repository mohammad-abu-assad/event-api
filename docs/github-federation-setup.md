# GitHub Actions federation setup

These commands document the setup already created for
`mohammad-abu-assad/event-api`. Do not rerun the creation commands in the
same project. The numeric GitHub repository ID is `1456367621` and its
owner ID is `80985603`; numeric IDs avoid relying on reusable names.

## Create the identity provider

This enables the IAM Credentials and Security Token Service APIs.

```sh
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project=activity-tracker-514608 --quiet
```

This creates a pool for GitHub Actions identities.

```sh
gcloud iam workload-identity-pools create github-actions --project=activity-tracker-514608 --location=global --display-name='GitHub Actions' --quiet
```

This creates the deployer identity; the running service uses a separate account.

```sh
gcloud iam service-accounts create event-api-deployer --display-name='Event API GitHub deployer' --project=activity-tracker-514608 --quiet
```

This provider accepts GitHub tokens only for the specified repository and
owner, from a push to `main`.

```sh
gcloud iam workload-identity-pools providers create-oidc event-api-main \
  --project=activity-tracker-514608 --location=global \
  --workload-identity-pool=github-actions --display-name='Event API main branch' \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name' \
  --attribute-condition="assertion.repository_id == '1456367621' && assertion.repository_owner_id == '80985603' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'push'" \
  --quiet
```

This allows that repository's federated identity to impersonate the deployer.

```sh
gcloud iam service-accounts add-iam-policy-binding event-api-deployer@activity-tracker-514608.iam.gserviceaccount.com --project=activity-tracker-514608 --role=roles/iam.workloadIdentityUser --member='principalSet://iam.googleapis.com/projects/401789805659/locations/global/workloadIdentityPools/github-actions/attribute.repository_id/1456367621' --quiet --format='none'
```

## Grant the deployer access

This allows image uploads to the `event-api` Artifact Registry repository.

```sh
gcloud artifacts repositories add-iam-policy-binding event-api --location=europe-west1 --project=activity-tracker-514608 --role=roles/artifactregistry.writer --member='serviceAccount:event-api-deployer@activity-tracker-514608.iam.gserviceaccount.com' --quiet --format='none'
```

This allows deployments to the existing `event-api` Cloud Run service.

```sh
gcloud run services add-iam-policy-binding event-api --region=europe-west1 --project=activity-tracker-514608 --role=roles/run.developer --member='serviceAccount:event-api-deployer@activity-tracker-514608.iam.gserviceaccount.com' --quiet --format='none'
```

This lets the deployer attach the existing runtime identity to the service.

```sh
gcloud iam service-accounts add-iam-policy-binding event-api-runtime@activity-tracker-514608.iam.gserviceaccount.com --project=activity-tracker-514608 --role=roles/iam.serviceAccountUser --member='serviceAccount:event-api-deployer@activity-tracker-514608.iam.gserviceaccount.com' --quiet --format='none'
```

## GitHub repository variables

The workflow reads these non-secret values from the repository's Actions
variables. The API key stays in Secret Manager.

| Variable | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `activity-tracker-514608` |
| `GCP_REGION` | `europe-west1` |
| `GCP_WIF_PROVIDER` | `projects/401789805659/locations/global/workloadIdentityPools/github-actions/providers/event-api-main` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `event-api-deployer@activity-tracker-514608.iam.gserviceaccount.com` |

The existing Cloud Run service's secret mapping is retained on deploy. If a
secret version is rotated, update that mapping separately; the workflow does
not create or replace secret versions.
