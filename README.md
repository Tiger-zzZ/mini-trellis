<h1 align="center">
  <a href="https://mini-trellis.github.io/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Tiger-zzZ/mini-trellis/main/docs/assets/wordmark-dark.svg" />
      <img src="https://raw.githubusercontent.com/Tiger-zzZ/mini-trellis/main/docs/assets/wordmark-light.svg" alt="mini-trellis" width="460" />
    </picture>
  </a>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/v/mini-trellis?style=flat-square&amp;logo=npm&amp;logoColor=white&amp;labelColor=173f35&amp;color=28785e" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/dm/mini-trellis?style=flat-square&amp;logo=npm&amp;logoColor=white&amp;label=downloads&amp;labelColor=173f35&amp;color=28785e" alt="npm downloads per month" /></a>
  <a href="https://mini-trellis.github.io/"><img src="https://img.shields.io/badge/docs-website-28785e?style=flat-square&amp;logo=readthedocs&amp;logoColor=white&amp;labelColor=173f35" alt="Documentation website" /></a>
  <a href="https://github.com/Tiger-zzZ/mini-trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-64766f?style=flat-square&amp;labelColor=173f35" alt="AGPL-3.0 license" /></a>
</p>

<p align="center"><strong>Project knowledge, ready for the next session.</strong></p>

<p align="center">Keep conventions, research, and development notes in project Markdown.<br/>Find the source in your docs and local agent conversations, and update it as the code evolves.</p>

<p align="center">
  <a href="https://mini-trellis.github.io/docs/">Documentation</a> ·
  <a href="https://mini-trellis.github.io/install/">Quick start</a> ·
  <a href="https://mini-trellis.github.io/agents/">Supported agents</a> ·
  <a href="https://mini-trellis.github.io/faq/">FAQ</a> ·
  <a href="https://github.com/Tiger-zzZ/mini-trellis/blob/main/README_CN.md">简体中文</a>
</p>

## Carry the useful parts forward

| Capability | How you use it |
| --- | --- |
| **Keep project knowledge** | Maintain conventions and conclusions in existing README, docs, spec, and research files; link the session from a journal. |
| **Find the source** | `mem recall` searches documents and supported local conversations, returning excerpts, paths, and references. |
| **Organize past discussions** | `session-insight` turns selected conversations or text exports into existing project documents. |
| **Update decisions** | Edit the current topic, retain the reasoning, and link old notes to their replacements. |
| **Work across agents** | Different coding tools use the same project Markdown; the platform matrix lists native history support. |

![How project conventions, research, and verification records are reused in later sessions](https://raw.githubusercontent.com/Tiger-zzZ/mini-trellis/main/docs/assets/knowledge-en.svg)

## Quick start

Requires Node.js ≥ 18.17, Python ≥ 3.9, and Git. In the project root:

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
mini-trellis doctor
```

Open a new agent session and save a confirmed decision:

```text
Callbacks must carry an idempotency key; repeated callbacks return the
first result. Update the existing spec, then use mini-trellis-remember
to record a link to that topic.
```

Find the rule in a later session. Copy the returned `ref` to expand it:

```bash
mini-trellis mem recall "callback idempotency"
mini-trellis mem read "<ref-from-recall>"
```

The [installation guide](https://mini-trellis.github.io/install/) covers requirements, trust settings, and verifying your first use.

## Supported agents

Claude Code · Codex · Cursor · OpenCode V1/V2 · Pi · OMP · Kiro · DeepSeek Harness · CodeBuddy · ZCode

Combine init flags, such as `--claude --codex`. Native transcript readers support Claude Code, Codex, OpenCode V1, and Pi. See [Agent setup](https://mini-trellis.github.io/agents/) for the knowledge entry, recording command, and setup steps for each tool.

## Documentation

| What you want to do | Guide |
| --- | --- |
| Find and record decisions during development | [Day-to-day use](https://mini-trellis.github.io/using/) |
| Organize existing conversations | [History](https://mini-trellis.github.io/history/) |
| Write conventions, research, and journals | [Writing knowledge](https://mini-trellis.github.io/writing-notes/) |
| Look up options and project settings | [Commands and skills](https://mini-trellis.github.io/commands/) · [Configuration](https://mini-trellis.github.io/configuration/) |
| Move from Trellis or maintain an installation | [Migration](https://mini-trellis.github.io/migration/) · [Upgrades](https://mini-trellis.github.io/upgrade/) |
| Diagnose installation or search issues | [Troubleshooting](https://mini-trellis.github.io/troubleshooting/) |

The complete guides are also available in the repository's [docs](https://github.com/Tiger-zzZ/mini-trellis/blob/main/docs/index.md).

## Frequently asked questions

**How does this work with AGENTS.md / CLAUDE.md?** Keep those files as project entry points and maintain detailed knowledge in the existing documents. mini-trellis provides recording skills and unified retrieval.

**What should I save explicitly?** Decisions, investigations, and fixes that will help a later change. Routine edits follow your own development process.

**Where does the data live?** The CLI reads local document and conversation files. Project knowledge can be shared through Git; an agent may send retrieved text to its configured model provider.

[Read the full FAQ](https://mini-trellis.github.io/faq/).

## Measured results

In the published Claude Code comparison, mini-trellis v0.3.1 versus Trellis v0.7.0-beta.4 across six task groups with three runs each used **38.4% less total wall time** and **40.1% fewer processed tokens**. These are historical measurements for the tested versions and configuration. Processed tokens include cache reads and are not a direct measure of cost.

See [Benchmarks](https://mini-trellis.github.io/benchmarks/) for the environment, per-task results, and separate injected-character experiment.

## Contributing and license

Share feedback through [Issues](https://github.com/Tiger-zzZ/mini-trellis/issues), or follow the [contribution guide](https://github.com/Tiger-zzZ/mini-trellis/blob/main/CONTRIBUTING.md).

Licensed under [AGPL-3.0](https://github.com/Tiger-zzZ/mini-trellis/blob/main/LICENSE).

## Star History

[![Star History](https://img.shields.io/badge/Star_History-view_chart-28785e?style=for-the-badge&logo=github&logoColor=white&labelColor=173f35)](https://www.star-history.com/?repos=Tiger-zzZ%2Fmini-trellis&type=date&legend=top-left)

[Explore the star history](https://www.star-history.com/?repos=Tiger-zzZ%2Fmini-trellis&type=date&legend=top-left)
