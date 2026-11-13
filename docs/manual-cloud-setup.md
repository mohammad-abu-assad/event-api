# Manual Google Cloud setup

These commands document the setup already performed in project
`activity-tracker-514608`. The resources already exist, so do not rerun their
creation commands in this project. The commands below assume the repository is
the current directory and the Google Cloud CLI and Docker are installed.

## Enable APIs

This enables the services needed by Firestore, Cloud Run, Artifact Registry,
Secret Manager, service accounts, and project IAM.

```sh
gcloud services enable firestore.googleapis.com run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com cloudresourcemanager.googleapis.com --project=activity-tracker-514608 --quiet
```

## Create resources

This creates the default Firestore database in Native mode in Belgium.

```sh
gcloud firestore databases create --database='(default)' --location=europe-west1 --type=firestore-native --project=activity-tracker-514608 --quiet
```

This creates the Docker image repository in the same region.

```sh
gcloud artifacts repositories create event-api --repository-format=docker --location=europe-west1 --project=activity-tracker-514608 --quiet
```

This creates the identity used by the running API.

```sh
gcloud iam service-accounts create event-api-runtime --display-name='Event API runtime' --project=activity-tracker-514608 --quiet
```

This creates the Secret Manager container for the API key mapping.

```sh
gcloud secrets create api-keys --replication-policy=automatic --project=activity-tracker-514608 --quiet
```

This creates the composite index used by the stats query; wait for its state to
be `READY` before relying on stats.

```sh
gcloud firestore indexes composite create --collection-group=events --query-scope=collection --field-config=field-path=clientId,order=ascending --field-config=field-path=date,order=ascending --project=activity-tracker-514608 --quiet
```

This checks the index state.

```sh
gcloud firestore indexes composite list --project=activity-tracker-514608 --format='table(name,state)' --quiet
```

## Grant access and add the secret version

This grants the runtime identity Firestore data read/write access.

```sh
gcloud projects add-iam-policy-binding activity-tracker-514608 --member='serviceAccount:event-api-runtime@activity-tracker-514608.iam.gserviceaccount.com' --role=roles/datastore.user --condition=None --quiet --format='none'
```

This grants that identity access to the `api-keys` secret only.

```sh
gcloud secrets add-iam-policy-binding api-keys --member='serviceAccount:event-api-runtime@activity-tracker-514608.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor --project=activity-tracker-514608 --quiet --format='none'
```

This adds a secret version from a local JSON file without placing the key in a
command argument. The deployment used an owner-readable file at the path shown;
keep it private and do not commit or share its contents.

```sh
gcloud secrets versions add api-keys --data-file="$HOME/.config/event-api/api-keys.json" --project=activity-tracker-514608 --quiet
```

## Build, push, and deploy

This configures Docker to authenticate to the regional registry using the
Google Cloud CLI credential helper.

```sh
gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet
```

These commands build the image for Cloud Run's Linux x86-64 environment, tag
it, and push it to the registry. The manual image contains the local Firestore
changes; it is not a build of the preceding Git commit alone.

```sh
docker build --platform linux/amd64 -t europe-west1-docker.pkg.dev/activity-tracker-514608/event-api/event-api:manual-4456c87 .
docker tag europe-west1-docker.pkg.dev/activity-tracker-514608/event-api/event-api:manual-4456c87 europe-west1-docker.pkg.dev/activity-tracker-514608/event-api/event-api:manual-firestore-20261113
docker push europe-west1-docker.pkg.dev/activity-tracker-514608/event-api/event-api:manual-firestore-20261113
```

This deploys the image with the runtime identity, Firestore store, secret
version 1, public access, and zero-to-two instances.

```sh
gcloud run deploy event-api --project=activity-tracker-514608 --region=europe-west1 --image=europe-west1-docker.pkg.dev/activity-tracker-514608/event-api/event-api:manual-firestore-20261113 --service-account=event-api-runtime@activity-tracker-514608.iam.gserviceaccount.com --set-env-vars=STORE=firestore --set-secrets=API_KEYS=api-keys:1 --min-instances=0 --max-instances=2 --allow-unauthenticated --quiet
```

This checks the public health endpoint without an API key.

```sh
curl https://event-api-401789805659.europe-west1.run.app/health
```
