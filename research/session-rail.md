# Can a mod read, draw in, or change the Session Rail?

Resolves #3 (map: #1). Researched 2026-11-01 against Claude Code 2.1.309, desktop surface.

**Sources.** All "confirmed" claims quote this build's mod API type file
(`plugin-authoring/types/claude-code.d.ts`, 22,559 lines, written by the
`plugin-authoring` skill for 2.1.309) or its `reference.md`. Claims about the
desktop's PR tools come from the `ccd_pr` MCP tool descriptions the desktop app
serves to this session, plus one live `get_status` call. Line numbers refer to
that type file.

## Answer

1. **Read: not through the mod API.** The API has no noun, method or event for
   the Session Rail, a session's bound PRs, or a bind/merge/close. The desktop
   app does hold that data and exposes it as the `ccd_pr` MCP server
   (`get_status`). A mod *may* be able to reach it with `$.mcp.call`, but that is
   unverified (see "Inferred"). Notifications exist only indirectly: a
   `tool.call` hook sees `gh pr create`/`gh pr merge` results, and
   `session.receive` sees GitHub relay events for subscribed PRs.
2. **Draw: neither.** The Session Rail is not a render site. A mod cannot alter
   its PR elements (no Graphite link inside it) and cannot add elements of its
   own there. The nearest places a mod can draw are the `AbovePrompt` band and a
   `Pane`, which matches the map's settled decision.

## Confirmed in the types

### No Session Rail render site

The full list of components a `ui.render` hook can draw into or rewrite (line 9835):

```ts
export type RenderComponent = 'AskUserQuestion' | 'UserMessage' | 'AssistantMessage' | 'ToolUse' | 'ToolResult' | 'ToolGroup' | 'ToolProgress' | 'CommandOutput' | 'Spinner' | 'TurnDuration' | 'InfoNotice' | 'SessionMode' | 'PromptHint' | 'AbovePrompt' | 'Pane';
```

No PR bar, rail or side-panel component. The desktop's element table (line 3951)
only lists primitives a mod builds its own trees from (`Box`, `Text`, `Button`,
`Input`, `Select`, `Svg`, `Link`, `Code`, `Markdown`, `Client`), not app chrome.

`AbovePrompt` is "The band directly above the prompt input ... Raised on the
terminal and desktop surfaces only" (line ~10810). `Pane` is "Placed by the
surface (docked in fullscreen, else above the prompt) ... Raised on every
attached surface". Neither is the rail.

### No escape hatch into the desktop page

`reference.md` line 23: "The module runs in an environment of its own, with no
DOM and no Node". The `Client` element (a mod's own surface module) draws only
its own region from `ClientElements`, the terminal element table minus
`Client`/`Raster`/`Image` (line ~1445). It never gets the host page, so it cannot
reach into the rail either.

### No PR / rail state or event

The `$` nouns are `plugin, ui, model, audio, mcp, session, turn, prompt, tool,
command, config, telemetry, agent, fs, store, state, clock, http, process,
settings, env`. The full event list contains no `pr.*`, `rail.*` or bind event
(`session.*` events: `append, attach, authorize, compact, cwd, detach, end, id,
identity, measure, messages, model, receive, repo, root, send, start, surface,
surfaces, turns, usage, version`). The grep hits for "rail" (lines 18366–21028)
are a field of the Artifact tool's watch result (`rail: "durable_wake"`), not the
Session Rail.

The nearest session data is `$.session.repo()` (line 2863), which answers
`SessionRepo`: `root`, `remote` ("The `origin` remote's URL as git has it"),
`internal`, `name`. No branch, no PR.

### Substitute signal 1: the Bash tool's `gitOperation.pr`

