# Changesets

This folder is used by [Changesets](https://github.com/changesets/changesets) to track version bumps and changelogs.

## Adding a changeset

When you make a change that should result in a new version of a package, run:

```bash
pnpm changeset
```

This will prompt you to select the packages that changed and the type of change (major, minor, patch).

## Versioning and publishing

Versioning and publishing happens automatically via GitHub Actions when changesets are merged to `main`.
