var currentLang = 'en';

function reducedMotion() {
  return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- Theme: dark <-> light (initial value comes from the OS, see <head>) ---------- */
var THEME_LABELS = {
  en: { prefix: 'Theme: ', dark: 'Dark', light: 'Light' },
  it: { prefix: 'Tema: ', dark: 'Scuro', light: 'Chiaro' }
};
function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeBtn();
}
function toggleTheme() {
  var next = getTheme() === 'dark' ? 'light' : 'dark';
  if (!document.startViewTransition || reducedMotion()) { applyTheme(next); return; }

  // Circle centred on the button, growing until it covers the farthest corner of the viewport.
  // The animation itself is the CSS @keyframes theme-reveal (cv.css): here we only pass centre and radius.
  // Being declared in CSS, the clip is in place from the very first frame (no flash of the full new theme).
  var r = document.getElementById('btn-theme').getBoundingClientRect();
  var x = r.left + r.width / 2, y = r.top + r.height / 2;
  var radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  var root = document.documentElement.style;
  root.setProperty('--vt-x', x + 'px');
  root.setProperty('--vt-y', y + 'px');
  root.setProperty('--vt-r', Math.ceil(radius) + 'px');
  var transition = document.startViewTransition(function () { applyTheme(next); });
  transition.ready.catch(function () { /* skipped by a newer click: the theme is still applied */ });
}
function updateThemeBtn() {
  var l = THEME_LABELS[currentLang];
  var label = l.prefix + l[getTheme()];
  var btn = document.getElementById('btn-theme');
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

/* ---------- Language: old text fades out, new text fades in ---------- */
var LANG_OUT_MS = 140, LANG_IN_MS = 280;
var langAnims = [], langSwitchId = 0;
function stopLangAnims() {
  langAnims.forEach(function (a) { a.cancel(); });
  langAnims = [];
}
function applyLang(lang) {
  var isIt = lang === 'it';
  currentLang = isIt ? 'it' : 'en';
  document.documentElement.lang = currentLang;
  document.querySelectorAll('.l-en').forEach(function(el){ el.classList.toggle('hidden', isIt); });
  document.querySelectorAll('.l-it').forEach(function(el){ el.classList.toggle('hidden', !isIt); });
  document.getElementById('btn-en').classList.toggle('active', !isIt);
  document.getElementById('btn-it').classList.toggle('active', isIt);
  updateThemeBtn();
}
function setLang(lang) {
  var id = ++langSwitchId;
  stopLangAnims();
  var outgoing = Array.prototype.filter.call(
    document.querySelectorAll(lang === 'it' ? '.l-en' : '.l-it'),
    function (el) { return !el.classList.contains('hidden'); }
  );
  if (!outgoing.length || !Element.prototype.animate || reducedMotion()) { applyLang(lang); return; }

  document.getElementById('btn-en').classList.toggle('active', lang !== 'it');
  document.getElementById('btn-it').classList.toggle('active', lang === 'it');
  outgoing.forEach(function (el) {
    langAnims.push(el.animate(
      [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(3px)' }],
      { duration: LANG_OUT_MS, easing: 'ease-in', fill: 'forwards' }
    ));
  });
  setTimeout(function () {
    if (id !== langSwitchId) return; // a newer click took over
    stopLangAnims();
    applyLang(lang);
    document.querySelectorAll(lang === 'it' ? '.l-it' : '.l-en').forEach(function (el) {
      langAnims.push(el.animate(
        [{ opacity: 0, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }],
        { duration: LANG_IN_MS, easing: 'ease-out' }
      ));
    });
  }, LANG_OUT_MS);
}
/* ---------- Link to the game: site address + /LaserChess/, never hardcoded ---------- */
function initGameLink() {
  var link = document.getElementById('game-link');
  if (!link) return;
  // Opened from disk (file://) there is no site address to build on: keep only the button, no QR / printed URL
  if (!/^https?:$/.test(location.protocol)) return;
  var url = location.origin + '/LaserChess/';
  link.href = url;
  document.getElementById('game-url').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (typeof makeQR !== 'function') return;

  var m = makeQR(url), n = m.length, quiet = 4, d = '';
  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
    if (m[y][x]) d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
  }
  var size = n + 2 * quiet;
  document.querySelector('#game-qr .qr-tile').innerHTML =
    '<svg viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
    '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path fill="#0f0e17" d="' + d + '"/></svg>';
  link.closest('.project').classList.add('has-qr');
}

document.getElementById('btn-en').addEventListener('click', function () { setLang('en'); });
document.getElementById('btn-it').addEventListener('click', function () { setLang('it'); });
document.getElementById('btn-theme').addEventListener('click', toggleTheme);
applyLang('en');
try { initGameLink(); } catch (e) { /* the link keeps its relative href; the rest of the page is unaffected */ }
