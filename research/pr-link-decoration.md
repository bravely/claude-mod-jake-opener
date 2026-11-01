# Can a mod decorate PR links in the transcript?

Research for issue #2 (parent map: #1). Surface: desktop only.

**PR link decoration** means a GitHub icon before a pull-request link in assistant transcript text, and a clickable Graphite icon after it that opens the PR's Graphite link.

## Answer

**Partly.** A mod can reach the text of every assistant reply block on the desktop surface and can redraw that block however it likes. It can draw SVG icons and links that open on click. What the types do **not** promise is putting an element *inside* the engine's rendered markdown, right beside a link in the middle of a paragraph. `Markdown` is a leaf, and nothing in the types says `Svg` is allowed inline inside `Text` or `Link`.

Three approaches work, ordered by how much of each the types confirm:

1. **A row appended under the message block** (confirmed). Wrap `next(e)` in a column `Box` and add one row per PR link found in `e.props.text`: `Svg` (GitHub), `Link` (the PR), `Svg` (Graphite), `Link` (the Graphite link). The engine still draws the reply itself.
2. **Rewriting the block's markdown** (confirmed, but text only). `next({ ...e, props: { ...e.props, text } })` with each PR link followed by a markdown link to its Graphite link, e.g. `[#123](gh-url) [↗ Graphite](graphite-url)`. The Graphite link then sits right next to the PR link and opens on click. The icons can only be glyphs or emoji: whether markdown images draw is undocumented.
3. **Redrawing the paragraph yourself with inline icons** (not confirmed, needs a prototype). Split the text, draw plain paragraphs as `Markdown`, and draw each paragraph that holds a PR link as a row of `Text`/`Link`/`Svg`. This only works if the desktop accepts `Svg` beside or inside inline elements. It would also lose markdown formatting inside that paragraph.

**Recommendation:** ship (1) as the v1 decoration. Optionally add (2) so a Graphite link also sits inline. Before promising true inline icons, prototype (3)'s single open question: does the desktop accept `<Link href=…><Svg …/></Link>` or `<Text>… <Svg/> …</Text>`?

## Confirmed in the types

Sources: this build's `claude-code.d.ts` (CLI 2.1.309, written by the `plugin-authoring` skill) and its `reference.md`, section "Drawing: ui.render". Line numbers refer to that `.d.ts`.

### The transcript text is reachable: `AssistantMessage`

- `RenderComponent` lists `'AssistantMessage'` among the `ui.render` sites (l. 9835).
- Its props (l. 10334–10372):
  > One block of an assistant reply in the transcript: its text, or a summary of the text the model wrote between two tool calls. A rewrite changes the drawing and leaves the stored message alone (ctrl+o). … Raised on every attached surface.

  `text: string`: "The block's text, markdown, as the surface's transcript will draw it". Also `isFirstOfReply`, `isSummary?: true` (read-only; "A rewrite carries it on as received"), and `onScreen`.
- The `ui.render` envelope (l. 10200–10230) carries `surface` ("one literal per member, so `if (e.surface === "terminal")` narrows `e`"), `component`, and `requestId` ("the message id for a message").
- What a hook may return (l. ~4100):
  > `next(e)` resolves to the drawing: return it, wrap it, draw your own, or rewrite `props`.
- An engine node may sit inside a `Box` beside the mod's own elements. The only rule is that "a Text holds strings and inline elements, never an engine node" (l. 13049), which implies a `Box` may hold one. That is what approach (1) relies on.

### What the desktop can draw

- The desktop element table (l. 3947–3961):
  > Claude Code Desktop's: the six every surface here carries, `Input`, `Select`, `Svg` and `Client`.

  The table: `Box, Text, Button, Input, Select, Svg, Link, Code, Markdown, Client`. The terminal has no `Svg`: "The one surface with `Raster` and `Image`, and the one without `Svg`." So the hook must fall back to `next(e)` unless `e.surface === 'desktop'`.
- `Svg` (l. 13080–13113, 10122–10134): "the remote surfaces' vector leaf … the desktop and the editor draw it as an image". It takes `source` (≤131072 chars), `alt` (required), and `width`/`height` in CSS pixels. "A leaf: hooks above wrap or replace it whole … a press other plugins should see goes on an enclosing Button."
- `Box` takes `flexDirection?: 'row' | 'column' | …` (l. 983), so a row of icon + link + icon + link is expressible.

