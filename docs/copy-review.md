# Check these before anything is posted

Every claim in the shipped copy that a person should verify rather than take from me. Short
on purpose: if everything were flagged, nothing would be.

Sorted by what would be most embarrassing to get wrong.

---

## Things that are not true yet

| Where | Claim | Why it needs you |
| --- | --- | --- |
| `README.md` Download table | macOS `.dmg`, Linux AppImage and `.deb` | **Neither has ever been built.** The release workflow produces them on tag. Do not publish the README before a release exists with those files in it. |
| `README.md`, `docs/faq.md` | The macOS right-click and `xattr` instructions | Written from how unsigned apps behave, not from opening one. You have a Mac — do it once and correct this if it is wrong. |
| `README.md` badges | Release, downloads, Discord, Sponsor | All four **404 until the repo, the server and the Sponsors account exist.** A README full of broken badges is the first thing anyone sees. |
| `README.md`, `llms.txt` | Repository and Discussions links | The `late-edition` org does not exist yet. |
| `README.md`, `docs/faq.md` | Windows SmartScreen and Smart App Control behaviour | Taken from Microsoft's documented behaviour, not from a clean Windows 11 machine downloading our actual file. Worth one test before launch. |

## Things that are true on one machine

| Where | Claim | Why it needs you |
| --- | --- | --- |
| `README.md` agent table | Claude Code "proven end to end" | True, on your machine, on your plan, with Claude Code 2.1.251. Nobody else has run it. |
| `README.md`, `docs/faq.md` | The other five agents are "written, not yet confirmed live" | Correct as stated. If anyone confirms one works, update the table rather than leaving it modest. |
| `docs/faq.md` | "a few hundred thousand tokens, most of it cache reads" | Measured from real editions on your Claude plan. Another provider, or a much larger brief, will differ. |

## Deviations from the rollout plan

| Where | What changed | Why |
| --- | --- | --- |
| `README.md` Privacy, the app's first-run screen, the About panel | The privacy statement has **one clause added**, naming GitHub and the update check | The plan fixes this wording as unchanged, but update checks make it literally false as written. A promise sitting next to a contradiction of itself is worth less than no promise. **Overrule this if you would rather drop update checks and keep the wording.** |
| The app | **No donation line in rendered editions** | The plan asks for "Published with the support of readers like you" in the masthead footer of every edition. I have not added it. Editions get pasted into other people's blogs and posts, and a solicitation travelling into somebody else's writing is a different thing from one in an app they chose to install. The About panel has the link, and the switch removes it. Your call. |
| The app | **No tenth-edition prompt** | Dropped, decided 11 Sep 2026. The plan's Phase 5.3 asks the Chief to mention sponsorship once, after ten editions. It only works if the line lands, and a fundraising ask wearing a costume is worse than no line. Not building it. |
| `docs/launch/` | Not written | You are handling Discord, LinkedIn and the launch posts. |

## Facts with a shelf life

| Where | Claim | Checked |
| --- | --- | --- |
| `docs/landscape.md` | Every star count and "last pushed" date | 11 Sep 2026. **Re-check anything you name in a post** — a tool that looked abandoned in March may be active again, and saying otherwise in public is the kind of error people remember. |
| `docs/releasing.md`, `docs/faq.md` | SignPath requires an OSI-approved licence | 11 Sep 2026, from their own terms. |
| `docs/releasing.md` | Certum around £45 a year | From their pricing page, Sep 2026. Confirm they accept a source-available licence before paying — their programme is also written for open source. |
| `README.md` | Provider install URLs | The documented download pages. The non-interactive command-line flags behind them are only verified for Claude Code. |

## Things I could not check at all

- **Whether the Discord invite works.** Open it in a private window.
- **Whether the Sponsors page exists.** Same.
- **Whether anyone but you can install this and get an edition out of it.** The one thing
  that matters most and the only one that needs a stranger. Worth finding one before the
  launch posts go out, not after.
