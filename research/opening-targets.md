# How a mod opens a Target on the desktop

Research for issue #4 (map: #1). Question: on the desktop surface, how does a mod open (1) a URL in the user's browser and (2) a directory in the desktop app's configured editor?

## Answer

1. **URL**: draw it as a `Link` element (`<Link href={url}>`). The desktop draws it as an anchor and the surface opens it on click. No `$` call and no process needed. If the Opener has to be a `Button` (for a hotkey, say), run `$.process.run(["open", url])` from its `onPress`. `open` hands the URL to LaunchServices and exits right away.
2. **Directory in the app's editor**: there is **no `$` API** for the desktop's "Open in" editor. The desktop's own tool, `mcp__ccd_host__open_in_editor`, **opens files only** and points folders to `reveal_path` (Finder). It also only knows `vscode | cursor | windsurf | zed`, and in default mode the user approves each open on a card. So for a directory the app's open-in-editor counts as **unreachable**, and v1 should use the fallback.
3. **Fallback (confirmed workable)**: read `$VISUAL`, then `$EDITOR`, through `$.env.get`. Split it into argv, drop `--wait`/`-w`, append the directory, and run it with `$.process.run` without awaiting it (`void $.process.run(...).catch(...)`). For the user's `code-insiders --wait` that gives `["code-insiders", "<git top level>"]`. Do **not** use `$.process.spawn` for this, because it kills its child when the loop ends or the module unloads.

## Evidence

All type quotes are from this build's `claude-code.d.ts` (2.1.309, from the `plugin-authoring` skill), cited by line number.

### Confirmed in the types

**`Link` is an anchor on desktop, and the surface opens it** (`LinkProps`, l. 5814-5831):

> The props of `Link`, a hyperlink every surface draws: an OSC 8 span on the terminal (else its text then the URL in dim), an anchor on desktop.
> ... What `href` spells is the plugin's own; what a click opens is the surface's.
>
> `href: string` — Where the link goes, as written: any scheme, host and port ... A click opens what the terminal, or the surface, opens.

`Link` takes no `onPress` (its props are `href` and `label` only), so the mod never sees the click. The render-tree union says the same (l. 10046-10055).

**`Markdown` links open the same way unless the mod claims them** (l. 10074-10076): "Without a `press` its links are the surface's own, opened as it opens links." `Markdown.onLinkPress` + `pressableLinks` (l. 5898-5914) let a mod take the press over instead. That is relevant to PR link decoration, not to this ticket.

**`$.process.run` waits for exit, with a 30 s default timeout** (l. 3588-3604):

