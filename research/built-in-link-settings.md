# Do built-in settings already cover Graphite links or opening the editor?

Research for issue #9 (map: #1). Question: on the **desktop** Code tab, (1) does `prUrlTemplate` change PR links there (footer badges, inline transcript links, the Session Rail), and would a Graphite template cover PR link decoration or the Graphite Openers? (2) Can `footerLinksRegexes` or an editor deep link (`vscode-insiders://file/<path>`) open the worktree in the editor from the desktop app? (3) Where each falls short, what the mod still has to do.

Versions checked: Claude Code CLI 2.1.309 (`~/.local/share/claude/versions/2.1.309`, which is also the newest copy the desktop keeps in `~/Library/Application Support/Claude/claude-code/`), Claude desktop 4.4212.0. No settings file was changed.

## Answer

1. **`prUrlTemplate` does not reach the desktop Code tab.** It is read only by the CLI's terminal (Ink) UI: the footer `PR #n` badge and the PR label component used in tool-result summaries. The desktop renders its own transcript, footer-less prompt area and session details panel (the Session Rail), and its renderer bundle never mentions the key. The Session Rail's PR card comes from the desktop's own `gh` monitoring, not from the CLI's footer state. In the terminal it would work: `https://app.graphite.com/github/pr/{owner}/{repo}/{number}` is a valid template. But even there it *replaces* the GitHub link rather than adding a Graphite one, and it never touches a PR number Claude writes in prose. So it covers **none** of v1's desktop needs (decoration with both icons, Stack Openers).
2. **`footerLinksRegexes` does not reach the desktop either.** The badges live in the CLI's terminal footer state (`AppState.footerLinks`), and the desktop renderer has no reference to them. On the terminal, a `vscode-insiders://` badge is allowed, but only when a regex matches text in turn output, so it can't be a standing "open this worktree" button. The URL-encoding worry is real: every capture is `encodeURIComponent`-ed, so a captured absolute path turns `/` into `%2F`. With `vscode-insiders://file{path}` the link is dropped (origin shifts). With `vscode-insiders://file/{path}` it survives as `vscode-insiders://file/%2FUsers%2F...`, which VS Code may or may not resolve. Only templates whose captures are single path segments, with the slashes written literally, give a clean URL.
3. **The desktop's own "Open in" can open a folder, but not in Insiders here.** The session menu's **Open in → editor** opens the session's folder (docs). The app builds `vscode://file/<path>` with slashes kept and falls back to `vscode-insiders://` only when no `vscode://` handler is installed. This machine has both `Visual Studio Code.app` and `Visual Studio Code - Insiders.app`, so it would pick stable VS Code. That's a manual menu action, not something a setting or a mod can trigger or re-target. This refines #4: the *MCP tool* `open_in_editor` is files-only, but the session menu does open folders.
4. **What the mod still has to do**: everything in the map's v1 spec. That means the band's Openers (open in editor via `$VISUAL`/`$EDITOR`, per #4; Graphite links for the Stack, per #5) and PR link decoration (per #2). Neither setting is worth setting for the desktop. `prUrlTemplate` is an optional, separate terminal nicety for later (the terminal surface is out of scope for v1), and if set it would also turn the terminal's PR badge into a Graphite link.

## Evidence

### Confirmed: what the settings do (docs + CLI schema)

**`prUrlTemplate`**: settings reference, `code.claude.com/docs/en/settings-reference#prurltemplate`:

> Point the PR links Claude Code renders, in the footer badge and in tool-result summaries, at an internal code-review tool instead of `github.com`.

> Claude Code applies the template only to the links it renders itself; a PR number Claude writes in a message, such as `#123`, stays as Claude wrote it. A URL that doesn't have the `/pull/<number>` shape is left unchanged.

Scope "Any file". The CLI 2.1.309 schema string matches the one quoted in the ticket.

**`footerLinksRegexes`**: settings reference `#footerlinksregexes`. It renders "extra clickable badges in the footer below the input box", with scope "User or managed". Under "Badge constraints":

> URL origin: Captured values are URL-encoded and the constructed URL must share the template's literal origin. A capture can fill a path segment or query value but can't change where the link points

The same section caps badges at 5 (oldest displaced, `/clear` removes them), limits URLs to 2048 chars, and truncates labels to 28 columns. The scheme allowlist includes `vscode-insiders`. Matching runs "when a turn completes ... against the turn output".

Neither entry, nor the desktop page (`code.claude.com/docs/en/desktop`), says either key applies in the desktop app. The desktop page never mentions footer badges, `prUrlTemplate` or `footerLinksRegexes`. The settings page's general note ("the desktop app ... read[s] the same settings files") means the keys are *loaded*, not that the desktop renders anything from them.

### Confirmed: where the CLI uses them (CLI 2.1.309 binary, `strings` + context)

- Template substitution is a plain `replaceAll` of `{host} {owner} {repo} {number} {url}` on the parsed PR URL (minified `jB`/`Q7`). It returns the URL unchanged when no template is set or when the URL doesn't parse.
- Readers of `settings.prUrlTemplate` are all Ink components: the PR label component (renders `#n` / `!n` with `Q7(url, template)`), the prompt-input/footer component, the footer-links reducer that inserts the PR as the first badge (`$Qr(...)` with `dedupUrl` = the original GitHub URL), and the `/autofix-pr` command UI.
- `footerLinksRegexes` is read via `oM("footerLinksRegexes")` and its matches are written into `AppState.footerLinks`, which only the Ink footer reads (`K(H=>H.footerLinks)`). The identifier `footerLinks` appears only in AppState initialisers, the scanner and the footer. There is no SDK/stream-json message carrying footer links, so a host like the desktop never receives them.
- URL fill (minified `VNt`): `h.replace(/\{([^{}]+)\}/g, (_, k) => encodeURIComponent(...))`, then a dot-segment check. The origin pin (`templatePin`) parses the template with placeholders replaced by `x` and requires the filled URL's origin to equal it, else it logs `[footerLinks] dropping origin-shifted ... url`. The scheme set is `https: http: vscode: vscode-insiders: cursor: windsurf: zed: jetbrains: idea: slack: linear: notion: figma:`.

### Confirmed: the desktop app doesn't consume them (`/Applications/Claude.app/Contents/Resources`)

| Bundle | `prUrlTemplate` | `footerLinksRegexes` | `footerLinks` |
| :- | :- | :- | :- |
| `app.asar` (main process) | 2 | 2 | 2 |
| `ion-dist.asar` (renderer UI) | 0 | 0 | 2 |

All `app.asar` hits are inside two bundled copies of the settings **schema** (key definitions with `.describe(...)`), not code that reads the value. The renderer's two `footerLinks` hits are a prop named `footerLinksSwitch` in an unrelated migration dialog. The Session Rail's PR card is the desktop's own feature: the docs say PRs appear "in the **Changes** card of the session details panel", and PR monitoring "requires the GitHub CLI (`gh`)". Ticket #3 already found that the rail can't be read or drawn in from a mod.

### Confirmed: the desktop's own "Open in" editor

Docs (desktop page, "Continue in another surface"): session menu → **Open in** → "Select an installed editor or your file manager to open the session's folder on disk there." The file context menu's **Open in** opens a single file.

`app.asar` implementation (minified):

- Editor table: `VSCode: {protocol: "vscode://", fallbackProtocol: "vscode-insiders://"}`, plus Cursor, Zed, Windsurf, Xcode.
- It picks the first protocol with a registered handler (`app.getApplicationInfoForProtocol`), so `vscode://` wins whenever stable VS Code is installed.
- The URL is `${protocol}file/${path}`, with the path `encodeURIComponent`-ed and then `%2F` turned back into `/`. Paths containing `%`, `#`, `?` or `\` are refused. It is opened with `shell.openExternal`.

Locally, `/Applications` has both `Visual Studio Code.app` and `Visual Studio Code - Insiders.app`, so "Open in → VS Code" would open stable, not the user's Insiders. There's no setting to choose Insiders.

### Confirmed: VS Code URL handling

`code.visualstudio.com/docs/configure/command-line`, "Opening VS Code with URLs": a project opens with `vscode://file/{full path to project}/`. "If you are using VS Code Insiders builds, the URL prefix is `vscode-insiders://`." So `vscode-insiders://file/Users/bravely/dev/<repo>/` is a documented way to open a folder in Insiders.

### Checked locally: encoding simulation

I re-implemented the CLI's fill + origin-pin logic in Node (`URL` semantics may differ slightly from the Bun runtime the CLI uses):

| Template | Built URL | Kept? |
| :- | :- | :- |
| `vscode-insiders://file{path}` | `vscode-insiders://file%2FUsers%2Fbravely%2Fdev%2Fclaude-mod-jake-opener` | no, origin shifted |
| `vscode-insiders://file/{path}` | `vscode-insiders://file/%2FUsers%2Fbravely%2Fdev%2Fclaude-mod-jake-opener` | yes, but the path is percent-encoded |
| `vscode-insiders://file/Users/bravely/dev/{repo}/.claude/worktrees/{wt}/` | `vscode-insiders://file/Users/bravely/dev/claude-mod-jake-opener/.claude/worktrees/code-mod-quick-links-ed4c96/` | yes, clean |
| `https://app.graphite.com/github/pr/{owner}/{repo}/{number}` | `https://app.graphite.com/github/pr/bravely/claude-mod-jake-opener/12` | yes |

## Inferred (not confirmed)

- **The desktop ignores both keys at render time.** This rests on their absence from the renderer bundle and on the footer state never leaving the CLI process. It's strong evidence, but only a live check proves it.
- **Whether VS Code decodes `file/%2FUsers%2F...`** to a usable path. VS Code's URI parser percent-decodes paths, which would give `//Users/...`. It may still open, or it may fail. Untested.
- **Clickable editor links in the desktop transcript.** If the assistant's markdown contains `[open](vscode-insiders://file/...)`, the desktop may open it like any external link (the docs describe a first-click dialog for external links, choosing between the Browser pane and the default browser). How a non-http scheme behaves there is unverified, and it's per-message, not a standing Opener anyway.

## Live checks the user could run (optional)

These are for the user to try. Nothing here was written to any settings file. Add them to `~/.claude/settings.json` temporarily (`footerLinksRegexes` is ignored in project files):

```json
{
  "prUrlTemplate": "https://app.graphite.com/github/pr/{owner}/{repo}/{number}",
  "footerLinksRegexes": [
    {
      "type": "regex",
      "pattern": "OPEN_WT (?<repo>[A-Za-z0-9._-]+)/(?<wt>[A-Za-z0-9._-]+)",
      "url": "vscode-insiders://file/Users/bravely/dev/{repo}/.claude/worktrees/{wt}/",
      "label": "Insiders: {wt}"
    }
  ]
}
```

1. Start a new desktop Code-tab session on a branch with an open PR and ask Claude to print `OPEN_WT claude-mod-jake-opener/code-mod-quick-links-ed4c96`. Expected (inferred): no footer badge appears, and the PR card and PR links still point to github.com.
2. Do the same in the terminal `claude`. Expected (confirmed by source): the footer shows `PR #n` linking to Graphite, plus an `Insiders: code-mod-…` badge. Cmd-click it to see whether Insiders opens the worktree folder.
3. Remove both keys afterwards.

## Sources

- Claude Code settings reference: https://code.claude.com/docs/en/settings-reference (`#prurltemplate`, `#footerlinksregexes`)
- Claude Code settings: https://code.claude.com/docs/en/settings
- Claude Code desktop: https://code.claude.com/docs/en/desktop ("Continue in another surface", "What's not available in Desktop", session details panel)
- Claude Code interactive mode, "PR review status": https://code.claude.com/docs/en/interactive-mode
- VS Code command line, "Opening VS Code with URLs": https://code.visualstudio.com/docs/configure/command-line
- Local: CLI binary `~/.local/share/claude/versions/2.1.309`; desktop `/Applications/Claude.app/Contents/Resources/{app,ion-dist}.asar` (v4.4212.0)
