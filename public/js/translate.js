/* Language switcher — Google Website Translate with our own menu.
   The chosen language is kept in the "googtrans" cookie so it follows the visitor across pages. */
(function () {
  if (window.__giLang) return; window.__giLang = 1;
  var box = document.querySelector('.lang-switch');
  if (!box) return;

  // The mobile menu is fixed-position: open it right under the header, wherever the header sits.
  var hdr = document.querySelector('.site-header'), nav = document.getElementById('siteNav'), tog = document.querySelector('.nav-toggle');
  if (hdr && nav && tog) tog.addEventListener('click', function () { nav.style.top = Math.max(0, hdr.getBoundingClientRect().bottom) + 'px'; });

  var RTL = { ar: 1, fa: 1, ur: 1, ps: 1 };

  function current() {
    var m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]*\/([^;]+)/);
    return m ? decodeURIComponent(m[1]) : 'en';
  }

  function setCookie(lang) {
    var host = location.hostname, parts = [''];
    if (host.indexOf('.') > 0) { parts.push('; domain=' + host); parts.push('; domain=.' + host.replace(/^www\./, '')); }
    parts.forEach(function (d) {
      document.cookie = lang === 'en'
        ? 'googtrans=; path=/' + d + '; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        : 'googtrans=/en/' + lang + '; path=/' + d;
    });
  }

  var lang = current();
  var label = box.querySelector('.lang-cur');
  var active = box.querySelector('[data-lang="' + lang + '"]');
  if (label) label.textContent = active ? active.getAttribute('data-short') : lang.toUpperCase();
  if (active) active.classList.add('on');

  box.querySelector('.lang-btn').addEventListener('click', function (e) {
    e.stopPropagation(); box.classList.toggle('open');
  });
  document.addEventListener('click', function () { box.classList.remove('open'); });
  box.querySelectorAll('[data-lang]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var l = a.getAttribute('data-lang');
      if (l === lang) { box.classList.remove('open'); return; }
      setCookie(l);
      location.reload();
    });
  });

  if (lang === 'en') return;

  // Translated view: right-to-left text where needed, a notice, and the Google engine.
  document.documentElement.classList.add('is-translated');
  if (RTL[lang]) document.documentElement.classList.add('lang-rtl');

  var bar = document.createElement('div');
  bar.className = 'tr-note';
  bar.innerHTML = '<div class="wrap"><span>This page was translated automatically by Google. The English version is the official version. ' +
    'For advice in Tigrinya, Amharic or Arabic, call <a href="tel:+14039154230">(403) 915-4230</a>.</span>' +
    '<button type="button" class="tr-orig notranslate" translate="no">English (original)</button></div>';
  var header = document.querySelector('.site-header');
  if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
  bar.querySelector('.tr-orig').addEventListener('click', function () { setCookie('en'); location.reload(); });

  var holder = document.createElement('div');
  holder.id = 'gt_el'; holder.style.display = 'none';
  document.body.appendChild(holder);
  window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'gt_el');
  };
  var s = document.createElement('script');
  s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  s.async = true;
  document.head.appendChild(s);
})();
