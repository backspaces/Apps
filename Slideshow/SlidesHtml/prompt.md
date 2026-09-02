# Building SlidesHtml with Claude Code

This deck exists because the very first question Claude asked — before
writing anything — was what slides should contain: images, images with
captions, or arbitrary HTML. The answer ("arbitrary HTML slides") plus
"manual navigation only" and "no style preference" fully defined this
version. There wasn't a spec to follow beyond those three answers; the
first draft (a title slide, a bullet list, a code block, a closing slide)
was just a reasonable demonstration of what "arbitrary HTML" could hold.

The navigation behavior — arrow keys, click zones on the left/right edges
(not the whole slide, so links inside slide content still work), touch
swipe, and a small counter — was written once here and later pulled out
into `../shared/deck.js` when this app was consolidated with its markdown
sibling (`../SlidesMD/`) under one `Slideshow` hub. See `../prompt.md` for
that part of the story.

To add a slide: duplicate a `<section class="slide">...</section>` block
inside `#deck` in `index.html` and put whatever markup you want inside it.