> Runs a command on the host by its argument vector (no shell) and resolves `{ exitCode, stdout, stderr }` once it exits, any exit code.
> One shot: the whole output is read, so a background process left writing holds the call until the timeout. Rejects when the command cannot start or is still running then.
> `init` `{ cwd, env, stdin, timeoutMs }` (cwd the session's by default; timeout 30 s by default, ten minutes at most)

The `process` noun's header (l. 3582) says: "Commands on the host, run as the user the session runs as. CLI only." A desktop Code-tab session is a local CLI engine, so this applies there. That reading is inferred; see below.

**`$.process.spawn` ties the child's life to the loop** (l. 3609-3611), which rules it out for launching an editor:

> The loop is the child's life: leaving it, `return()` on the stream, `next.signal` aborting or the module unloading kills the child, and nothing else does, a hook's return included: end the loop to end it.

**`$` calls don't count against the hook's budget** (l. 6404, under `$.model.complete`'s `timeoutMs`): "A `$` call's time never counts against the calling hook's budget". The hook can therefore await `open` without the risk of being skipped. A fire-and-forget `void` promise also lets the press handler return at once.

**Environment variables** (l. 3699-3709): `$.env.get(name)` "Resolves with the variable's value, or `undefined` when it is unset", and `name` must be a string literal. `claude plugin validate` lists the names, so the module has to spell `$.env.get("VISUAL")` and `$.env.get("EDITOR")` literally.

**Calling MCP / tools from a mod** has two paths, both typed:

- `$.tool.call` (l. 3099-3109): "Calls a tool: the event `tool.call`, the same call the engine makes for the model's tool calls ... It runs through every hook but the calling one ..., the permission check and its dialog, then the tool." Any tool in the model's list can be called this way, including `mcp__ccd_host__open_in_editor`. The call goes through the permission dialog.
- `$.mcp.call(server, tool, args)` (l. 2751-2771): "Calls `tool` on one of the engine's connected MCP servers ... No permission prompt: the plugin's call, seen by the hooks above it, is the grant." The engine's own prompt is skipped. The ccd_host tool still shows its own approval card in default mode (next section), because that card is part of the tool.

**The desktop's open-in-editor tool** (schema of `mcp__ccd_host__open_in_editor`, as this session loads it):

> Open a file from this session's project in the user's code editor (the one they use from this app's "Open in" menu: VS Code, Cursor, Windsurf, or Zed) ... `path` ... must be inside the session's folders ... **Files only: to show the user a folder, use reveal_path.** In default mode the user approves each open on a card that shows the resolved path; in auto mode the app's classifier decides.

`editor` enum: `vscode | cursor | windsurf | zed`. There is no Insiders entry. `mcp__ccd_host__reveal_path` takes folders but shows them in Finder, which is not an editor.

### Checked locally (macOS, this machine)

- `/usr/bin/open` exists. `man open`: "The **open** command opens a file (or a directory or URL), just as if you had double-clicked the file's icon." `open` exits once LaunchServices has the request. It waits only with `-W`.
- `$EDITOR` = `code-insiders --wait`. `$VISUAL` is unset.
- `/opt/homebrew/bin/code-insiders` links to `/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`, a bash script that runs `ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"`. That is VS Code's CLI shim: it asks the running instance, or a newly launched app, to open the path and then exits.

### Inferred (not stated in the types; check in the prototype)

- **What a desktop `Link` click opens**: presumably the system default browser. The types only say "what a click opens is the surface's".
- **`$.process` works in a desktop-started session**: "CLI only" is read as excluding remote/SDK hosts, not the desktop's local engine. reference.md (l. 130) says the desktop app starts a local session for its Code tab that loads mods and draws the `desktop` surface. That supports this reading but doesn't prove it.
- **Whether `$.mcp.call("ccd_host", ...)` reaches the desktop's server**: ccd_host is probably an SDK-host (`source: "sdk"`, l. 6130) in-process server. `$.mcp.call` says only "connected MCP servers", so whether SDK servers count is untested. `$.tool.call({ tool: "mcp__ccd_host__open_in_editor", path })` is the more certain route, since the tool is in the model's list. It is moot for directories anyway, because the tool refuses folders.
- **The `code-insiders` shim exits promptly without `--wait`.** If it ever kept stdout open, an awaited `$.process.run` would hang to the 30 s timeout and then reject and kill the shim. The `void` call keeps the press responsive either way. A sturdier variant is `["open", "-a", "Visual Studio Code - Insiders", dir]`, but that hard-codes the app instead of honouring `$EDITOR`.
- **Workaround for the app's open-in-editor**: calling it on a file inside the directory (e.g. `README.md`) would open that file, likely without the folder as the workspace. It does not meet "open this worktree".

## Recommended shape for v1

```tsx
// URL Opener: let the surface open it.
<Link href={prUrl}>{label}</Link>

// Directory Opener: $VISUAL/$EDITOR, --wait stripped, not awaited.
const openDir = async ($, dir: string) => {
  const raw = (await $.env.get("VISUAL")) ?? (await $.env.get("EDITOR"))
  const argv = raw?.trim().split(/\s+/).filter(a => a !== "--wait" && a !== "-w")
  const cmd = argv?.length ? [...argv, dir] : ["open", dir] // last resort: Finder/LaunchServices
  void $.process.run(cmd, { timeoutMs: 15_000 }).then(
    r => { if (r.exitCode !== 0) $.ui.toast(`Couldn't open editor: ${r.stderr.trim()}`) },
    err => $.ui.toast(`Couldn't open editor: ${String(err)}`),
  )
}
```

- `dir` is the git top level of the session cwd: `$.process.run(["git", "rev-parse", "--show-toplevel"], { cwd: await $.session.cwd() })`.
- The whitespace split does not handle quoted paths in `$EDITOR`. That is fine for `code-insiders --wait`. Note it as a known limit.
- Out of scope here: reading which editor the desktop's "Open in" menu has selected, which no `$` API exposes.
