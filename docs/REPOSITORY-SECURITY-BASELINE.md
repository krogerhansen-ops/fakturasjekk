# Repository security baseline

Fakturasjekk uses GitHub as a production control surface. Repository settings are therefore part of the security boundary.

## Required before live customer processing

The `main` branch must be protected by a GitHub ruleset or branch-protection rule that, at minimum:

- blocks direct pushes to `main`;
- requires pull requests before merge;
- requires the Fakturasjekk quality gate to pass;
- requires branches to be up to date before merge where supported;
- requires CODEOWNER review for changes to critical production/security paths;
- prevents force-push and branch deletion;
- does not permit bypass except an explicitly controlled emergency path.

## Current repository-side controls

- GitHub Actions are pinned to immutable commit SHAs.
- Workflow tokens use explicit least-privilege `permissions` blocks.
- Checkout credentials are not persisted in workflows that checkout repository code.
- Dependabot may propose GitHub Actions upgrades, but major upgrades are reviewed and CI-tested before merge.
- `.github/CODEOWNERS` assigns ownership of workflows, server, Supabase, rules, config and tests.

## Fail-closed rule

Repository protection is a launch gate. Presence of CODEOWNERS or CI files alone is not evidence that GitHub is enforcing them. Launch evidence must include a live read-back of the active repository ruleset/branch-protection state.
