# Required merge protection

The workflow in `workflows/quality-gate.yml` runs for every pull-request commit
and for every push to `main`. GitHub branch protection must make its
`quality-gate` job mandatory; workflow files cannot enforce repository rules by
themselves.

In GitHub, open **Settings → Rules → Rulesets → New branch ruleset** and target
the default branch (`main`). Enable:

1. Require a pull request before merging.
2. Require approvals (at least one; two for payment/orchestration changes is
   recommended).
3. Dismiss stale approvals when new commits are pushed.
4. Require status checks to pass and select **quality-gate**.
5. Require branches to be up to date before merging.
6. Require conversation resolution before merging.
7. Block force pushes and branch deletion.
8. Do not allow bypassing these requirements, including for administrators.

The required check performs a locked `npm ci`, TypeScript validation, the full
financial/product logic test suite, Expo Doctor compatibility checks, and a
production Metro web export. A native EAS deployment should be added only after
the project has an EAS project ID, signing credentials, and separate preview and
production profiles; pull requests must not receive store-deployment secrets.

