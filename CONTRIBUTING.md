# Contributing to Beeblio

Thanks for helping improve Beeblio. Please open an issue before starting a large change so the approach can be discussed.

## Local development

Follow the setup in [README.md](README.md). Use Node.js 24 and pnpm 11, then run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm build:eve
```

Do not commit `.env.local`, `.beeblio/`, linked project files, generated builds, or API credentials. Update the README and `.env.example` when changing setup or configuration. Explain behavior changes and how you checked them in pull requests.

## Reporting problems

For bugs and feature requests, open a GitHub issue with steps to reproduce and the expected behavior. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of posting details publicly.
