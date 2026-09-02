# Building MVC with Claude Code

This deck is a real, working example of the "copy a starter deck to make
your own" pattern described in `../README.md` — and it happened to surface
several genuine bugs in the shared engine along the way, which is a decent
argument for actually using the thing you build rather than just reading
the code.

## What happened, in order

1. Copied `../SlidesMD/index.html` and replaced the example content with
   real slides about AgentScript's Model/View/Controller architecture.
2. First render: headings showed up as literal `## text` instead of styled
   headings, and a long line refused to wrap. Both turned out to be the
   same bug — the editor's formatter had indented the markdown inside the
   `<script>` tag to match the surrounding HTML, and CommonMark reads 4+
   spaces of indentation as a code block, so the whole slide was being
   parsed as one big preformatted block. Fixed centrally in
   `../shared/deck.js` (a `dedent()` step before parsing), not per-deck.
2. Wanted "M: Model / V: View / C: Controller" to stay on three tight lines
   instead of collapsing into one — that's normal CommonMark behavior
   (single line breaks inside a paragraph become a space, not a line
   break). Fixed by ending each line with a trailing `\`, which forces a
   hard line break.
3. Tried centering the title with raw HTML (`<div align="center">MVC</div>`)
   to see if that markdown-plus-HTML trick actually works — it does — but
   decided a plain `## MVC` heading, left-aligned like everything else, was
   good enough for now. Not every experiment needs to ship.
4. Bumped the shared base font-size from 20px to 25px for readability, which
   then made line spacing feel too loose; tightened `--base-line-height`
   (and gave headings their own tighter line-height) in `../shared/deck.css`
   to compensate — both changes affect every deck in the family, not just
   this one.
5. Linked from the hub page (`../index.html`) so it's reachable alongside
   the starter decks.

See `../prompt.md` for the wider story of how this whole app family came
together.
