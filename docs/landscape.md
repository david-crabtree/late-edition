# What else is out there

Searched on GitHub, 11 September 2026, via the search API sorted by stars. Star counts are
from that day and will drift. **Anything named in a launch post must be re-checked then** —
a tool that was abandoned in March may have been picked up again, and saying otherwise in
public is the kind of error people remember.

The point of this is not to pick a fight with anybody. It is to know which claims are
distinctive enough to be worth making, and which are table stakes.

---

## Four neighbourhoods, and none of them is quite this

### 1. Daily AI digest scripts — crowded, and nobody has traction

A dozen repositories called some arrangement of "ai newsletter agent". The busiest has two
stars. Almost all are Python, almost all read Gmail and email you a summary, and most have
not been touched in months.

| Repo | Stars | What it does |
| --- | --- | --- |
| `nickzren/ai-news-agent` | 2 | Daily AI news digest by email, 25+ sources |
| `erenYe0ger/agentic-ai-newsletter-service` | 1 | Collects AI blog posts, summarises, ranks, emails |
| `The-Natalie/Newsletter-Digest-Agent` | 0 | Reads a mail folder, merges duplicates, summarises |
| `Misty033/ai_newsletter_agent` | 0 | Local LLMs, scrapes and filters, HTML digest |

**What this tells you.** The want is real enough that a dozen people built one for
themselves. Nobody has built one other people use. Every one of them is a script you
configure in code and a summary that arrives as text. None has a face, none enforces
anything about sourcing, and none of them is something you would show somebody.

### 2. Multi-agent frameworks — enormous, and for developers

| Repo | Stars | What it produces |
| --- | --- | --- |
| `TauricResearch/TradingAgents` | 104k | Trades |
| `FoundationAgents/MetaGPT` | 70k | Software |
| `OpenBMB/ChatDev` | 34k | Software |
| `openai/openai-agents-python` | 29k | A library |

These are libraries you build with, and what comes out is code or decisions, not something a
person reads for pleasure. Late Edition is not competing with them and should not be
described as if it were. If anything they are the proof that orchestrating several agents
with distinct jobs is an idea people take seriously.

### 3. Agent simulations — the aesthetic neighbours

| Repo | Stars | Note |
| --- | --- | --- |
| `joonspk-research/generative_agents` | 22k | The Stanford paper's code. Last pushed August 2024. |
| `a16z-infra/ai-town` | 10.5k | MIT starter kit for your own AI town. Actively maintained. |
| `101dotxyz/GPTeam` | 1.7k | Open-source multi-agent simulation |

**This is the most useful data point in the whole search.** AI Town has ten thousand stars
for a simulation of characters wandering around talking to each other, and it produces
nothing you can use. People will look at agents-with-personalities-on-a-floor for its own
sake. The newsroom being pretty is not decoration, it is the reason anyone will click.

The difference is that at the end of a Late Edition run there is a paper.

### 4. Desktop apps wrapping AI CLIs — closest, and tiny

| Repo | Stars | What it is |
| --- | --- | --- |
| `GeronimoDiClemente/raven-nest` | 32 | Multi-agent terminal for Claude Code, Codex, Gemini. Electron. |
| `wisnuwiry/padu` | 9 | Native app for orchestrating Claude Code, Codex, Cursor CLI |
| `Wintersta7e/agentdeck` | 4 | Managing coding agents in WSL, split terminals |
| `thewolffish/wolffish-app` | 5 | Local-first markdown personal AI desktop app |

Every one of these is **a nicer terminal for coding agents**. Same insight as Late Edition —
people already have these CLIs installed and paid for — and a completely different
destination. None of them makes an artefact.

---

## Where that leaves the pitch

Four claims that survive contact with the above. Each one is checkable in the code.

1. **It uses the subscription you already pay for.** Every digest tool in neighbourhood 1
   wants an API key and bills you per run. Late Edition drives the Claude Code or Codex CLI
   you have already installed and signed into, so the marginal cost of an edition is
   whatever your plan already covers. This is the strongest differentiator and the least
   obvious one.
2. **Every claim cites a source or it gets cut.** The copy desk verifies each statement
   resolves to a real signal id; invented markers are scrubbed by the renderer. Nothing in
   neighbourhood 1 enforces anything. In a category whose whole failure mode is confident
   summaries of things nobody checked, this is the substance.
3. **It is something to look at.** Neighbourhood 3 proves that earns attention on its own.
   Late Edition is the only one where the pretty thing is also doing the work.
4. **Everything is a plain file.** Markdown, JSON and YAML in a folder you can open, grep and
   commit. No database, no server, no account.

### What not to claim

- Do not call it the first or the only anything. A dozen people built a version of
  neighbourhood 1, and somebody will link them under the post.
- Do not position against the big frameworks. Different job, and it reads as punching up at
  something that is not in the ring.
- Do not describe the cast as writing in eight voices. See `app-facts.md`.

---

## Where the people are

The Claude Code ecosystem is the obvious first audience: they have the CLI, they are paying
for it, and they are already installing things that sit on top of it.

| Repo | Stars | Why it matters |
| --- | --- | --- |
| `wshobson/agents` | 39.5k | Agentic plugin marketplace for Claude Code, Codex, Cursor, OpenCode |
| `Yeachan-Heo/oh-my-claudecode` | 39k | Multi-agent orchestration for Claude Code |

Both are enormous and active. Whatever those communities read is where this belongs first,
which matches the rollout plan's ordering: the provider communities before Reddit, and
Reddit before Hacker News.
