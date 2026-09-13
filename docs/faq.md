# Questions people actually ask

## Money and licence

### Can I use this at work?

Yes. Use it anywhere, for anything, including commercially. No licence key, no seat count,
no "contact us for enterprise".

Using it to do your job is not distributing it. Neither is putting it on every machine in
your company.

### Can I sell it, or host it for other people?

You can try, and the licence will make it pointless. It is the GNU Affero General Public
License: anyone you give a copy to, or let use over a network, is entitled to the complete
source of exactly what you gave them, under the same terms. So whatever you sell, your
customer can download for free the next day. And it cannot be called Late Edition or use
the characters, because those are trademarks that the licence does not grant. Rebrand it,
publish your source, and sell that if you can find a buyer.

### Is it open source?

Yes. AGPL-3.0 is an OSI-approved licence. It was Apache 2.0 with the Commons Clause until
13 September 2026, which was source-available rather than open source, and the switch is
recorded in [`decisions.md`](decisions.md).

### What does it cost to run?

Nothing beyond the AI subscription you already have. Late Edition drives the agent CLI
already installed on your machine, so an edition draws on your existing Claude or ChatGPT
plan allowance rather than a new bill. If you point it at a metered API key instead, that
key is billed per use and we can neither see nor cap it.

A realistic edition on a subscription runs to a few hundred thousand tokens, most of it
cache reads, which are roughly a tenth the price of fresh ones. The app shows you the split
as it goes.

### Will there be a paid tier?

No. Nothing is gated and nothing will be. Sponsoring it buys goodwill and a name in the
credits, and that is all it will ever buy.

## Installing

### Why isn't it signed? Windows is shouting at me.

Because it is new. Windows builds are unsigned until a certificate is in place; the
[code signing policy](../README.md#code-signing-policy) says how that will work. Until then,
Windows shows a blue "Windows protected your PC" panel. Click **More info**, then **Run
anyway**. On Windows 11, Smart App Control may block it outright rather than warn, in which
case building from source is the way round it.

Every release publishes `SHA256SUMS.txt`. Since nothing is signed, that checksum is the only
way to tell a real download from a tampered one.

### macOS won't open it — "Apple cannot check it for malicious software".

Expected. The builds are ad-hoc signed, which stops Apple Silicon refusing outright, but
they are not notarised. Notarisation needs a paid Apple developer account and this is a
free project.

One line in Terminal clears it for good:

```
xattr -cr "/Applications/Late Edition.app"
```

That removes the quarantine flag your browser attached to the download, so Gatekeeper stops
checking it. Point it at wherever the app is if it is not in Applications yet.

Without a terminal: try to open the app, then go to System Settings → Privacy & Security,
scroll to Security, and click **Open Anyway** on the line about Late Edition. That button
only appears for about an hour after the refusal.

**Control-clicking and choosing Open does not work any more.** Apple removed that bypass in
macOS Sequoia, and most instructions you will find online still tell you to do it.

**Building it yourself avoids all of this.** The Gatekeeper prompt comes from a quarantine
flag your browser attaches to downloads, so an app built on your own machine just opens.

### Do I need Node, or a terminal?

Not to use the app. It is an installer or a single portable executable.

You do need at least one AI agent installed and signed in, and installing those does involve
a terminal. The Setup panel inside Late Edition will open the download page for you and open
a terminal already sitting at the command, so you can get through it without knowing what a
terminal is.

## Privacy and data

### Does it phone home?

**No.** There is no server, no account, no analytics and no telemetry of any kind. Nothing
about you or what you write is sent anywhere.

It makes exactly one network request on its own behalf: asking GitHub whether a newer
version exists. That sends nothing identifying — no account, no machine id, no usage — and
`updates.enabled: false` in the app config turns it off, including the check.

Everything else goes where you pointed it: the sources you configured, and the AI provider
you already signed into.

### Where does my data live?

In a folder you chose. Editions, reports, config and history are Markdown, JSON and YAML on
your disk. You can open them, grep them, back them up and commit them. There is no database.

### Do you see my API keys?

No, and the app will not hold one. Agents like Claude Code own their own login, and Late
Edition never sees it. The direct-API route reads a key from an environment variable that
the app never sets, never reads back and never stores.

## Using it

### Is any of it true?

**Treat every edition as an unchecked draft.** No reporter wrote it and no editor read it.
It can be wrong and it can invent things, including sources that look real.

What the app does do is make that checkable. Agents cite by writing a source's literal id;
only real ones become footnotes and invented markers are scrubbed. The copy desk verifies
each claim against a cited source and cuts what it can't stand up, into a Corrections
column. A story cannot cite a source the researcher never found.

That gets you a paper whose claims are all traceable. It does not get you a paper whose
claims are all true. Follow the links.

### Why did a desk stop the run instead of writing something?

Because nobody is on it. A fresh newsroom has no agents wired to any desk, and an empty desk
halts the edition and names itself rather than quietly filling the paper with invented copy.
Open Setup and put an agent on it.

### What is the offline stand-in?

A dry run. It writes a complete newspaper without contacting any model, so you can watch the
machinery work for nothing. **Every word of it is invented** and the edition says so. It is
hidden in Setup unless you deliberately ask for it.

### Which agent should I use?

Claude Code, if you have it. It is the only one confirmed end to end, and it can browse,
which the research desk wants.

**It needs a Claude Pro, Max, Team or Console account.** The free Claude.ai plan does not
include Claude Code, so signing in on the website is not enough on its own.

### I clicked install and it just opened a web page.

Most of these agents install from a command rather than a download, and Claude Code is one
of them. On macOS or Linux:

```
curl -fsSL https://claude.ai/install.sh | bash
```

The Setup panel gives you the right command for your machine and a button that opens a
terminal sitting at it. Signing in to claude.ai in a browser does nothing for the CLI —
it keeps its own login.

The others are written and wired identically and have simply never been run against a live
install. "Untested" here is about our evidence, not missing code. If you get one working it
should work. If it doesn't, that is a bug worth reporting.

### Can I use different models for different desks?

Yes, and you should. Research is by far the hungriest desk and wants a cheap model; the
editor sets the whole paper's judgement and wants a strong one. Set them separately in
Setup, leave the model box blank to take an agent's own default, and the box will tell you
what shape of model name that agent expects.

### It writes like a machine.

Pick a different paper. "Write it as" next to the brief offers eleven, and the choice
reaches the reporter and the editor as well as the writer, so what the desk leads on changes
and not just the wording. If you want something you can paste somewhere, the LinkedIn,
Reddit, blog and newsletter outlets render as that thing rather than as a newspaper about it.

If it still reads wrong, the house voice lives in `newsroom/style.md` and every desk follows
whatever you put there.

### Can I change the reporters?

Partly, today. `newsroom/staff/` holds a persona per reporter — a bio and a voice, folded
into that reporter's own prompt — and a fresh newsroom ships one, Sam Vance. Add more files
and name them on a beat.

The other faces on the floor are in the interface but do not yet have persona files of their
own.

## Contributing and bugs

### An agent changed its command line and now it's broken.

That is the most likely bug in this whole project and it is treated as a release blocker.
Open an issue and say which agent and which version.

### Can I add a source, or an agent?

Yes, and it is meant to take a single file. See `docs/adding-a-source-adapter.md` and
`docs/adding-a-provider.md`.

### Is there a roadmap?

Not really, and it would be dishonest to pretend otherwise. This is one person's project,
built because it was interesting. It works, it is free, and it will get attention when it
gets attention.
