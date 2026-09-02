// Shared slide-deck player: navigation UI, keyboard, click zones, swipe.
// Used by both SlidesHtml and SlidesMD — pass in the #deck element once its
// .slide children are in the DOM.
export function initDeck(deck) {
  const zonePrev = document.createElement('div');
  zonePrev.className = 'nav-zone';
  zonePrev.id = 'zone-prev';
  const zoneNext = document.createElement('div');
  zoneNext.className = 'nav-zone';
  zoneNext.id = 'zone-next';

  const arrowPrev = document.createElement('div');
  arrowPrev.className = 'arrow';
  arrowPrev.id = 'arrow-prev';
  arrowPrev.innerHTML = '&#8249;';
  const arrowNext = document.createElement('div');
  arrowNext.className = 'arrow';
  arrowNext.id = 'arrow-next';
  arrowNext.innerHTML = '&#8250;';

  const counter = document.createElement('div');
  counter.id = 'counter';

  document.body.append(zonePrev, zoneNext, arrowPrev, arrowNext, counter);

  const slides = deck.querySelectorAll('.slide');
  let current = 0;

  function show(index) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, i) => slide.classList.toggle('active', i === current));
    counter.textContent = `${current + 1} / ${slides.length}`;
  }

  function next() { show(current + 1); }
  function prev() { show(current - 1); }

  zonePrev.addEventListener('click', prev);
  zoneNext.addEventListener('click', next);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') next();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(slides.length - 1);
  });

  let touchStartX = null;
  window.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
  window.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) (dx < 0 ? next() : prev());
    touchStartX = null;
  });

  show(0);
}

// Strips the common leading whitespace shared by every non-blank line.
// Editors/formatters (e.g. Prettier via Go Live) indent a <script>'s
// content to match the surrounding HTML — left as-is, that indentation
// reads as a CommonMark indented code block, so markdown inside gets
// parsed literally (no headings, no wrapping) instead of rendered.
function dedent(raw) {
  const lines = raw.split('\n');
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    minIndent = Math.min(minIndent, line.match(/^[ \t]*/)[0].length);
  }
  if (!isFinite(minIndent) || minIndent === 0) return raw;
  return lines.map((line) => line.slice(minIndent)).join('\n');
}

// Splits a markdown string into per-slide markdown chunks on lines
// containing only "---". Used by SlidesMD.
export function splitMarkdownSlides(raw) {
  const chunks = [[]];
  for (const line of dedent(raw).split('\n')) {
    if (line.trim() === '---') chunks.push([]);
    else chunks[chunks.length - 1].push(line);
  }
  return chunks
    .map((lines) => lines.join('\n').trim())
    .filter((md) => md.length > 0);
}
