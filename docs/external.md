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
- Singer split models: two ONNX files with float16 weights. This project converted
  them in issue #191 from PyTorch checkpoints. The STFT is outside the model. The
  project did not train the models. The browser downloads a file from
  `models/<file>` on the site at the first run of its split mode. The PM uploads
  the `.onnx` files to the site bucket, and the deploy keeps the objects under
  `models/`. `public/models/NOTICE.txt` deploys with the site and holds the same
  facts. The maintainer ruled on 2026-11-25 to ship both files with attribution.
  - `bs_roformer_male_female_aufr33.v2.w16.onnx`, 266 945 164 bytes, SHA-256
    `da41d39969d2282c8bf1ce746f85fa01fb064666f1c0925b893d2447aaddd700`. Model:
    "BS-RoFormer male and female vocals model" by aufr33. Source: the model list of
    python-audio-separator 0.48.0, file
    `bs_roformer_male_female_by_aufr33_sdr_7.2889.ckpt`. The author states no
    licence. A copy at huggingface.co/Politrees/UVR_resources has the tag `mit`.
    This project converted the model from PyTorch to ONNX with float16 weights.
    The project did not train the model.
  - `mel_band_roformer_karaoke_becruily.v2.w16.onnx`, 864 108 113 bytes, SHA-256
    `0ee3f23372e832f74a6aac430684d690ccae2e645137296295ae60afc113eefb`. Model:
    "Mel-Band RoFormer karaoke model" by becruily. Source:
    https://huggingface.co/becruily/mel-band-roformer-karaoke , file
    `mel_band_roformer_karaoke_becruily.ckpt`. The author states no licence. This
    project converted the model from PyTorch to ONNX with float16 weights. The
    project did not train the model.
  - Model code: the conversion used the model classes of the package
    python-audio-separator 0.48.0. The licence file of that package is the MIT
    License, "Copyright (c) 2023 karaokenerds".
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
