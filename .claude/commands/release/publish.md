---
description: Publish a new version of the archbook CLI to npm, tag it and create the GitHub release
argument-hint: "[version, e.g. 0.2.0 | patch | minor | major]"
---

# Publish a release

Arguments: `$ARGUMENTS`

Only `packages/cli` is published, as `archbook` on npm. `@archbook/schema` and `@archbook/viewer` are private and bundled into it by the build. Publishing cannot be undone (a version number can never be reused), so every irreversible step below needs the user's explicit confirmation in this conversation.

## 1. Pick the version

- Current version: `packages/cli/package.json`.
- An explicit version is used as is. `patch`, `minor` or `major` bump the current one.
- Empty: if the current version is not on npm yet (`npm view archbook@<current> version` fails), publish the current one. Otherwise ask which bump to use.
- Stop if the version is already on npm or the tag `v<version>` already exists (`git tag -l`, `git ls-remote --tags origin`).

## 2. Preconditions

Stop and explain if any of these fails:

- `npm whoami` works. If not, ask the user to run `! npm login` and try again.
- `gh auth status` works.
- On `main`, `git status --porcelain` is empty, and after `git fetch` the branch is neither ahead of nor behind `origin/main`. If it is only ahead, offer `/git:commit-push` first.
- The CI run for that commit passed: `gh run list --commit "$(git rev-parse HEAD)" --workflow ci.yml --event push --limit 1 --json status,conclusion`. If it is still running, wait for it; if it failed or was cancelled, stop. Recheck after step 3, since the bump commit gets its own run.

## 3. Bump

If the version differs from the current one, follow `/release:bump <version>`, then commit with the message `Release <version>` and push, following `/git:commit-push`.

## 4. Verify

1. `/dev:check full`.
2. Smoke test the tarball the way CI does:

   ```sh
   pnpm --filter archbook pack --pack-destination <tmp>/pack
   cd <tmp>/install && npm init -y && npm install <tmp>/pack/archbook-<version>.tgz
   <tmp>/install/node_modules/.bin/archbook --version
   <tmp>/install/node_modules/.bin/archbook validate --cwd <repo>/examples/shop-checkout
   <tmp>/install/node_modules/.bin/archbook build --cwd <repo>/examples/shop-checkout --out <tmp>/site
   ```

3. List the tarball contents (`tar -tzf`) and confirm it has `dist/`, `viewer/`, `plugin/`, `schema/`, `README.md`, `LICENSE`, `package.json`, and nothing else unexpected (sources, tests, `.env`, maps of private code). If `README.md` or `LICENSE` is missing, stop: the npm page would be empty and the package unlicensed. They live at the repo root, so the CLI build has to copy them into `packages/cli/`.
4. `pnpm --filter archbook publish --dry-run` and show the summary.

## 5. Publish

Show the version, the tarball size and file count, and ask for confirmation. Then:

```sh
pnpm --filter archbook publish --access public
```

If npm asks for a one-time password, ask the user for it and retry with `--otp <code>`. Never retry with different flags to get around another error; report it.

Confirm with `npm view archbook@<version> version`.

## 6. Tag and GitHub release

```sh
git tag -a v<version> -m "Release <version>"
git push origin v<version>
gh release create v<version> --title "v<version>" --generate-notes --verify-tag
```

Release notes in English, without any attribution to Claude or any AI tool.

## 7. Report

Version published, npm URL (`https://www.npmjs.com/package/archbook/v/<version>`), release URL, and the install line `npx archbook@<version> init`. If any step after publishing failed, say exactly which ones are left to do.
