/* Offline visual guide. Numeric demo config only; the Python template is canonical. */
(() => {
  'use strict';
  const { formation, slides, opponents } = window.FORMATION_GUIDE;
  const $ = (id) => document.getElementById(id);
  const namespace = 'http://www.w3.org/2000/svg';
  const names = ['Diamond', 'Follow ball', 'Offset', 'Attraction', 'Limits', 'Game state', 'Behaviour', 'On each robot', 'Record', 'Try it'];
  const hashes = ['diamond', 'follow', 'offset', 'attraction', 'limits', 'game-state', 'behaviour', 'integrate', 'record', 'try-it'];
  let current = 0;
  let allPages = false;
  let running = false;
  let frame = null;
  let dragging = false;
  let ball = [0, 0];
  const pages = slides.map((slide) => {
    const section = document.createElement('section');
    section.className = 'page';
    section.setAttribute('aria-label', slide.title);
    const image = document.createElement('img');
    image.src = `graphics/${slide.slug}.svg`;
    image.alt = `${slide.title} ${slide.description}`;
    image.width = 1440;
    image.height = 920;
    section.append(image);
    $('static-pages').append(section);
    return section;
  });
  pages.push($('try-it'));
  const buttons = names.map((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chapter';
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    button.append(number, document.createTextNode(name));
    button.addEventListener('click', () => show(index));
    $('chapters').append(button);
    return button;
  });

  function show(index, updateHash = true) {
    current = Math.min(pages.length - 1, Math.max(0, index));
    pages.forEach((page, i) => { page.hidden = i !== current; });
    buttons.forEach((button, i) => {
      if (i === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $('previous').disabled = current === 0;
    $('next').disabled = current === pages.length - 1;
    $('page-count').textContent = `${current + 1} / ${pages.length}`;
    if (updateHash) history.replaceState(null, '', `#${hashes[current]}`);
    if (allPages) pages[current].scrollIntoView({ block: 'start' });
    if (current !== pages.length - 1 && !allPages) stop();
  }

  $('previous').addEventListener('click', () => show(current - 1));
  $('next').addEventListener('click', () => show(current + 1));
  $('view-all').addEventListener('click', () => {
    allPages = !allPages;
    document.body.classList.toggle('all-pages', allPages);
    $('view-all').setAttribute('aria-pressed', String(allPages));
    $('view-all').textContent = allPages ? 'One page' : 'All pages';
    if (!allPages) stop();
  });
  document.addEventListener('keydown', (event) => {
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    if (event.key === 'Home') { event.preventDefault(); show(0); }
    if (event.key === 'End') { event.preventDefault(); show(pages.length - 1); }
  });
  window.addEventListener('hashchange', () => show(Math.max(0, hashes.indexOf(location.hash.slice(1))), false));

  function point([x, y]) { return [60 + (x + 4.5) * 100, 65 + (3 - y) * 100]; }
  function svgElement(tag, attributes) {
    const node = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }
  function makeRobot(position, number, team) {
    const g = svgElement('g', { transform: `translate(${point(position).join(' ')})`, 'data-team': team, 'data-player': number });
    g.append(svgElement('circle', { r: 17.5, fill: team === 'us' ? '#1768ad' : '#c56330' }));
    const label = svgElement('text', { y: 6, fill: '#fff', 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 600 });
    label.textContent = number;
    g.append(label);
    return g;
  }
  opponents.forEach((position, i) => $('live-opponents').append(makeRobot(position, i + 1, 'them')));
  const robots = Array.from({ length: 5 }, (_, i) => {
    const robot = makeRobot([0, 0], i + 1, 'us');
    $('live-targets').append(robot);
    return robot;
  });

  // Same per-axis precedence, arithmetic and clipping as the Python template.
  function target(id, mode, location) {
    const selected = formation.modes[mode];
    const robot = selected.robots[String(id)];
    const sources = [robot, selected.defaults || {}, formation.defaults || {}];
    const gain = (axis) => sources.map((source) => source.attraction?.[axis]).find((value) => Number.isFinite(value)) ?? 1;
    const limit = (key, fallback) => sources.map((source) => source[key]).find((value) => Number.isFinite(value)) ?? fallback;
    const raw = [location[0] * gain('x') + robot.offset.x, location[1] * gain('y') + robot.offset.y];
    const bounds = [limit('minX', -Infinity), limit('maxX', Infinity), limit('minY', -Infinity), limit('maxY', Infinity)];
    const value = [Math.min(bounds[1], Math.max(bounds[0], raw[0])), Math.min(bounds[3], Math.max(bounds[2], raw[1]))];
    return { value, raw, bounds };
  }
  const format = (n) => (Math.abs(n) < .005 ? 0 : n).toFixed(2);
  function render() {
    const mode = $('mode').value;
    const targets = robots.map((robot, i) => {
      const result = target(i + 1, mode, ball);
      robot.setAttribute('transform', `translate(${point(result.value).join(' ')})`);
      robot.dataset.x = result.value[0];
      robot.dataset.y = result.value[1];
      return result;
    });
    $('live-shape').setAttribute('d', [1, 2, 4, 3, 1].map((i, j) => `${j ? 'L' : 'M'}${point(targets[i].value).join(',')}`).join(' '));
    $('live-ball').setAttribute('transform', `translate(${point(ball).join(' ')})`);
    $('ball-x').value = ball[0];
    $('ball-y').value = ball[1];
    $('x-value').value = `${format(ball[0])} m`;
    $('y-value').value = `${format(ball[1])} m`;
    $('mode-name').textContent = mode;
    $('target-value').value = `(${targets[4].value.map(format).join(', ')}) m`;
    const clipped = targets[4].raw.some((v, i) => Math.abs(v - targets[4].value[i]) > 1e-8);
    $('clip-state').textContent = clipped ? 'Clipped at limit' : 'Inside limits';
    $('clip-state').classList.toggle('clipped', clipped);
    const [minX, maxX, minY, maxY] = targets[4].bounds;
    const corner = point([minX, maxY]);
    $('live-limits').replaceChildren(svgElement('rect', { x: corner[0], y: corner[1], width: (maxX - minX) * 100, height: (maxY - minY) * 100 }));
    $('live-limits').setAttribute('visibility', $('show-limits').checked ? 'visible' : 'hidden');
  }
  function stop() {
    running = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    $('animate').textContent = 'Animate targets';
    $('animate').setAttribute('aria-pressed', 'false');
  }
  function animate() {
    if (running) return stop();
    running = true;
    $('animate').textContent = 'Pause';
    $('animate').setAttribute('aria-pressed', 'true');
    const path = [ball.slice(), [2, 1.2], [4, 2.3], [1, -2.4], [-3.8, -1.8], [-1.5, 2.3], [0, 0]];
    const start = performance.now();
    function tick(now) {
      if (!running) return;
      const progress = (now - start) / 2600;
      const index = Math.floor(progress) % path.length;
      const next = (index + 1) % path.length;
      const u = progress % 1;
      const blend = u * u * (3 - 2 * u);
      ball = path[index].map((v, i) => v + (path[next][i] - v) * blend);
      render();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  $('animate').addEventListener('click', animate);
  ['ball-x', 'ball-y'].forEach((id, axis) => $(id).addEventListener('input', () => { stop(); ball[axis] = Number($(id).value); render(); }));
  $('mode').addEventListener('change', () => { stop(); render(); });
  $('show-limits').addEventListener('change', render);
  function fromPointer(event) {
    const matrix = $('live-pitch').getScreenCTM();
    if (!matrix) return;
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    ball = [Math.max(-4.5, Math.min(4.5, (pt.x - 60) / 100 - 4.5)), Math.max(-3, Math.min(3, 3 - (pt.y - 65) / 100))];
    render();
  }
  $('live-pitch').addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    stop();
    dragging = true;
    $('live-pitch').setPointerCapture(event.pointerId);
    fromPointer(event);
  });
  $('live-pitch').addEventListener('pointermove', (event) => { if (dragging) fromPointer(event); });
  function release(event) {
    dragging = false;
    if ($('live-pitch').hasPointerCapture(event.pointerId)) $('live-pitch').releasePointerCapture(event.pointerId);
  }
  $('live-pitch').addEventListener('pointerup', release);
  $('live-pitch').addEventListener('pointercancel', release);
  $('live-pitch').addEventListener('lostpointercapture', () => { dragging = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  render();
  show(Math.max(0, hashes.indexOf(location.hash.slice(1))), false);
})();
