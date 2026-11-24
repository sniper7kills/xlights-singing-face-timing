# Facts outside the codebase

This file holds names and pointers only. It never holds a secret, a token or a
credential.

## Production

- Production URL: TODO(Epic 0) — the default `*.cloudfront.net` domain of the
  distribution.
- AWS account and region: TODO(Epic 0) — the user names them.
- CloudFormation stack name: TODO(Epic 0).

## GitHub Actions repository variables

| Name | Meaning |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | The IAM role that the deploy workflow assumes through GitHub OIDC. |
| `SITE_BUCKET` | The name of the S3 bucket that holds the built files. |
| `CLOUDFRONT_DISTRIBUTION_ID` | The id of the CloudFront distribution. |

These values come from the outputs of the hosting stack.

## Build-time environment variables

| Name | Meaning |
|---|---|
| `VITE_MODEL_HOST` | Base URL for speech model files. Optional. |
| `VITE_APP_VERSION` | Version text for the `SourceVersion` attribute. Optional. |

## Third-party sources

- Speech model files: the Hugging Face Hub, downloaded by the browser at run time.
- Dictionary: `cmudict.dict` from https://github.com/cmusphinx/cmudict. The build
  script converts it. Acknowledge Carnegie Mellon University in the app.
- xLights source, for the `.xtiming` format:
  https://github.com/xLightsSequencer/xLights
- xLights manual: https://manual.xlights.org/xlights/

## Test data

- Demo song: `public/demo/`. TODO(Epic 0) — record the source and the licence of
  the audio clip.

## Manual checks

- An xLights installation is needed for the `xlights-import-check` skill. Download:
  https://xlights.org
