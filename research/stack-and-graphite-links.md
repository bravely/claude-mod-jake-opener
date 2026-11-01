# Resolving the Stack and its Graphite links

Research for issue #5. Checked against `gt` 1.8.6 and `gh` 2.97.0 on 2026-11-01. The live examples come from `bravely/demarest_mays`, run in the worktree `.claude/worktrees/wellness-productivity-tracker-9f69a5`. That worktree's branch `283-…` sits at the top of a six-branch Stack (PRs #295, #297, #298, #300, #301, #302). Only read-only commands were run.

## Answer

1. **Stack.** `gt` has no documented JSON output. It does have a hidden command, `gt state`, which prints the whole tracked branch graph as JSON on stdout. The graph is local and needs no network. It gives each branch's parent and a `needs_restack` flag, but it has no PR data and does not say which branch is current. Get the current branch with `git branch --show-current`. For PR numbers, read `gt`'s own PR cache at `<git-common-dir>/.graphite_pr_info`, a JSON file keyed by `headRefName` whose `url` field is already the Graphite link. If the cache is missing a branch, fall back to `gh pr list --json`. So the cheapest route is **`gt state` + `git branch --show-current` + one read of `.graphite_pr_info`**, all local. Use `gh` only as a fallback, or if you want fresher state than the cache holds.
2. **Graphite link.** `https://app.graphite.com/github/pr/<owner>/<repo>/<number>`. It needs nothing beyond owner, repo and PR number. Use `app.graphite.com`, not `app.graphite.dev`.

## 1. Getting the Stack

### What `gt` offers (confirmed)

| Command | Output | Use for the mod |
|---|---|---|
| `gt state` | JSON on stdout: `{ "<branch>": { "trunk": bool, "needs_restack": bool, "parents": [{ "ref", "sha" }] } }`. Warnings (for example "branch has diverged") go to **stderr**, so stdout parses cleanly. About 0.7 to 0.9 s. | **Best.** Machine-readable graph of every tracked branch. |
| `gt log short --stack` | Text. One branch per line, top of the Stack first, trunk last. The current branch is marked `◉` and the others `◯`. `--reverse` flips the order. | Fallback only, because it is text you would have to scrape. |
| `gt log --stack` | Text. Like `short`, plus `(current)`, `PR #302 (…) title`, the Graphite URL, and commits. | Not machine-readable. It does show that `gt` holds the PR URL. |
| `gt info [branch]` | Text: branch, PR #, Graphite URL, `Parent: …`. One branch per call. | Too many calls. |
| `gt parent` / `gt children` | Text: one branch name. | Too many calls. |
| `gt pr [--stack]` | Opens a browser. | Not usable. |

