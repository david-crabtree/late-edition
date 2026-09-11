# What only you can do

Everything in the rollout plan marked **HUMAN**: accounts, payments, approvals, and the
handful of decisions an agent should not make on your behalf. Nothing here is faked or
half-done — where a step is blocked on one of these, the work stops and says so.

Ordered roughly by what unblocks the most.

---

## Before anything goes public

- [ ] **Create the org and the repository.** `github.com/late-edition/late-edition`, private or public
      as you like — it can start private. The local repo has no remote and nothing has ever
      been pushed. Say the word and I will walk the push with you; it is a different profile
      from the one signed in here, so the credential step is yours.

- [ ] **Decide whether [`HANDOVER.md`](../HANDOVER.md) ships.** It is a working document for
      whoever picks the project up. It reads fine to a stranger, but it talks about you in
      the third person and about the project's own release plumbing, which may not be what
      you want on the front page. `git rm` it or leave it. Nothing depends on it.

- [ ] **Drop the pre-scrub branch before the first push.** `backup/pre-attribution-scrub`
      holds the original commit messages, attribution trailers and all. Commands are in
      [`releasing.md`](releasing.md). Push `main` only — never `--all` or `--mirror`.

- [ ] **A dedicated project email.** Needed for the Code of Conduct and for people to report
      security issues. Not a personal address: it goes in a public file and will be
      scraped. Something like `lateedition.app@…` that forwards to you.

---

## Accounts and money

- [ ] **GitHub Sponsors.** Sign up as an individual and complete the Stripe onboarding. UK
      individuals are supported. The URL is already wired into `package.json` and
      `.github/FUNDING.yml` as `github.com/sponsors/david-crabtree` — **it 404s until the
      account is live**, so check it in a private window before anything is posted. The
      in-app touchpoints (Help item, edition footer, the one-time prompt) are not built yet.
      Tiers the plan suggests: a one-off "buy the newsroom a coffee", a small monthly, a
      larger monthly. Perks stay honest — credits and a Discord role, never a feature.

- [ ] **Ko-fi**, optional, for people without a GitHub account.

- [ ] **Discord server.** The invite `discord.gg/kmr8wqKJJj` is fixed in the copy handoff
      and will go into the README and the app, so it has to resolve. Channels from the plan: announcements, general, help,
      show-your-paper, beats-and-sources, dev, feature-ideas. Create a permanent invite with
      no expiry and no use limit, and a webhook in announcements for release posts. Give me
      the invite and add the webhook to the repo secrets as `DISCORD_RELEASE_WEBHOOK`.

---

## Repository settings, once it exists

- [ ] Description and topics: `electron`, `ai-agents`, `claude-code`, `codex`, `newsroom`,
      `local-first`, `pixel-art`.
- [ ] Enable Discussions with Announcements, Q&A, Ideas, Show and tell.
- [ ] Enable Issues.
- [ ] Branch protection on `main`: require CI to pass.
- [ ] Social preview image, 1280x640, the masthead.
- [ ] Website field: the sponsor URL until a landing page exists.

---

## Decisions still open

- [ ] **The landing page address.** `PROJECT_URL` in `src/main/core/disclaimer.ts` is still
      empty, so every edition says what wrote it but has nowhere to send a reader who found
      the text pasted in somebody's blog. One constant, one line to change.

- [ ] **Windows signing, revisited after launch.** The licence rules out every free
      programme, so v1 ships unsigned with checksums and a README that says plainly what
      SmartScreen will do. If the friction turns out to cost more than it saves, Certum's
      cloud certificate is roughly £45 a year. Confirm they accept a source-available
      licence before paying — their programme is also written for open source.

- [ ] **macOS.** There is no free notarisation route at all. The plan's ad-hoc signing stops
      Apple Silicon reporting the app as damaged, but first launch still needs right-click,
      Open, Open. Worth deciding whether macOS is a v1 target or waits.

---

## Already done, for the record

- [x] **Commit identity scrubbed.** Every commit on every ref was authored as a real
      mailbox, 102 of them on an employer's domain. All rewritten to
      `David Crabtree <97316628+david-crabtree@users.noreply.github.com>`, which accepts no
      mail, and the repo-local identity is pinned so the next commit cannot undo it.
      Verified: one identity across all refs, no unreachable commits, and neither old
      address appears in any file in any commit.

- [x] **Licence chosen and recorded.** Apache 2.0 with the Commons Clause, verbatim from
      the Apache source with only the appendix notice filled in. See
      [`decisions.md`](decisions.md) DR.1 for what it costs.

- [x] **`NOTICE` and `THIRD_PARTY_NOTICES.md`.** Generated from the lockfile by
      `scripts/third-party-notices.mjs`, which fails the build on a licence that cannot be
      redistributed or one it cannot read. All 30 bundled packages are permissive. Both
      files are bundled into the app's resources so the About screen works offline.
