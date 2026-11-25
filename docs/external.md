# Facts outside the codebase

This file holds names and pointers only. It never holds a secret, a token or a
credential.

## Production

- Production URL: https://d2n8thyuui0ybd.cloudfront.net (the default domain of the
  distribution).
- AWS account and region: the account with the alias `sniper7kills`, region
  `us-east-1`.
- CloudFormation stack name: `xlights-singing-face-timing`.
- The stack parameter `GitHubSubjectPrefix` holds the subject claim prefix of the
  repository. The repository uses immutable subject claims. Read the prefix with
  `gh api repos/sniper7kills/xlights-singing-face-timing/actions/oidc/customization/sub`.

## GitHub Actions repository variables

| Name | Meaning |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | The IAM role that the deploy workflow assumes through GitHub OIDC. |
| `SITE_BUCKET` | The name of the S3 bucket that holds the built files. |
| `CLOUDFRONT_DISTRIBUTION_ID` | The id of the CloudFront distribution. |

These values come from the outputs of the hosting stack.

## Hosting stack

- Template: `infra/hosting.yml`. Create the stack in `us-east-1`.
- Parameter `GitHubRepository`: the repository as `owner/name`. The deploy role
  trusts only `repo:<owner>/<name>:ref:refs/heads/main`.
- Parameter `CreateGitHubOidcProvider`: `true` only if the account has no IAM OIDC
  provider for `token.actions.githubusercontent.com`. The default is `false`.
- Stack outputs and the repository variable that each one fills:

| Output | Repository variable |
|---|---|
| `DeployRoleArn` | `AWS_DEPLOY_ROLE_ARN` |
| `SiteBucketName` | `SITE_BUCKET` |
| `DistributionId` | `CLOUDFRONT_DISTRIBUTION_ID` |
| `DistributionDomainName` | None. It is the production URL. |

- The deploy workflow is `.github/workflows/deploy.yml`. It runs on each push to
  `main`. If a repository variable is not set, the first step fails and names it.
- Files in `assets/` get `Cache-Control: public, max-age=31536000, immutable`.
  All other files, `index.html` included, get `Cache-Control: no-cache`.

## Build-time environment variables

| Name | Meaning |
|---|---|
| `VITE_APP_VERSION` | Version text for the `SourceVersion` attribute. Optional. |

## Third-party sources

- Speech model files: the Hugging Face Hub, downloaded by the browser at run time.
- Vocal separation model: the Spleeter 2-stem files of
  `csukuangfj/sherpa-onnx-spleeter-2stems` on the Hugging Face Hub, downloaded by
  the browser at the first run with the option on. The licence notes are in
  `docs/licences/README.md`.
- Dictionary: `cmudict.dict` from https://github.com/cmusphinx/cmudict, commit
  `74790861f652b15e4ac49015a90074ad62a27690` (2025-10-24). The licence is a
  BSD-2-Clause style licence, copyright Carnegie Mellon University. The copy is in
  `vendor/cmudict/`. `node scripts/build-dictionary.mjs` writes
  `public/dict/cmudict.json` and `public/dict/cmudict-LICENSE.txt`. The "How it
  works" strip acknowledges Carnegie Mellon University.
- xLights source, for the `.xtiming` format:
  https://github.com/xLightsSequencer/xLights
- xLights manual: https://manual.xlights.org/xlights/

## Test data

- Demo song: `public/demo/silent-night.ogg`, with its marks in
  `public/demo/silent-night.marks.json`. The clip is the opening of "Silent
  Night" by the United States Army Chorus, 2010.
  - Page: https://commons.wikimedia.org/wiki/File:Silent_Night_(choral).ogg
  - Licence: public domain in the United States, as a work of the U.S. federal
    government. The maintainer accepted the United States-only status.
  - `public/demo/README.md` quotes the licence statement and records how the clip
    and the marks were made.

## Manual checks

- An xLights installation is needed for the `xlights-import-check` skill. Download:
  https://xlights.org
