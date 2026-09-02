# Building SlidesMD with Claude Code

This deck started as an exploratory question, not a request: after
`SlidesHtml` existed, the prompt was *"would it make sense for the slides
to be md format?"* Rather than jumping straight to building it, Claude gave
a short recommendation with the real tradeoff — markdown is much faster to
write for text-heavy slides, but you give up a little direct control over
markup, and it adds one small dependency (a markdown parser). Only after
that was it clear the answer was yes, build it.

## Design choices worth knowing about

- Slides are written as one block of markdown, split into individual slides
  wherever a line contains just `---` (the same convention tools like Marp
  and reveal.js use).
- Rendering uses [marked](https://github.com/markedjs/marked), imported
  from esm.sh — consistent with how other small apps in this `Apps/` folder
  pull in libraries (Leaflet, d3-delaunay) without a build step.
- Raw HTML embedded in the markdown passes straight through unprocessed,
  demonstrated by the "Mixed: markdown + raw HTML" slide — so you're never
  actually limited to what markdown alone can express.

## A bug that only showed up once someone typed real content

The splitting/parsing logic worked fine against the example content written
during the initial build, but broke once a real deck (`../MVC/`) was
authored inside an auto-formatted editor: the formatter indents `<script>`
content to match the surrounding HTML, and CommonMark treats indented text
as a preformatted code block, so entire slides rendered as literal text
instead of parsed markdown. The fix — stripping common leading whitespace
before parsing — was made once in `../shared/deck.js` (`dedent()`), so it
covers this deck and any other markdown deck automatically. Full story in
`../prompt.md`.
