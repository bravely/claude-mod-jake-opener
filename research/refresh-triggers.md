# Which refresh triggers does the mod API offer on desktop?

Resolves #15. Researched 2026-11-01 against Claude Code 2.1.309.

**Sources.** `T` = this build's mod API type file,
`plugin-authoring/types/claude-code.d.ts` (22,559 lines, written by the
`plugin-authoring` skill for 2.1.309). `R` = that skill's `reference.md`
(268 lines). Line numbers refer to those files. Nothing was run in a live
desktop session; no mod was loaded.

**Confidence marks.**

- **confirmed-in-types**: the declaration or its doc comment in `T` says it.
- **documented**: `R` says it, `T` does not.
- **inferred**: follows from the above but no source states it outright.

## Answer in one table

| Trigger | Payload gist | Fires on desktop? | Confidence |
| --- | --- | --- | --- |
| `tool.call` on Bash, `await next(e)` | `result.gitOperation` `{ commit?, push?, branch?, pr? }`; `pr` is `{ number, url?, action }` | yes | types (shape); inferred (desktop) |
| `classic.PostToolUse` / `classic.PostToolBatch` | the classic hook stdin; batch fires once per tool batch | yes | types; inferred (desktop) |
| `turn.complete` | `{ answer, durationMs, isAborted, turnId, agentId?, usage?, reason }` | yes | types; inferred (desktop) |
| `turn.start` | the turn's prompt, `agentId?` | yes | types; inferred (desktop) |
| `session.measure` | `{ changed }`, after each main-thread turn and on rate-limit moves | yes | types; inferred (desktop) |
| `session.receive` GitHub wake | `{ origin, text, event?: { source: 'github', kind: 'pull_request.closed' …, data } }` | yes, for subscribed PRs | types; inferred (desktop) |
| `session.start` | `{ cwd, surface, isInteractive }`, no source | yes, once per load | types; inferred (desktop values) |
| `classic.SessionStart` | `source: 'startup' \| 'resume' \| 'clear' \| 'compact' \| 'fork'`; may answer `watchPaths` | yes | types; inferred (desktop) |
| `session.attach` / `session.detach` | `{ surface, clientId, viewport? }` when a remote client (the desktop app) joins or leaves | yes | types |
| `classic.CwdChanged` | `{ old_cwd, new_cwd }` | unknown | types (shape); unknown (when desktop raises it) |
| `classic.WorktreeCreate` / `classic.WorktreeRemove` | `{ name }` / `{ worktree_path }` | unknown | types (shape) |
| `classic.FileChanged` | `{ file_path, event: 'change' \| 'add' \| 'unlink' }` for paths a `SessionStart` answer put in `watchPaths` | likely yes | types (shape and `watchPaths`); inferred (that a module's `watchPaths` arms the watch) |
| `$.clock.every` / `$.clock.after` | a timer; `fn` runs each period | yes | types; inferred (desktop) |
| `$.fs` watch | none: `$.fs` has read/write/list/exists/stat/ancestors only | n/a | types (absence) |
| Window focus / visibility | none | n/a | types (absence) |
| User `!` shell command | no field or event names one | unknown | types (absence of evidence) |
| `ui.render` re-run of `AbovePrompt` | re-runs on a `$.state` write it read, `$.ui.invalidate`, width change, view switch | yes | types + documented |

## Confirmed in the types

### `tool.call` and `result.gitOperation`

`'tool.call'` is in the event map (`T` 4082). A hook that does
`const r = await next(e)` gets `ToolCallResult` (`T` 13565): `result` is
`ToolResultOf<Name>` (`T` 13590, 13988), which for `Bash` resolves to
`BuiltinToolResults.Bash` (`T` 17803, 21444). That record carries
`gitOperation` (`T` 21487–21506):

```ts
/** Structured classification of git/gh operations detected in this command (commit/push/merge/rebase/PR). Client-facing ... not surfaced to the model. */
gitOperation?: {
  commit?: { sha: string; kind: "committed" | "amended" | "cherry-picked"; branch?: string }
  push?: { branch: string }
  branch?: { ref: string; action: "merged" | "rebased" }
  pr?: { number: number; url?: string; action: "created" | "edited" | "merged" | "commented" | "closed" | "reopened" | "ready" | "draft" | "auto-merge-enabled" | "auto-merge-disabled" }
}
```

This confirms the #3 lead and adds `commit`, `push` and `branch`. The doc
comment says it classifies **git/gh** commands. Nothing says it classifies
`gt` commands (`gt submit`, `gt sync`, `gt restack`) (inferred: probably not,
except where gt's own output looks like gh's).

`bashEditDiff` sits beside it (`T` 21507), but it is marked `@internal`.

The same call also raises `classic.PostToolUse` (and `classic.PostToolBatch`
once per batch, `T` 8040). Every `classic.*` event "fires wherever the engine
runs the classic hook, whether or not any settings hook is configured"
(`T` 1270–1272).

### `turn.complete`, `turn.start`, `session.measure`

- `turn.complete` (`T` 4598–4609): fires when a model turn ends, main loop or
  subagent (`agentId`). Input `TurnCompleteFields` (`T` 14191–14235) plus
  `reason: 'answer' | 'aborted' | 'refusal' | 'error'` (`T` 14249). No git or
  repo field. A main-loop-only hook skips `e.agentId !== undefined`.
- `turn.start` (`T` 4580–4588): observe only.
- `session.measure` (`T` 4542–4553): "after each main-thread turn, and when a
  rate-limit window moves a whole point"; bursts fold into one more. A
  second once-per-turn signal.

### `session.receive` GitHub wakes

`'session.receive'` (`T` 4474–4485), input `SessionReceiveInput`
(`T` 11971–12003): `origin`, `text`, `event?`, `agentId?`. `event` is
`SessionReceiveEvent` (`T` 11935–11965):
`{ source, kind, from?, data, untrustedKeys }`, `source` `github` "for a
subscribed pull request's event" (`T` 11984–11985), `kind` e.g.
`pull_request.closed` or `check_suite` (`T` 11942), `data` e.g.
`{ pr: "acme/app#12", outcome: "merged" }` (`T` 11951). `event` is present
only for a server-rendered wake (`T` 11987–11988). A relay's event arrives
under `origin.kind: 'task-notification'` (`T` 12014). The hook can also take
the delivery with `{ consumed }`, so the model never sees it (`T` 4478–4480).

This confirms the #3 lead. It only covers PRs the session subscribed to; a
PR in the stack that nobody subscribed to raises nothing.

### Session start, resume, clear

- `session.start` (`T` 4473, `SessionStartInput` at `T` 12303–12318):
  `{ cwd, surface, isInteractive }`, no `source`. It fires "once when the
  session is ready and is awaited before the first prompt" (`R` 194–195).
  A hot reload runs it again (SKILL.md, "A reload runs `register` and
  `session.start` again").
- `/clear` raises `session.end` with `reason: 'clear'` **and no
  `session.start` after it** (`R` 27). `SessionEndInput` at `T` 11621.
- `classic.SessionStart` (`SessionStartHookInput`, `T` 12275–12297) has
  `source: 'startup' | 'resume' | 'clear' | 'compact' | 'fork'`, plus
  resume-only fields (`seconds_since_last_response`, `context_tokens`). So
  resume and clear are told apart only through the classic event.
- `session.attach` (`T` 4522–4533, `SessionAttachInput` at `T` 11267–11290):
  "a phone opened the session; the desktop app connected". The terminal's own
  binding raises nothing. `session.detach` (`T` 4534–4541) is its dual.

### Cwd and worktree change

- No engine event for a cwd change. `'session.cwd'` and `'session.root'`
  appear only as the arguments of `$.session.cwd()` / `$.session.root()`
  (`T` 7065–7072), i.e. calls, not notifications.
- `$.session.root()` "where `/cd`, a host's directory change or a worktree
  move took it. A shell `cd` during the session does not move it"
  (`T` 2835–2842).
- `$.session.repo()` reads "from the working copy on each call"; it gives
  `{ root, remote, internal, name }` (`T` 12095–12122), with no branch or HEAD.
- `classic.CwdChanged`: `{ old_cwd, new_cwd }` (`T` 3737–3741).
- `classic.WorktreeCreate`: `{ name }`; `classic.WorktreeRemove`:
  `{ worktree_path }` (`T` 15649–15657). `classic.DirectoryAdded`:
  `{ directory }` (`T` 3864–3869).

### Timers

`$.clock` (`T` 3515–3554): `now`, `sleep`, `after(ms, fn)`, `every(ms, fn)`
(at least 1 ms), each returning a `Timer` with `cancel()` (`T` 13480–13490).
Each period is a `clock.every` dispatch another plugin could refuse ("a
refused period ends the interval", `T` 3547–3548). Timers "run until
cancelled or until the module reloads" (`R` 197); a reload drops them
(`R` 73).

### File watching

- `$.fs` has `read`, `write`, `list`, `exists`, `stat`, `ancestors` and
  nothing else (`T` 7242–7276; also the `$` op list at `T` 7471–7476). No
  watch method.
- `classic.FileChanged`: `{ file_path, event: 'change' | 'add' | 'unlink' }`
  (`T` 4979–4983).
- `ClassicResult.watchPaths?: string[]`, "`hookSpecificOutput.watchPaths`
  (SessionStart)" (`T` 1344–1347), and `ClassicResultFields.SessionStart`
  lists `'watchPaths'` (`T` 1399). No other event reads it: `CwdChanged`
  and `FileChanged` are not in `ClassicResultFields` (`T` 1396–1413), so they
  read no `watchPaths` in this build.
- A module hook on a classic event returns `next(e)`, "a copy with fields
  changed, or its own" (`T` 1308–1310), and its answer folds in with the
  settings hooks'.
- `$.process.spawn` is an alternative watcher: a long-lived child
  (`fswatch`, a `git` poll loop) streamed for the session's life, killed when
  the loop ends or the module unloads (`T` 3605–3642, with exactly that
  "bridge watch" example at `T` 3624–3633).

### Window focus or visibility

No such event or field. A search for focus, visibility, blur and foreground
finds only the band/pane focus ring (`ui.focus`, `UiFocusComponent =
'Pane' | 'AbovePrompt'`, `T` 14791), which is keyboard focus inside the
session, not the app window.

### What re-runs the band's `ui.render` hook

`AbovePrompt` is "raised on the terminal and desktop surfaces only"
(`T` 10817). Props: `hasSurvey`, `isWorking`, `maxRows`, `bodyColumns`,
`scroll`, `view` (`T` 10819–10865). The hook re-runs when:

- a `$.state` value it read is written (`R` 154);
- `$.ui.invalidate` is called (`R` 153; `T` 7190);
- the width changes (`R` 151–153);
- the view switches between the main conversation and an agent (`T` 10860).

So the band itself has no clock: a refresh is "compute in some trigger, write
`$.state`, the band redraws".

### User `!` shell commands

No field, door or event names a bash-mode command. `PromptSubmitInput`
(`T` 9502–9561) has `text`, `command?` (slash commands only), `isMeta?`,
`attachments?`, `context?`, `turnId?`, and a queue flag; nothing for `!`.
Whether `!` raises `tool.call` on Bash (and so `gitOperation`) is not stated
(unknown).

### `$.process.run` costs and limits

From `$.process.run` (`T` 3587–3604) and `ProcessRunInit` / `ProcessRunResult`
(`T` 8199–8258):

- argv only, no shell; `cwd` defaults to the session's, `env` overlays, `stdin`
  text then closed.
- **Timeout:** 30 s default, `timeoutMs` up to ten minutes; past it the child
  is killed and the call rejects. It also rejects when the command cannot
  start.
- **Output:** 4 MiB (4,194,304 bytes) per stream; the rest is read and
  dropped, with `isStdoutTruncated` / `isStderrTruncated`. A signal-killed
  child reads as `exitCode` 1.
- **One shot:** the whole output is read, so "a background process left
  writing holds the call until the timeout".
- **Git runs with repo hooks off.**
- **"CLI only."** (inferred: the desktop's Code tab runs the CLI locally, so
  this holds there.)
- **No cancellation.** `ProcessRunInit` has no `signal` field
  (`cwd`, `env`, `stdin`, `timeoutMs` only). Only `$.process.spawn` can be
  ended early (leaving its loop, `return()`, `next.signal`, or module unload).
- **Concurrency:** nothing stated, no limit and no queueing (unknown).
- **Hookable:** `'process.run'` is an op event (`T` 7340–7346), so another
  plugin can see, rewrite or refuse the call.
- **Budget:** a hook's own budget is 10,000 ms (`HookBudget.ms`, `T` 5277),
  with 1,000 ms for a `.catch` (`T` 5285), but "the clock stops while ... any
  `$` call of the hook's is in flight (a `$.clock` wait excepted)"
  (`T` 5261–5263). A 20 s `gh pr list` inside a hook does not use up the
  budget. A `$.clock.sleep` does.

## Inferred

- **Desktop fires the engine events.** The desktop app hosts the session
  headless ("a session a host runs headless (the desktop app)", `R` 227), and
  the band is drawn there (`T` 10817). `tool.call`, `turn.*`, `session.*` and
  `classic.*` are raised by the engine, not by a surface, so they should fire
  the same. No source says so per event.
- **`session.start` on desktop** probably sees `surface: null` and
  `isInteractive: false`: the type gives `terminal` under the REPL and null /
  false "for a `-p` run or the SDK" (`T` 12309–12317). The desktop then joins
  with `session.attach`. A mod that only refreshes on `session.start` with a
  surface check would skip desktop.
- **A module's `watchPaths` arms `classic.FileChanged`.** The types say the
  SessionStart answer carries `watchPaths` and that module answers fold in
  with the settings hooks'. They do not say the engine then watches those
  paths for a module's answer, nor how `.git/HEAD` writes (rename-over) are
  reported. Worth a spike.
- **When `CwdChanged` / `WorktreeCreate` fire on desktop** (the app's own
  "move to worktree", `/cd`) is not stated.
- **`gitOperation` for `gt`**: the doc comment names git/gh only.

## Surprises

1. **There is a file-watch path after all**, but it is a side door:
   `classic.SessionStart` answering `watchPaths`, then `classic.FileChanged`.
   `$.fs` itself cannot watch.
2. **`/clear` raises no `session.start`** (`R` 27). Only `classic.SessionStart`
   with `source: 'clear'` marks it.
3. **`$.process.run` cannot be aborted.** A slow `gh` call runs to its
   timeout even after the dispatch that started it was abandoned. Use a short
   `timeoutMs`, or `$.process.spawn` when cancellation matters.
4. **`gitOperation` is richer than #3 recorded:** `commit`, `push` and
   `branch` (merged/rebased) as well as `pr`, so a Bash-run `git push` or
   `git rebase` can trigger a refresh with no parsing.
