# Contributing to Late Edition

Thanks for helping build the newsroom. This project is licensed under the Apache
License 2.0 with the Commons Clause, and welcomes contributions of code, art, personas,
source adapters and provider adapters.

> By submitting a contribution you confirm that you wrote it or have the right to submit
> it, and you agree that it is licensed under the same terms as the project (Apache 2.0
> with the Commons Clause), with David Crabtree as licensor.

## Ground rules (the non-negotiables)

These come from the build plan and every change is judged against them:

1. **Local first.** The app never talks to a server we operate.
2. **Bring your own agent.** We don't store the user's provider credentials when a CLI
   owns the auth.
3. **Every artefact is a plain file** — Markdown, JSON, YAML on disk.
4. **Provider neutral.** No provider is privileged in the architecture.
5. **The paper must be better than the six tabs it replaces.**
6. **No paid dependencies**, no required SaaS in the build chain.
7. **Free to use, and nobody sells it.** Apache 2.0 with the Commons Clause: use it
   anywhere including at work, change it, share it. Selling it, hosting it for a fee or
   building a paid product on it is out.

## Getting set up

```bash
git clone <your fork>
cd late-edition
npm install
npm run check   # typecheck + lint + tests
```

- **Language:** TypeScript, ESM, `strict` mode.
- **Lint & format:** [Biome](https://biomejs.dev). `npm run lint:fix` before committing.
- **Tests:** [Vitest](https://vitest.dev). `npm test`.
- **Run the CLI in dev:** `npm run cli -- <command>`.

## Adding a source adapter

A source adapter is a single file in `src/main/adapters/` that turns some external thing
into `Signal`s. Copy an existing adapter (e.g. `rss.ts`) as a template, implement the
`SourceAdapter` interface from `src/main/adapters/types.ts`, register it in
`src/main/adapters/registry.ts`, and add a test. Adapters are **read-only** and must never
mutate their source. See `docs/adding-a-source-adapter.md`.

## Adding an agent provider

A provider is a single file in `src/main/providers/` implementing the `AgentProvider`
interface from `src/main/providers/types.ts`. Never store provider credentials when a CLI
owns the auth. **Verify every CLI flag against the installed tool** and fail with a clear
message if a provider's CLI has changed — do not invent flags. See
`docs/adding-a-provider.md`.

## Commits & PRs

- Small, focused commits. Conventional-ish subject lines are appreciated
  (`feat: add ics adapter`).
- Every PR should keep `npm run check` green.
- Record notable design choices — including things you tried that didn't work — in
  `docs/decisions.md`.

## Code of conduct

Be decent. Assume good faith. This is a newsroom, not a comment section.
