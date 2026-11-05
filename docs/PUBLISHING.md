# Publishing

The project is a publishable npm package. Publishing remains an explicit maintainer action; creating the project, building it and producing a tarball do not publish anything.

## Prepare the source repository

The npm name is `n8n-nodes-socket-trigger`, initially at version `0.1.0`. The registry returned no package by that name during project creation; availability and ownership must be checked again before publication. npm can also reserve or reject an apparently unused name.

See [Package name check](NAME-CHECK.md) for the three evaluated candidates, related community packages and final node/credential identifiers.

The author metadata was taken from the local Git configuration. Review it before making it public. If you change the package name, also update the node identifier in the codex JSON, examples, README, homepage and verification script.

The public source repository is [code-chat-br/n8n-nodes-socket-trigger](https://github.com/code-chat-br/n8n-nodes-socket-trigger). Its repository and issue-tracker URLs are already configured in `package.json`:

```sh
npm pkg set "repository.type=git" "repository.url=git+https://github.com/code-chat-br/n8n-nodes-socket-trigger.git"
npm pkg set "bugs.url=https://github.com/code-chat-br/n8n-nodes-socket-trigger/issues"
```

Commit the source, lockfile and GitHub workflow files. Do not commit `dist`, `node_modules`, tarballs or credentials.

## Validate locally

```sh
npm ci --ignore-scripts
npm run check
npm run format:check
npm pack --dry-run
npm pack
```

`prepublishOnly` runs lint, build, tests and package verification before an npm publish. `prepack` builds the distributable for `npm pack`. The package's file allowlist includes `dist`, documentation, examples, README, changelog, license and npm metadata. Source tests and development tools do not ship.

Install the `.tgz` into a disposable self-hosted n8n instance. Import the example workflow, set the API URL and credential, receive an event in manual mode and production mode, then deactivate the workflow. Confirm the two theme icons, binary output, restart behavior and your deployment's connection/concurrency limits. The automated tests do not substitute for this deployment acceptance check.

## GitHub Actions publication

`.github/workflows/publish.yml` runs manually with **Actions → Publish npm package → Run workflow**. It validates the package and uses `npm publish --provenance --access public`. The default authentication mode is npm Trusted Publishing (OIDC). The workflow derives repository metadata from the actual GitHub repository at release time; it does not invent a repository URL in the local package.

For an existing npm package, configure its **Trusted Publisher** with your actual GitHub owner/repository and workflow filename **publish.yml**. Leave the environment field empty because this workflow does not declare a GitHub environment. Run the workflow with authentication mode **oidc**. The release job uses GitHub-hosted Ubuntu, Node 24, npm 12.2.2, `id-token: write` and no npm token.

For a first release, if npm does not yet allow configuring a trusted publisher for this package, add a restricted npm granular write token as the repository Actions secret **NPM_TOKEN**, and select authentication mode **token** for the bootstrap publication. Keep the repository public so npm can generate provenance. After the first publication, configure OIDC and use **oidc** for future releases. Never put a token in the repository or a workflow input.

If your npm account enforces a publishing policy that rejects token bootstrap, use the account's supported interactive/bootstrap flow. A local interactive `npm login` and `npm publish --access public` can establish an unverified package, but does not provide GitHub Actions provenance. The included release workflow is the preferred provenance-bearing path.

For each later release, update `CHANGELOG.md`, change the version (`npm version patch --no-git-tag-version`, or `minor`/`major`), commit the source and lockfile, and dispatch the workflow. npm rejects republishing an existing version. The workflow intentionally does not change the version, create tags or create GitHub releases automatically.

## n8n verification

This project is an **unverified self-hosted community package**. Passing its lint and tests is not an n8n certification. A generic multi-server WebSocket connector may not meet n8n's current service-specific verification criteria. Bundling a third-party library also does not establish eligibility under n8n's external-dependency policy. Do not advertise n8n Cloud availability without separate approval.

References:

- [Official n8n node CLI](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool.md)
- [n8n community-node verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements)
