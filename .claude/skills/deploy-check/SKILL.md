---
name: deploy-check
description: Verify a production deploy. Use after a merge to main, or when asked
  whether the site is up.
allowed-tools: Bash, Read
---

# Check a deploy

The deploy runs in GitHub Actions. The workflow copies `dist/` to the S3 bucket and
invalidates the CloudFront distribution.

1. Read the production URL from `docs/external.md`.
2. Run `gh run list --branch main --limit 5`. Find the deploy run for the commit.
3. If the run failed, run `gh run view <run-id> --log-failed` and report the step.
4. If the run passed, request the production URL and check for HTTP 200.
5. Check that the response has the headers `Content-Security-Policy`,
   `X-Content-Type-Options` and `Referrer-Policy`.
6. Open the production URL in a browser. Check that the song library shows.
7. Select "Try the demo song". Check that the editor opens with marks.

**Warning.** Do not run a command that creates, changes or deletes an AWS resource
without the user's confirmation. This check uses read-only commands.

A new version can take a few minutes to show after the invalidation starts.