### Opening a URL on press

- `Link` (l. 5814–5837):
  > a hyperlink every surface draws: an OSC 8 span on the terminal …, an anchor on desktop. An inline element: its children are the text, strings and inline elements … What `href` spells is the plugin's own; what a click opens is the surface's.

  And on `href`: "on a remote surface anything but the `https:` URL its wire promises: the text is drawn plain". Graphite links (`https://app.graphite.dev/…`) qualify. **A `Link` is the confirmed way to open the Graphite link on click.** No mod code needs to run.
- The types have no `$.ui` "open URL" call. The `$.ui` methods near `copy`/`selection`/`view` (l. 2595–2640) include none, and a grep for `openUrl`/`openExternal` finds nothing.
- `Button` (l. 1085–1198) gives a pressable whose `onPress` runs in the mod. But its children are limited: "Children of strings and `Text` … any other element is refused", so **a `Button` cannot wrap an `Svg`**.
- `Markdown` with `onLinkPress` (l. 5870–5915) lets a mod answer clicks on links it drew. But the doc only names the fullscreen terminal as a surface that reports these presses: "A press is a plain single click where the surface reports clicks (the fullscreen terminal)". Elsewhere "its links are the surface's own, opened as it opens links" (l. 10076). It is not needed here, because plain links already open on desktop.

### What does not help

- `Client` (l. 1440–1580): a surface module draws from `ClientElements = Omit<Elements['terminal'], 'Client' | 'Raster' | 'Image'>`. That is the terminal's element set, with no DOM and no `Svg`, so it offers no route into the rendered message DOM.
- `session.append` (`reference.md`, "The rows a conversation keeps") rewrites the **stored** row, which the model reads and the transcript file keeps. Decoration is presentation, and `AssistantMessage` rewrites "leave the stored message alone". Don't use `session.append` for this.

## Inferred or unverified

- **Is `Svg` an inline element?** `Link` and `Text` accept "strings and inline elements". `Link` is documented as inline. `Svg`'s doc says only "A leaf" and "drawn in an isolated box". So whether `<Link><Svg/></Link>` or `<Text>… <Svg/></Text>` validates on desktop is unknown, and the answer decides approach (3) and a *clickable* Graphite icon. If it is refused, the hook is skipped and the transcript line reads `ui.render hook skipped: returned the wrong shape (…)` (`reference.md`).
- **A clickable icon without `Link`-wrapping:** draw the `Svg` next to a short `Link` (e.g. "Graphite"). Or use a `Button` labelled with a glyph whose `onPress` calls `$.process.run(["open", graphiteUrl])` (l. 3587–3604: "Runs a command on the host by its argument vector"). The second works only because the desktop app and the engine share one Mac. That is inferred, and it is a worse fit than a `Link`.
- **Markdown images** (`![](data:image/svg+xml,…)`) in a rewritten `text`: the types only say that "a link not `https:`, `http:` or `file:` draws as text". Images aren't covered. Don't rely on them.
- **Streaming:** the types don't say how often an `AssistantMessage` hook re-runs while a reply streams. The decoration should be a pure function of `e.props.text` so re-runs are harmless.
- **Summary blocks:** skip blocks with `e.props.isSummary` (return `next(e)`). They are summaries, not the text that held the link.

## Sketch of approach (1)

Not a loaded or validated mod: a shape to prototype against.

```tsx
on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
  const drawn = await next(e)
  if (e.surface !== 'desktop' || e.props.isSummary) return drawn
  const prs = findPrLinks(e.props.text) // github.com/<o>/<r>/pull/<n>
  if (prs.length === 0) return drawn
  const { Box, Svg, Link } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {drawn}
      {prs.map(pr => (
        <Box key={pr.url} flexDirection="row" gap={1}>
          <Svg source={GITHUB_SVG} alt="GitHub" width={14} height={14} />
          <Link href={pr.url}>{pr.label}</Link>
          <Svg source={GRAPHITE_SVG} alt="Graphite" width={14} height={14} />
          <Link href={graphiteUrl(pr)}>Graphite</Link>
        </Box>
      ))}
    </Box>
  )
})
```

(`gap` is a `BoxProps` field, l. 996. Where the icon assets come from is the "Icons" question on #1.)
