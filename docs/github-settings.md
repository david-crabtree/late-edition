# GitHub settings, to paste

Everything the repository and org pages ask for, written to be copied straight in. Every
claim here is from [`app-facts.md`](app-facts.md). Nothing describes a feature that does not
exist yet.

---

## Repository description

GitHub caps this at 350 characters. The short one is the one to use; the longer variants are
there if the field turns out to have more room than the page suggests.

**Use this (118 characters):**

```
A newsroom on your desktop that turns the AI agents you already pay for into a daily paper. Local-first, no accounts.
```

Alternatives:

```
Brief a newsroom of AI agents and get back a paper you can read. Runs on your own agent subscriptions. Nothing leaves your machine.
```

```
A pixel-art newsroom that runs on your own AI agents. Every claim cites a source or it gets cut. Local-first, no servers, no accounts.
```

---

## Topics

Paste one at a time. The first seven are from the rollout plan; the rest are accurate and
widen the reach.

```
electron
ai-agents
claude-code
codex
newsroom
local-first
pixel-art
typescript
desktop-app
rss
ollama
byo-agent
```

---

## Website field

Until a landing page exists, the rollout plan says to use the sponsor URL:

```
https://github.com/sponsors/david-crabtree
```

**Check it resolves in a private window first.** It 404s until the Sponsors account is live.

---

## Discussions

Enable, with these categories:

| Category | Format | Purpose |
| --- | --- | --- |
| Announcements | Announcement | Releases and anything that changes how it works. |
| Q&A | Question | Answerable problems. The searchable half of the Discord help channel. |
| Ideas | Open-ended | Feature requests before they are issues. |
| Show and tell | Open-ended | Papers people have made. Pin a thread here on day one. |

---

## Issues

Enable. Templates live in `.github/ISSUE_TEMPLATE/` and are not written yet — the rollout
plan asks for `bug.yml`, `feature.yml` and `provider-broken.yml`, that last one because a
provider changing its command-line flags will be the most common report by a distance.

---

## Branch protection on `main`

- Require a pull request before merging: **off** for now. You are the only committer and it
  would only slow you down.
- Require status checks to pass: **on**, and require the `check` job from `ci.yml`. That job
  runs typecheck, lint, the interface parse guard, the third-party notices check and 151
  tests.
- Require branches to be up to date before merging: on.

---

## Social preview image

1280x640. The masthead on the newsroom background is the obvious one. Not yet produced.

---

## Secrets

| Name | For | Status |
| --- | --- | --- |
| `DISCORD_RELEASE_WEBHOOK` | Posting to `#announcements` on a published release | Needed once the Discord server exists. The workflow that would use it is not written yet. |

`GITHUB_TOKEN` is provided by Actions automatically. Nothing else is needed: there is no
signing certificate, no notarisation credential and no publish token beyond that.

---

## Before you make the repository public

- [ ] `backup/pre-attribution-scrub` is not pushed. Push `main` only.
- [ ] The sponsor URL resolves.
- [ ] The Discord invite resolves in a private window.
- [x] HANDOVER.md removed from the tree.
- [ ] The two planning documents in the repo root are agent briefs, not documentation.
      `notes/` is gitignored if you want them kept alongside the project.