Sources:
- `gt --help`, `gt --help --all` (lists `parent`, `children`, `info` and `log` under BRANCH INFO; `state` is not listed), `gt log --help`, `gt state --help` ("Display information about the state of the repo."), `gt info --help`, `gt pr --help`.
- [Graphite CLI command reference](https://graphite.com/docs/command-reference) and [cheatsheet](https://graphite.com/docs/cheatsheet). Neither documents any JSON flag or `gt state`.

**Confirmed:** `gt state` exists in 1.8.6 and prints JSON. It is **undocumented**: it is absent from `gt --help --all` and from the docs site, so it could change without notice. That is the main risk of depending on it.

**Confirmed:** `gt state` does not include untracked branches, and it does not say which branch is current. On an untracked branch (one not created or tracked by `gt`), `gt log --stack` fails with `ERROR: Cannot perform this operation on untracked branch <name>`, and the branch is absent from `gt state`. The mod should treat that as "not in a Stack".

**Confirmed:** `gt` works from inside a linked git worktree, using the shared metadata in the common `.git` dir. Claude Code sessions typically run in one.

### Building the Stack from `gt state`

`parents` is an array, but every branch in the sample had exactly one parent. `gt state` lists no children, so invert the parent edges to get them.

1. `current = git branch --show-current`. If it is empty (detached HEAD) or absent from the `gt state` keys, there is no Stack.
2. Walk down: follow `parents[0].ref` from `current` until you reach a branch with `trunk: true`. Reverse that path to get bottom → current, without the trunk.
3. Walk up: from `current`, follow children. If a branch has several children, the Stack forks. `gt log --stack` shows every descendant, so decide whether to show one line or the whole subtree. That is a design choice for the mod, not a data limit.

Sample from `bravely/demarest_mays`:

```json
"279-give-each-worktree-its-own-dev-and-verify-ports": {
  "trunk": false, "needs_restack": false,
  "parents": [{ "ref": "278-give-each-worktree-its-own-dev-and-test-databases-and-session-cookie",
                "sha": "cfd07b1…" }]
}
```

### Where `gt` keeps its data locally (confirmed by inspection, undocumented)

In `$(git rev-parse --git-common-dir)` (for example `/Users/bravely/dev/demarest_mays/.git`):

- `.graphite_repo_config`: JSON with `trunk`, `trunks`, `lastFetchedPRInfoMs`.
- `.graphite_metadata.db`: SQLite, table `branch_metadata(branch_name, parent_branch_name, parent_branch_revision, children (JSON array), last_submitted_version, …)`. It holds the same graph as `gt state`, plus `children`. Reading it would need `sqlite3`, and the schema is private. Older `gt` versions kept this in `refs/branch-metadata/*`. That ref namespace is empty here.
- `.graphite_pr_info`: JSON `{ "prInfos": [ … ], "mergeabilityStatuses": … }`. Each PR entry has `prNumber`, `title`, `state` (`OPEN`/`MERGED`/`CLOSED`), `isDraft`, `headRefName`, `baseRefName`, `url` and `versions`. In every entry, **`url` is the Graphite link**, for example `https://app.graphite.com/github/pr/bravely/demarest_mays/302`.

**Inferred, observed once:** `gt` refreshes `.graphite_pr_info` from Graphite's API on its own, throttled to about once an hour. `lastFetchedPRInfoMs` moved from `1793534570994` to `1793538187754` (about 60 min later) while only read-only `gt log`/`gt state`/`gt info` calls were made, and the file's mtime changed at the same time. So the cache can be up to about an hour stale on PR state (merged or closed), and it only holds PRs Graphite knows about. Branch → PR-number mappings rarely change once a PR exists, so the cache suits the band. Use `gh` when PR state needs to be fresh.

### Mapping branches to PRs with `gh` (confirmed)

`gh pr list --state all --json number,url,headRefName,baseRefName,state,isDraft --limit 100` takes about 0.5 s and needs the network. It returns one array covering every PR, so a single call covers the whole Stack. `-H/--head <branch>` filters to one branch, though `gh pr list --help` notes that "`<owner>:<branch>` syntax not supported". `url` here is the **GitHub** URL (`https://github.com/bravely/demarest_mays/pull/302`). Use `number` to build the Graphite link. `gh repo view --json nameWithOwner` gives `owner/repo`. Source: `gh pr list --help`, `gh repo view --json`.

### Recommended recipe for `$.process.run` (one-shot, no shell, 30 s)

1. `["git", "rev-parse", "--abbrev-ref", "HEAD", "--git-common-dir"]` returns the current branch and the metadata dir in one process. `--show-current` prints nothing on a detached HEAD, whereas `--abbrev-ref` prints `HEAD`.
2. `["gt", "state", "--no-interactive"]` returns the graph JSON. Parse stdout and ignore stderr. A non-zero exit or a missing binary means "`gt` missing or repo not initialised". The repo is uninitialised when `<common-dir>/.graphite_repo_config` is absent.
3. Read `<common-dir>/.graphite_pr_info` and index `prInfos` by `headRefName` to get number, state, draft flag and Graphite `url`. If the mod API has no file read, run `["cat", path]`.
4. Only for Stack branches missing from the cache: one `["gh", "pr", "list", "--state", "all", "--json", "number,url,headRefName,state,isDraft", "--limit", "200"]`, then build the Graphite link from `number`.

The cost is two subprocesses, about 1 s in total, dominated by `gt` (a Node shim, `bin/gt.js`, which `execFileSync`s an 87 MB native binary), plus one file read, with no network on the happy path.

## 2. Graphite link format

**Confirmed:** `https://app.graphite.com/github/pr/<owner>/<repo>/<number>`

- The Graphite docs page [Create PRs for a stack](https://graphite.com/docs/create-submit-prs) shows `gt submit` printing `https://app.graphite.com/github/pr/withgraphite/pranathi-test-repo/100` (and `/101`, `/102`).
- `gt` 1.8.6 itself stores and prints this exact form: the `url` in `.graphite_pr_info`, and the URL line in `gt log`/`gt info` output (`https://app.graphite.com/github/pr/bravely/demarest_mays/302`).
- `gt --help` points auth at `https://app.graphite.com/settings/cli`, so `.com` is the current host.

**Confirmed:** nothing else is needed. No Graphite org ID, Stack ID or PR title slug appears in the URL. Owner and repo are the GitHub owner login and repo name, as in `gh repo view --json nameWithOwner`.

**Observed, not documented:** `https://app.graphite.dev/github/pr/bravely/demarest_mays/302` also answers HTTP 200. The app is single-page, so that does not prove it renders the PR. Use `.com`, which is what the docs and the CLI emit.

**Inferred:** the URL in `.graphite_pr_info` comes from Graphite's API rather than a template in the CLI. A string search of the native binary found no `app.graphite.*` literal, likely because the binary is compressed or bundled. Either way, building the link from owner/repo/number gives the same string as `gt`'s own `url` field, which was checked for all 16 cached PRs.

## Open points for the spec

- `gt state` is hidden. If it disappears in a later `gt`, the fallback is to scrape `gt log short --stack` (`◉`/`◯` markers, top-first) or to read `.graphite_metadata.db`.
- A fork in the Stack (a branch with several children): decide whether the band shows one line or the subtree.
- Freshness of merged or closed PRs relies on `gt`'s roughly hourly cache refresh unless the mod calls `gh`. This feeds the Refresh question in the map (#1).
