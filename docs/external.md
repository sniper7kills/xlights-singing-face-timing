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
- Demucs model: `htdemucs_embedded.onnx` of `timcsy/demucs-web-onnx` on the
  Hugging Face Hub, commit `92e33df61cfc9eb820272aaa62d2ef6dcf4d950d`, downloaded by
  the browser at the first run with "Separation model" set to Demucs. The licence
  notes are in `docs/licences/README.md`.
- Singer split models: two ONNX files with float16 weights, made in issue #191
  from RoFormer checkpoints. The browser downloads a file from `models/<file>` on
  the site at the first run of its split mode. The PM uploads the files to the site
  bucket. The deploy keeps the objects under `models/`.
  - `bs_roformer_male_female_aufr33.w16.onnx`, 272 233 247 bytes, SHA-256
    `84ecd40a7ba5e8bbb1ddc4d56f329288654968d329ccf34aba9f0ec9012aa980`. Source
    checkpoint: `bs_roformer_male_female_by_aufr33_sdr_7.2889.ckpt` by aufr33, from
    the model list of `audio-separator` 0.48.0. A mirror is
    https://huggingface.co/Politrees/UVR_resources . Licence: not stated by the
    author. The mirror has the tag `mit`.
  - `mel_band_roformer_karaoke_becruily.w16.onnx`, 868 622 079 bytes, SHA-256
    `46d63c42cebf13306053cbef804f897cf54efabf11192523ee7236546b62a8fc`. Source
    checkpoint: `mel_band_roformer_karaoke_becruily.ckpt`, from
    https://huggingface.co/becruily/mel-band-roformer-karaoke . Licence: not stated
    by the author. The page has no licence field and no model card.
  - The contract of the files (`CONTRACT.md`, `reference.py` and the test vectors)
    is on the development computer of the maintainer. Issue #191 records it.
- Dictionary: `cmudict.dict` from https://github.com/cmusphinx/cmudict, commit
  `74790861f652b15e4ac49015a90074ad62a27690` (2025-10-24). The licence is a
  BSD-2-Clause style licence, copyright Carnegie Mellon University. The copy is in
  `vendor/cmudict/`. `node scripts/build-dictionary.mjs` writes
  `public/dict/cmudict.json` and `public/dict/cmudict-LICENSE.txt`. The "How it
  works" strip acknowledges Carnegie Mellon University.
- xLights source, for the `.xtiming` format:
  https://github.com/xLightsSequencer/xLights
- xLights manual: https://manual.xlights.org/xlights/
- Singer models: `onnx-community/pyannote-segmentation-3.0` and
  `onnx-community/wespeaker-voxceleb-resnet34-LM` on the Hugging Face Hub,
  downloaded by the browser at the first run with the singer option on. The licence
  notes are in `docs/licences/singer-models.md`.

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
