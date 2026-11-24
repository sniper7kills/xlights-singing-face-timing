# 0001 — Host the app on S3 with CloudFront

Date: 2026-11-24
Status: accepted

## Context

The app is a set of static files with no backend. The user wants AWS hosting. Two
options fit: AWS Amplify Hosting, and a private S3 bucket behind CloudFront. The
planner proposed Amplify Hosting because it needs the least setup. The user chose
S3 with CloudFront at the spec review.

## Decision

A private S3 bucket holds the built files. A CloudFront distribution serves them
through an origin access control. A response headers policy sets the security
headers. One CloudFormation template, `infra/hosting.yml`, declares the resources.
A GitHub Actions workflow deploys each commit on `main` with `aws s3 sync` and
`aws cloudfront create-invalidation`. The workflow gets credentials through GitHub
OIDC. The production URL is the default CloudFront domain.

## Consequences

- The project owns a template and a deploy workflow. Amplify Hosting hides both.
- The project controls cache rules and headers in one place.
- The repository stores no AWS access key.
- The app uses hash routes, so the distribution needs no rewrite rule.
- A custom domain later needs a certificate and an alias on the distribution.
