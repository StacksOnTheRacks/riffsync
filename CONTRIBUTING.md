# Contributing

Thanks for helping improve RiffSync. This project is open source; the notes below keep branches and releases consistent.

## Branch naming

Use this pattern so every branch ties to an issue:

```text
{type}/issue-{number}
```

Examples:

- `feature/issue-1`
- `defect/issue-5`

Pick a `{type}` that matches the work (non-exhaustive):

- `feature` — new behavior or user-facing capability
- `defect` — bug fixes
- `chore` — tooling, refactors, maintenance without product behavior change
- `docs` — documentation-only changes

If work is not tracked in an issue yet, open one first so the branch name can include the correct number.

## Versioning

Releases follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). Branch names do not encode version numbers; versioning applies to tagged releases and changelog expectations, not to the `{type}/issue-{number}` pattern above.

## Pull requests

Open a pull request from your branch into the default branch. Describe what changed and link the related issue. Keep changes focused so review stays straightforward.
