# Building Slideshow with Claude Code

This app is a small case study in what iterative, conversational
development with Claude Code actually looks like — not a spec handed over
up front, but a series of small decisions made in response to what actually
showed up on screen.

## Starting from an idea, not a spec

The whole thing started with one line: *"I have an idea for a new app: a
slide show."* Rather than guessing at requirements, Claude asked three
quick multiple-choice questions first — what should slides contain (images?
arbitrary HTML?), how should they advance (auto-play vs manual), and any
preferred visual style — before writing any code. That turned a vague idea
into a concrete first version (arbitrary HTML slides, manual navigation, no
particular style preference) in under a minute, and matched the existing
convention in this `Apps/` folder: no build step, one self-contained
`index.html` per app.

## A tangent that became a second app

Once the HTML version worked, the next prompt was exploratory rather than a
request: *"would it make sense for the slides to be md format?"* Claude
answered with a recommendation and a tradeoff (markdown is faster to write,
but you lose a little direct control, and raw HTML still works inline since
markdown parsers pass it through untouched) rather than just building it.
That answer led to a decision to build a second, markdown-based deck rather
than replace the first.

## Consolidating, and a real gotcha

After both decks existed as separate apps, the request came to combine them
into one app with multiple decks inside it. Attempting to create a
sibling folder named `SlideShow` (capital S) actually collided with the
existing `Slideshow` — macOS's filesystem is case-insensitive, so the two
names pointed at the same directory. Claude caught this by noticing files
existed that it hadn't created yet, investigated instead of overwriting, and
adapted the plan: one `Slideshow` folder, with a shared navigation engine
(`shared/deck.js` + `shared/deck.css`) factored out so `SlidesHtml` and
`SlidesMD` could each stay small and just import it.

## Debugging against a real browser

Several fixes only surfaced because the app was actually opened and
clicked through, not just read as code:

- Links from the hub page to `SlidesHtml/` (no filename) produced a
  directory listing instead of the deck, because `file://` has no
  auto-index behavior the way a real web server does. Fix: link to
  `index.html` explicitly.
- Once editing moved to VS Code's "Go Live" (a local server, which sidesteps
  that `file://` limitation generally), a new bug appeared in the `MVC`
  deck: headings showed up as literal `## text` and long lines didn't wrap.
  Root cause: the editor's auto-formatter indents `<script>` block content
  to match the surrounding HTML, and CommonMark treats 4+ spaces of
  indentation as a preformatted code block — so the whole slide was being
  parsed as one giant code block. Fixed once, centrally, with a `dedent()`
  helper in `shared/deck.js` that strips the common leading whitespace
  before parsing, so every deck (present and future) is immune to it
  regardless of formatter settings.

## Design back-and-forth on styling

A few rounds of "this doesn't look right" turned into small, targeted CSS
changes rather than rewrites:

- Paragraph text was centering along with headings; fixed by making `.slide`
  stop forcing `text-align: center` globally, so markdown's natural
  left-aligned default applies, while headings can still be centered
  individually if wanted later.
- An experiment with `<div align="center">` (raw HTML inside markdown, to
  test whether that trick works at all) confirmed it does, but the user
  decided plain markdown headings without centering were good enough for
  now — a case of trying something, seeing it work, and then choosing
  simplicity anyway.
- Font size and line-height were pulled out into CSS custom properties
  (`--base-font-size`, `--base-line-height`) so the whole deck family can be
  retuned in one place, or overridden per-deck without touching the shared
  file.

## The pattern for adding a new deck

Once `MVC` was created (by copying `SlidesMD` and editing its content), it
was linked from the hub `index.html`'s list — establishing the repeatable
pattern for anyone adding a deck of their own: copy a starter folder, edit
its content, link it from the hub.

See also: `SlidesHtml/prompt.md`, `SlidesMD/prompt.md`, and `MVC/prompt.md`
for notes specific to each deck.
