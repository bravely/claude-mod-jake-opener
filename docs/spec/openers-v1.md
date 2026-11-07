# Openers mod: v1 spec

A personal Claude Code mod for the **desktop** Code tab. It draws a band above the prompt holding Openers for the session's worktree and every PR in its Stack, and it decorates PR links in the transcript with Graphite links. Terms follow [`GLOSSARY.md`](../../GLOSSARY.md).

Every decision here comes from a closed ticket on the map [Map: one-press Openers mod for the desktop app](https://github.com/bravely/claude-mod-jake-opener/issues/1). The [Sources](#sources) section links each one. Where this spec and a ticket disagree, the ticket's resolution wins and this file is out of date.

Built against Claude Code 2.1.309 (desktop 4.4212.0) and `gt` 1.8.6.

## Scope

In v1:

- The **Openers band** (`AbovePrompt`): a ladder of the Stack's PRs, rows for Session Rail PRs outside the Stack, and the four built-in Openers.
- The **Stack pane**: the whole Stack as a tree.
- **PR link decoration** on assistant replies.

Not in v1: terminal, VS Code and mobile surfaces (every hook returns `next(e)` there), user-configured Openers, and publishing to a marketplace. The built-in `prUrlTemplate` and `footerLinksRegexes` settings don't reach the desktop and play no part.

## Install and layout

The mod is the `mod/` folder of this repo. It loads through `CLAUDE_CODE_PLUGIN_DIRS`, set in the `env` block of `~/.claude/settings.json` to the absolute path of `mod/` in the main checkout, so sessions the desktop app starts load it. Set `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` beside it while developing, so saves hot-reload.

```
mod/
  .claude-plugin/plugin.json   name "jake-opener", "types": "./types/index.d.ts"
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           wires hooks to the modules below; no logic of its own
  hooks/pr.ts                  parse a GitHub PR URL; build GitHub and Graphite URLs; the two icon Svgs
  hooks/snapshot.ts            gather a Snapshot from git, gt, gt's cache, ccd_pr and gh (all I/O)
  hooks/stack.ts               pure: build the Stack tree, fork picks, ladder rows, edge cases
  hooks/refresh.ts             tiers, triggers, debounce, latest-wins, staleness
  hooks/openers.ts             the Opener type, the four built-ins, open by Target kind
  hooks/editor.ts              resolve and launch the editor command
  hooks/commands.ts            the band's gt commands: run, running state, toasts, agent context
  hooks/band.tsx               the AbovePrompt ladder
  hooks/pane.tsx               the Stack pane
  hooks/decorate.tsx           the AssistantMessage hook
  hooks/*.test.ts(x)           claude plugin test
  types/index.d.ts             PluginState contract
```

`stack.ts`, `openers.ts` (resolve only), `pr.ts` and the text rewrite in `decorate.tsx` are pure and tested with fixtures. Only `snapshot.ts`, `editor.ts` and `commands.ts` call `$.process` or `$.mcp`.

### State (`types/index.d.ts`, under `jake-opener`)

| Key | Holds | Why in `$.state` |
|---|---|---|
| `snapshot` | the last Snapshot | a reload draws at once, then refreshes |
| `forkPicks` | `{ [forkBranch]: pickedChild }` | each fork remembers its pick |
| `paneOpen` | boolean | see [The Stack pane](#the-stack-pane) |
| `reportedErrors` | the distinct `gh` error last submitted as a turn | one turn per distinct error |
| `bandRuns` | band commands not yet reported to the agent | attached to the next prompt |
| `running` | the command running now, and its row | "running…" and disabled links |
| `editorCommand` | the resolved editor argv | the `$SHELL -ic` read costs ~0.7 s |

## The Snapshot

One Snapshot per refresh, gathered asynchronously by `snapshot.ts`. Openers and the band read only the Snapshot.

| Field | Source |
|---|---|
| `cwd` | the session's cwd |
| `topLevel` | `git rev-parse --show-toplevel` (in a linked worktree, that worktree's own root) |
| `branch`, `commonDir`, `gitDir` | `git rev-parse --abbrev-ref HEAD --git-common-dir --git-dir`; `HEAD` means detached |
| `head` | `git rev-parse --short HEAD`, for the detached row |
| `rebase` | the branch named in `<git-dir>/rebase-merge/head-name` or `<git-dir>/rebase-apply/head-name`, when present |
| `gtState` | `gt state --no-interactive` (hidden command, JSON: each tracked branch's parent, `trunk: true`, `needs_restack`) |
| `gtInitialised` | `<common-dir>/.graphite_repo_config` exists and `gt state` exits 0 |
| `gtInstalled` | `gt` resolves on `PATH` |
| `trunk` | the `trunk: true` branch; when gt isn't initialised, `origin/HEAD` |
| `trunkWorktree` | the worktree with trunk checked out, from `git worktree list --porcelain`; may be absent |
| `prCache` | `<common-dir>/.graphite_pr_info`, keyed by `headRefName`: `prNumber`, `state`, `isDraft`, `url` (already the Graphite link); and its mtime |
| `rail` | `$.mcp.call("ccd_pr", "get_status", {})`, `JSON.parse` of its text block: `pr` (`number, url, repo, title, state, draft, head, …`) and `otherBoundPrs` (`number, repo, state` only) |
| `ghPrs` | from the network tier: `gh pr list --state all --json number,url,state,isDraft,headRefName` and `gh pr view` titles |

**PR state per PR**, first that knows it: `gh` from this session, then `ccd_pr`, then gt's cache. States are open, draft, merged, closed, or none (no PR).

**The Stack** (`stack.ts`): walk parents from `branch` to trunk; invert the edges for children. A branch with several children is a **fork**.

**Graphite link**: `https://app.graphite.com/github/pr/<owner>/<repo>/<n>`. **GitHub PR URL**: `https://github.com/<owner>/<repo>/pull/<n>`. `pr.ts` builds both from `owner/repo/n`. `otherBoundPrs` URLs are rebuilt from `repo` + `number`.

## Openers

```ts
type Target = { kind: 'url'; url: string } | { kind: 'directory'; path: string }
type Opener = {
  id: string
  label: string                      // used in toasts and accessibility, not drawn
  scope: 'session' | 'pr'
  resolve(snapshot: Snapshot, pr?: Pr): Target | undefined
}
```

An Opener is shown exactly when `resolve` returns a Target. A PR-scoped Opener is applied to each PR row; it is one Opener, not one per PR. The band and pane choose the glyphs.

| Opener | Scope | Target | Drawn as |
|---|---|---|---|
| Worktree editor | session | Directory: `topLevel` (or `cwd` outside a repo) | `‹/›` on the current row |
| Trunk editor | session | Directory: `trunkWorktree` | `‹/›` on the `┴ main` row |
| Graphite | PR | URL: the Graphite link | Graphite icon + PR number, every PR row in the band and pane |
| GitHub | PR | URL: the GitHub PR URL | pane only |

**Trunk editor with no trunk worktree** still draws its `‹/›`; clicking toasts that no worktree has trunk checked out.

### Opening, by Target kind

- **URL**: a `<Link href>`. The desktop opens it in the default browser. No `$` call.
- **Directory**: `editor.ts`. Take `$.env.get("VISUAL") ?? $.env.get("EDITOR")`. When both are unset (the desktop builds the engine's env without `~/.zshrc`), run `$SHELL -ic 'printf %s "${VISUAL:-$EDITOR}"'` once and cache it in `$.state.editorCommand`. Split it to argv, drop `--wait` and `-w`, append the path, and fire `void $.process.run(argv)` without awaiting. Never `$.process.spawn` (it kills the child when its loop ends). For this user that is `code-insiders <dir>`, which exits 0 in about 1.1 s.
- A failed open toasts with the Opener's label: `Couldn't open Trunk editor: code-insiders exited 1`. A successful open is silent.

The desktop's own open-in-editor isn't used: the `ccd_host` MCP tool opens files only, and the session menu prefers stable VS Code over Insiders.

## The band

A `ui.render` hook on `{ component: 'AbovePrompt' }`, desktop only. It draws a ladder with no header row. The desktop owns the band's frame, height (`maxRows`) and scroll bar; the mod draws only inside it, and the band scrolls when the ladder is taller.

### Rows

Top to bottom:

1. **Rail rows**: Session Rail PRs that aren't in the Stack, from any repo, deduplicated by URL (by `repo` + `number` for `otherBoundPrs`). Each has the state circle, Graphite icon and link, and title (`repo#n` until `gh pr view` answers). No `⑂`, `‹/›` or `↻ restack`. A thin rule separates them from the ladder. A Stack PR that is also bound gets no marker.
2. **The ladder**: one row per branch from the top of the picked path down to the current branch and on to trunk, top of the Stack first (as `gt log` orders it), with a small gap between rows. Every row is shown; nothing folds into "n more".
3. **The trunk row** at the foot: `┴ main`, dim.

### A ladder row

```
<left column> <circle> <Graphite icon><#n link> <title> [· <aside or problem>] [<command link>]
```

- **Left column**, 4 cells wide, one link at most: `⑂ i/n` on a row reached through a fork, `‹/›` (Worktree editor) on the current row, `‹/›` (Trunk editor) on the trunk row. The current row is always on the path, so it never needs `⑂`.
- **Circle** shows PR state: `●` open (green), `◯` draft (grey), `✓` merged, `✕` closed (red), `◌` no PR (dim).
- **Graphite icon**: Simple Icons' Graphite mark (CC0), filled `#9aa0a6`, a 14 px `Svg` in a gapless `Box` beside a `<Link>` whose text is the PR number and whose href is the Graphite link. Only the number is clickable.
- **No PR**: `no PR` and the branch name, no icon.
- **`↻ restack`** follows the title when gt marks the branch `needs_restack`. It is a command link (see [Commands](#commands)).
- **The current row** is bold with a background (`promptBorder`). With a problem on it, the background is soft red (`diffRemovedDimmed`) instead.
- **Problems** are red, **asides** dim italic, both inline after the title as `· <text>`.

### Forks

The ladder lists every branch above the current one, one fork branch at a time. A row reached through a fork carries `⑂ i/n` left of its circle. Clicking swaps that row and everything above it for the fork's next child, and records the pick in `forkPicks`. Picks default to the first child.

### The trunk row

`‹/› ┴ main`, dim, `main` being the trunk's name. `◨ Stack (n)` follows on the same row whenever the ladder hides branches (a fork's unpicked children), `n` being the Stack's branch count. It toggles the pane: `◧` while open, `◨` while closed.

### Links the mod answers itself

`⑂`, `‹/›`, `◨ Stack (n)`, `fix it` and every command link are `Markdown` links on a placeholder `https://<name>.invalid/…` href with `pressableLinks`, answered in `onLinkPress`, so they never open a page. Native `Button`s are not used: on desktop a Button is about two rows tall and stretches its row. A `Markdown` link can't be coloured, so `↻ restack` isn't yellow.

### Edge cases

| # | Situation | Signal | Band |
|---|---|---|---|
| 1 | On trunk | `branch` is gt's `trunk: true` | one highlighted row: `‹/› ┴ main(trunk) · gt create to start a Stack`; `main` bold, `(trunk)` dim and in the same `Text` (so the row gap doesn't split them), hint dim italic |
| 2 | Branch gt doesn't track | `branch` absent from `gtState` | drawn like any branch: PR row with Graphite link when a PR is found, `◌` otherwise; then dim `· not tracked` and a **gt track** link; trunk row below |
| 3 | Detached HEAD | `branch` is `HEAD` and no `rebase` | `‹/› ◌ detached at <sha>`, **no trunk row** |
| 4 | Rebase stopped on a conflict | `branch` is `HEAD` and `rebase` names a branch | the normal ladder for that branch; current row soft red, red `· rebase stopped on a conflict`, and a **fix it** link that `$.prompt.fill`s a request to resolve the conflict (unsent) |
| 5 | gt not initialised | `gt state` exits non-zero, or no `.graphite_repo_config` | the current branch with its PR from `gh`, then `‹/› ┴ main · gt not initialised here` (red, no highlight) and a **gt init** link; trunk from `origin/HEAD` |
| 5b | gt not installed | `gt` not on `PATH` | as 5, reading `gt not installed`, no link |
| 6 | Not a git repo | `git rev-parse --show-toplevel` fails | one row: `‹/›` and the session folder |
| 7 | Merged PR in the Stack, not synced | state merged on a branch still in `gtState` | `✓` row stays, title dim and struck through, with a **gt sync** link; `↻ restack` on rows gt marks |
| 8 | Closed PR in the Stack | state closed | `✕` row, title dim and struck through, no link |
| 9 | PR unknown to gt's cache | branch not in `.graphite_pr_info` | dim `PR …` while `gh` answers; `no PR` if none. If `gh` fails: red `PR ?` with the error inline, and the band submits one turn (`$.prompt.submit`) with the error, once per distinct error; a changed or cleared error resets it |
| 10 | gt's cache missing or stale | no `.graphite_pr_info`, or mtime older than 10 min | no age shown anywhere; the network tier refreshes states (see [Refresh](#refresh)) |

## Commands

The band's command links run `gt` in `topLevel` with `--no-interactive`, through `$.process.run`, awaited.

| Link | Where | argv | On success (exit 0) | On failure |
|---|---|---|---|---|
| **gt track** | case 2 | `gt track --parent <trunk> --no-interactive` | stdout `Tracked branch <b> with parent <trunk> …`; local refresh | exit 1, e.g. `ERROR: Could not find branch <x>.` |
| **↻ restack** | rows gt marks | `gt restack --no-interactive` | local refresh | a conflict exits 1 with the report on **stdout** (`Hit conflict restacking <b> on <parent>.`) and leaves `<git-dir>/rebase-merge/` and `<git-dir>/.gtcontinue`; toast `restack stopped on a conflict`; the band lands in case 4 |
| **gt sync** | case 7 | `gt sync --no-interactive` (no `-d`) | local + network refresh | exit 1 when GitHub can't be reached (`ERROR: Graphite encountered a 404 …`), repo untouched |
| **gt init** | case 5 | `gt init --trunk <trunk> --no-interactive` | writes `.graphite_repo_config`; local refresh | exit 1 |

**The merged-row link is `gt sync --no-interactive` without `-d`.** Clicking it fast-forwards trunk and restacks what can be restacked cleanly, but it neither deletes the merged branch nor moves its children onto trunk, so **the merged row and the rows above it stay in place** after the click. `-d` would remove the row, but it deletes every merged or closed branch in the repo, not just this Stack, and moves HEAD to trunk when the current branch is the merged one. Pruning stays the dev's call.

Other facts the band relies on:

- `gt sync` exits 0 even when part of the Stack couldn't be restacked (stderr `WARNING: <b> could not be restacked cleanly.`) or a branch was skipped as never submitted. The next refresh shows the `↻ restack` markers; the band doesn't parse the warnings.
- While a rebase is stopped, `gt restack` and `gt sync` exit 1 with `ERROR: This operation is blocked during a rebase.`
- The band offers no abort. If it ever does, it must be `gt abort --force --no-interactive`; without `--force` it exits 1.

**Failure toast**: read stdout and stderr together; the summary is the first line starting `ERROR:` or `Hit conflict`, else the last non-empty line. Toast `<link label> failed: <summary>`.

**While a command runs**: its row shows a dim `running…`; every band link is disabled; clicks don't queue.

**The agent hears what the band ran.** Each finished command is added to `bandRuns`. A `prompt.submit` hook attaches them as `context` on the user's next prompt (`The Openers band ran \`<argv>\` in <dir>: exit <code>. <summary>`) and clears them. Without this the agent can't see repo changes `$.process.run` made.

## The Stack pane

`$.ui.open({ id: 'jake-opener-stack', title: 'Stack' })`, drawn by a `ui.render` hook on `{ component: 'Pane', requestId }`. It shows the whole Stack, every fork branch included, as an indented tree from trunk. Each row has the state circle, the branch title, a GitHub link (GitHub Opener) and the Graphite icon and link (Graphite Opener).

Open/closed state: read `$.ui.panes()`, reset `paneOpen` on `ui.close`, and set it false when the toggle closes the pane itself (the `ui.close` hook alone left it stale).

## Refresh

Two tiers build the one Snapshot.

- **Local**: `git rev-parse`, `gt state`, read `.graphite_pr_info`, `ccd_pr` `get_status`. No network.
- **Network**: `gh pr list --state all --json number,url,state,isDraft,headRefName` over the Stack's and rail's branches, plus `gh pr view` for each rail PR title not yet known (once per URL).

Triggers are debounced 250 ms. One refresh runs at a time with at most one queued; the latest result wins. A `$.process.run` can't be cancelled, so a superseded refresh's result is dropped rather than aborted. The Snapshot is kept in `$.state`, so a reload draws the last one at once.

| Trigger | Tier |
|---|---|
| Bash `tool.call`, after `await next(e)`, whose command text runs `git`, `gt` or `gh` | local |
| … whose `result.gitOperation.pr.action` is created, merged or closed | local + network |
| `turn.complete` | local |
| `session.attach` (the desktop joins and draws the band) | local + network |
| `classic.SessionStart` (startup, resume, `/clear`, compact, fork) | local + network |
| `classic.FileChanged` from a `watchPaths` answer on `classic.SessionStart`: `<git-dir>/HEAD`, `<common-dir>/refs/heads`, `<common-dir>/.graphite_metadata.db`, `<common-dir>/.graphite_pr_info` | local |
| `$.clock.every` backstop: 60 s (15 s if the file watch doesn't arm) | local |
| `session.receive` with `source: 'github'` | local + network |
| a band command exits | local; + network after `gt sync` |

**Staleness**: a local refresh starts a network refresh when `.graphite_pr_info` is older than 10 min, at most once every 2 min. Triggers marked "+ network" bypass both limits.

**Failures**: a failed staleness refresh is silent; the band keeps its states and retries next window. A failed gap-fill lookup follows edge case 9.

`session.start` calls `$.ui.invalidate('ui.render')`, so the band redraws after a hot reload without waiting for input.

## PR link decoration

A `ui.render` hook on `{ component: 'AssistantMessage' }`, desktop only. It skips `isSummary` blocks. It is a pure function of `props.text`, so streaming re-renders are harmless, and a half-streamed link doesn't match until it is complete.

A **PR link** is `https://github.com/<owner>/<repo>/pull/<n>`, optionally followed by a path such as `/files`.

**Inline**: rewrite `props.text` and pass it to `next`.

- After each PR link, add ` [⬡ Graphite](<Graphite link>)`. `⬡` stands in for the mark, since an `Svg` can't go into the text.
- A markdown link to a PR keeps its label. A bare or `<autolinked>` PR URL first becomes `[<repo>#<n>](<url>)`.
- Lines inside code fences are left alone.

**Strip**: wrap `next(e)` in a column `Box` and add one wrapping row under it holding every PR the block mentions, deduplicated, in order of first mention. Per PR: GitHub icon (Octicons `mark-github`, MIT), `#n` as a `<Link>` to the PR, Graphite icon, `↗` as a `<Link>` to the Graphite link. PRs are separated by a dim `·`. Both icons are 14 px `Svg`s filled `#9aa0a6`. A block with no PR link gets no strip.

Element keys must be unique across the hook's whole tree, not just among siblings; a repeated key skips the hook. Key strip elements by PR URL.

Decoration shares only `pr.ts` with the Openers. It uses neither the Opener type nor Targets.

## Platform limits (desktop, 2.1.309)

- The rail can't be drawn in or changed; the mod only reads it through `ccd_pr`, whose answer is the app's cache and may be stale.
- An `Svg` can't sit inside a `Link`, and `Markdown` images don't draw, so an icon is never part of a click target.
- `Markdown` is a leaf: nothing can be placed inside a reply's rendered paragraph.
- A `Button` holds only text and `Text` and is about two rows tall.
- No focus, cwd-change or user-terminal events exist. A `gt` run in the user's own terminal is picked up by the file watch or the timer.
- `$.process.run` takes argv only (no shell), times out after 30 s by default, and returns at most 4 MiB per stream.
- `gt state` and `.graphite_pr_info` are undocumented gt internals and may change with gt versions. The cache can be about an hour stale; gt only learns a PR merged if it cached that PR while open.

## First-build checks

Verify these on the first build, before relying on them:

1. **The file watch arms.** Answer `watchPaths` from `classic.SessionStart` and confirm `classic.FileChanged` fires after `git switch` in the user's own terminal. If it doesn't, set the backstop timer to 15 s and drop the watch.
2. **`ccd_pr` is reachable from the shipped mod.** It answered from a throwaway dev-mods mod (server name `ccd_pr`, no prompt, ~14 ms). Confirm the same call works from `mod/` loaded through `CLAUDE_CODE_PLUGIN_DIRS`. If it doesn't, rail rows drop out and the ladder still draws.
3. **`CLAUDE_CODE_PLUGIN_DIRS` loads the mod in desktop sessions** and `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` hot-reloads it.
4. **`gt` and `gh` resolve on the desktop's `PATH`.** The desktop builds the engine's env without `~/.zshrc`, which already hid `EDITOR`. If either doesn't resolve, read `PATH` through `$SHELL -ic` once, as `editor.ts` does, and run the commands with it.
5. **The types still match.** Decisions were checked on 2.1.309; grep the current build's `claude-code.d.ts` for each hook and prop named here before building.

## Sources

Decisions:

- [Do built-in settings already cover Graphite links or opening the editor?](https://github.com/bravely/claude-mod-jake-opener/issues/9)
- [How do we resolve the Stack and its Graphite links?](https://github.com/bravely/claude-mod-jake-opener/issues/5)
- [Can a mod decorate PR links in the transcript?](https://github.com/bravely/claude-mod-jake-opener/issues/2)
- [How does a mod open a Target on the desktop?](https://github.com/bravely/claude-mod-jake-opener/issues/4)
- [Can a mod read, draw in, or change the Session Rail?](https://github.com/bravely/claude-mod-jake-opener/issues/3)
- [How should the Openers band look?](https://github.com/bravely/claude-mod-jake-opener/issues/6)
- [How should PR link decoration look?](https://github.com/bravely/claude-mod-jake-opener/issues/7)
- [What is the shape of an Opener?](https://github.com/bravely/claude-mod-jake-opener/issues/8)
- [What should the band show with no Stack, or a broken one?](https://github.com/bravely/claude-mod-jake-opener/issues/11)
- [How do the band's gt commands behave with --no-interactive?](https://github.com/bravely/claude-mod-jake-opener/issues/13)
- [Which refresh triggers does the mod API offer on desktop?](https://github.com/bravely/claude-mod-jake-opener/issues/15)
- [Can the band read this session's PRs from ccd_pr?](https://github.com/bravely/claude-mod-jake-opener/issues/14)
- [When does the band recompute, and how stale may it get?](https://github.com/bravely/claude-mod-jake-opener/issues/16)

Prototypes (throwaway, never merged), the primary reference for markup:

- [`prototype/openers-band`](https://github.com/bravely/claude-mod-jake-opener/tree/prototype/openers-band): `prototype/openers-band/` (the ladder) and `prototype/openers-band-edges/` (the edge cases, commit 8a2cab4).
- [`prototype/pr-link-decoration`](https://github.com/bravely/claude-mod-jake-opener/tree/prototype/pr-link-decoration): variant C. Its variants pane is scaffolding, not part of the mod.
