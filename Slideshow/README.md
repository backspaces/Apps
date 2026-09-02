# Slideshow

A small hub app holding multiple slide decks, sharing one navigation engine
(`shared/deck.js` + `shared/deck.css`). No build step — this is plain
HTML/JS, same as the other apps in `Apps/`.

`index.html` is a landing page linking to each deck. Two starter decks show
the two ways to author slides:

- [SlidesHtml](SlidesHtml/) — slides written directly as HTML, for full control.
- [SlidesMD](SlidesMD/) — slides written in markdown (rendered with
  [marked](https://github.com/markedjs/marked) from esm.sh), with raw HTML
  allowed inline whenever you need more control than markdown gives you.

## Running it

Either open `index.html` directly in a browser, or serve the folder with
something like VS Code's "Go Live" — a real server avoids the
directory-listing page you'd otherwise get from `file://` links to a folder
without an explicit filename.

## Controls

Arrow keys / spacebar, click the left or right edge, or swipe to move
between slides.

## Text size and line spacing

Headings (`h1`/`h2`/`h3`) are sized in `em`, relative to the base font-size,
so everything scales together. Both the base font-size and line-height are
CSS custom properties set on `:root` in `shared/deck.css`:

```css
:root {
  --base-font-size: 25px;
  --base-line-height: 1.35;
}
```

To change these for every deck at once, edit those two values in
`shared/deck.css`. To override them for just one deck, add a `<style>` block
in that deck's own `index.html`, *after* the `<link rel="stylesheet"
href="../shared/deck.css" />` line, e.g.:

```html
<link rel="stylesheet" href="../shared/deck.css" />
<style>
  :root { --base-font-size: 22px; }
</style>
```

## Adding a new deck

Copy `SlidesHtml/` or `SlidesMD/` — whichever authoring style you want — to
a new folder directly under `Slideshow/` (it must sit at that same depth so
its `../shared/` references still resolve), then:

1. Edit the copied `index.html`'s `<title>` and slide content.
2. Link it from the top-level `index.html`'s list (`href="YourFolder/index.html"`),
   if you want it reachable from the hub page.

## How this was built

This whole app was built through conversation with Claude Code rather than
a written spec. `prompt.md` narrates that process — the decisions, dead
ends, and real bugs found by actually using the app — and each deck folder
has its own `prompt.md` with notes specific to it.

Live: https://agentscript.acequia.io/agentscript/apps/Slideshow/