A `tool.call` hook that does `await next(e)` on `Bash` gets the tool's record as
`result` ("from core the tool's record, typed per built-in tool once `e.tool`
and `isError` are narrowed", line ~13583). That record carries (line ~21487):

```ts
/** Structured classification of git/gh operations detected in this command (commit/push/merge/rebase/PR). Client-facing — lets clients render git activity without re-parsing stdout; not surfaced to the model. */
gitOperation?: {
  ...
  pr?: {
    number: number
    url?: string
    action: "created" | "edited" | "merged" | "commented" | "closed" | "reopened" | "ready" | "draft" | "auto-merge-enabled" | "auto-merge-disabled"
  }
}
```

So a mod is told, already parsed, whenever Claude's own `gh` command creates,
merges or closes a PR in this session. It does not see PRs created outside a
Bash call (a human in another terminal, the GitHub UI).

### Substitute signal 2: `session.receive` GitHub wakes

`SessionReceiveInput.event` is "The external-event wake the text parsed as
(`source` `github` for a subscribed pull request's event)" (line ~11983), with
`kind` such as `pull_request.closed` and a body like
`{ pr: "acme/app#12", outcome: "merged" }` (line ~11940). This fires only for a
delivery the server relays into the session (a subscribed PR), so it depends on
the desktop's monitor or a webhook subscription being on.

### Substitute signal 3: watch the desktop's own PR tools

`tool.call` matches MCP tools by wire name (line 6160:
`on("tool.call", { tool: "mcp__gh__issue" }, ...)`), so a mod can observe the
model calling `mcp__ccd_pr__bind_pr` / `unbind_pr` and read the URL from the
input. This covers binds the model makes, not binds the app makes on its own.

### Running `gh` / `gt` directly

`$.process.run(argv, init?)` (line 3604) lets the mod run `gh pr list --head
<branch> --json number,url,state` or `gt` itself. This is the cheap,
fully-in-the-mod way to get "this session's PRs", independent of the rail.

## What the desktop app holds (from its `ccd_pr` tools)

The Session Rail's data is the desktop app's, served to the model as the
`ccd_pr` MCP server. `get_status` description: "Read the pull request bound to a
Code session in this app (default "self") and its CI monitor: PR
number/url/state/branches, CI check counts and failing check names, review
decision, mergeability ... Served from the app's cache."

A live `get_status` call from this session (no PR bound) returned:

```json
{ "bound": false,
  "message": "No pull request is bound to this session. The app binds one when this session runs `gh pr create`, reports the PR URL in a `<pr-created>` tag, or pushes a branch that has an open PR (or gets one later); to bind an existing PR, call bind_pr with its URL.",
  "monitor": { "auto_archive_on_close": true } }
```

That message is the app's own statement of when the rail picks up a PR: `gh pr
create`, a `<pr-created>` tag, or a push of a branch with an open PR. The tool
descriptions speak of "the pull request" (singular) per session, so the rail may
hold one primary PR rather than a list; untested with several bound.

## Inferred, not confirmed

- **`$.mcp.call("ccd_pr", "get_status")` from a mod.** `$.mcp.call` "Calls
  `tool` on one of the engine's connected MCP servers with the engine's own
  connection" (line ~2752), keyed by the name "/mcp lists it under". Whether the
  desktop's `ccd_pr` server counts as one of the engine's connected servers for
  a plugin (it is likely an SDK-host server, `source: "sdk"`), and under what
  name, is not stated. If it works, it is the only way to read the rail's
  actual contents, but it is a poll, not a notification. Needs a one-file
  prototype: a mod that calls it from a slash command and logs the result.
- **Desktop-initiated binds are invisible.** When the app binds a PR because a
  pushed branch has one, no mod event fires (no event exists for it). A mod
  would notice only by polling (`get_status` or `gh`) on `turn.complete` or a
  `$.clock.every` timer.

## Recommended source of "this session's PRs"

For the Openers band (#1), do not depend on the rail:

1. **Primary:** `$.process.run(["gh", "pr", "list", "--head", <branch>, ...])`
   plus `gt` for the Stack, recomputed on `session.start`, `turn.complete` and
   when signal 1 fires.
2. **Event trigger:** a `tool.call` hook on `Bash` reading
   `result.gitOperation.pr` (and `gitOperation.push` / `branch`) to refresh
   immediately on create/merge/close, plus `session.receive` with
   `event.source === "github"` for merges that happen outside the session.
3. **Rail dedup, optional:** if the `$.mcp.call` prototype succeeds, merge
   `ccd_pr.get_status`'s URL into the set, deduplicated by URL. If not, the rail's
   PR is in practice the same PR `gh pr list --head <branch>` returns, because
   the app binds the open PR of the pushed branch.
