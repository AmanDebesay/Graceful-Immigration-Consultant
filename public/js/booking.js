// Booking page: the blue calendar shows the time, weather and Canadian holidays, and books consultations
// through Microsoft Bookings (the "booking" function returns open times and creates the appointment).
(function () {
  var API = 'https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/booking';
  var KEY = 'sb_publishable_ZcaXkELPK820lTD41ffw2Q_iMTta3uT';
  var BOOKINGS_PAGE = 'https://bookings.cloud.microsoft/book/GracefulImmigrationConsultant@gracefulimmigration.ca/';
  var MT = 'America/Edmonton';
  var MY_TZ = (Intl.DateTimeFormat().resolvedOptions().timeZone) || MT;
  var PLANS = { '30': { label: '30-Minute Consultation · $30', short: '30 min', minutes: 30, price: 30 },
                '60': { label: '1-Hour Consultation · $60', short: '1 hour', minutes: 60, price: 60 } };
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var dkey = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var fmtDay = function (d) { return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); };
  var fmtTime = function (d, tz) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined }); };
  var sameTz = fmtTime(new Date(2026, 0, 15, 12)) === fmtTime(new Date(2026, 0, 15, 12), MT) && fmtTime(new Date(2026, 6, 15, 12)) === fmtTime(new Date(2026, 6, 15, 12), MT);

  function api(body) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Booking is not available right now.'); e.data = j; throw e; } return j; }); });
  }

  // ── Clocks ──
  function tick() {
    var now = new Date();
    $('chYourTime').textContent = fmtTime(now);
    $('chYourDate').textContent = fmtDay(now);
    $('chMtTime').textContent = fmtTime(now, MT);
    $('chMtDate').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', timeZone: MT });
  }
  tick(); setInterval(tick, 15000);

  // ── Canadian (federal) and Alberta statutory holidays ──
  function nthMonday(y, m, n) { var first = new Date(y, m, 1).getDay(); return 1 + (8 - first) % 7 + (n - 1) * 7; }
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
        g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  }
  var holCache = {};
  function holidays(y) {
    if (holCache[y]) return holCache[y];
    var gf = easter(y); gf.setDate(gf.getDate() - 2);
    var vic = new Date(y, 4, 24); while (vic.getDay() !== 1) vic.setDate(vic.getDate() - 1);
    var list = [[0, 1, "New Year's Day"], [1, nthMonday(y, 1, 3), 'Family Day (Alberta)'], [gf.getMonth(), gf.getDate(), 'Good Friday'],
      [4, vic.getDate(), 'Victoria Day'], [6, 1, 'Canada Day'], [7, nthMonday(y, 7, 1), 'Heritage Day (Alberta)'],
      [8, nthMonday(y, 8, 1), 'Labour Day'], [8, 30, 'National Day for Truth and Reconciliation'],
      [9, nthMonday(y, 9, 2), 'Thanksgiving'], [10, 11, 'Remembrance Day'], [11, 25, 'Christmas Day'], [11, 26, 'Boxing Day']];
    var map = {}; list.forEach(function (h) { map[dkey(new Date(y, h[0], h[1]))] = h[2]; });
    return (holCache[y] = map);
  }
  var holidayOn = function (d) { return holidays(d.getFullYear())[dkey(d)]; };

  var today = new Date(); today.setHours(0, 0, 0, 0);
  (function upcoming() {
    var up = [];
    [today.getFullYear(), today.getFullYear() + 1].forEach(function (y) {
      var m = holidays(y); Object.keys(m).sort().forEach(function (k) { var p = k.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); if (d >= today) up.push([d, m[k]]); });
    });
    $('chHols').innerHTML = up.slice(0, 5).map(function (h) {
      return '<li><b>' + h[0].toLocaleDateString([], { month: 'short', day: 'numeric' }) + '</b>' + esc(h[1]) + '</li>';
    }).join('');
  })();

  // ── Weather (Open-Meteo, no account needed) ──
  var ICON = {
    sun: '<circle cx="12" cy="12" r="4.5" fill="#F4B63F"/><g stroke="#F4B63F" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="#F3D27A"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z" fill="#C9D3E3"/>',
    part: '<circle cx="8" cy="8" r="3.6" fill="#F4B63F"/><path d="M9 19h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.9 13 3 3 0 0 0 9 19z" fill="#DCE3EE"/>',
    rain: '<path d="M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14z" fill="#B7C3D7"/><g stroke="#4F8FE0" stroke-width="2" stroke-linecap="round"><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/></g>',
    snow: '<path d="M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14z" fill="#C9D3E3"/><g fill="#8FB6EA"><circle cx="8" cy="18" r="1.3"/><circle cx="12" cy="20" r="1.3"/><circle cx="16" cy="18" r="1.3"/></g>',
    storm: '<path d="M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14z" fill="#9AA8BF"/><path d="M12.5 14l-3 5h3l-1.5 4 4.5-6h-3l1.5-3z" fill="#F4B63F"/>',
    fog: '<g stroke="#B7C3D7" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M6 13h12M4 17h16"/></g>'
  };
  function wx(code, day) {
    if (code === 0) return [day === 0 ? 'moon' : 'sun', 'Clear'];
    if (code <= 2) return ['part', 'Partly cloudy'];
    if (code === 3) return ['cloud', 'Cloudy'];
    if (code === 45 || code === 48) return ['fog', 'Fog'];
    if (code >= 95) return ['storm', 'Thunderstorm'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', 'Snow'];
    return ['rain', code < 60 ? 'Drizzle' : 'Rain'];
  }
  function loadWx(lat, lon, place) {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1')
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        var c = j.current, w = wx(c.weather_code, c.is_day);
        $('chWx').innerHTML = '<svg class="ch-wi" viewBox="0 0 24 24" aria-hidden="true">' + ICON[w[0]] + '</svg><div><b>' + Math.round(c.temperature_2m) + '°C <small style="font-size:12px;font-weight:500">' + w[1] + '</small></b>' +
          '<div class="bk-wx-d">' + esc(place) + ' · H ' + Math.round(j.daily.temperature_2m_max[0]) + '° L ' + Math.round(j.daily.temperature_2m_min[0]) + '° · wind ' + Math.round(c.wind_speed_10m) + ' km/h' +
          (navigator.geolocation && place !== 'Your location' ? ' · <button type="button" id="chLoc">Use my location</button>' : '') + '</div></div>';
        var b = $('chLoc');
        if (b) b.addEventListener('click', function () {
          b.textContent = 'Locating…';
          navigator.geolocation.getCurrentPosition(function (p) { loadWx(p.coords.latitude.toFixed(2), p.coords.longitude.toFixed(2), 'Your location'); },
            function () { b.textContent = 'Location not available'; }, { timeout: 10000, maximumAge: 6e5 });
        });
      })
      .catch(function () { $('chWx').innerHTML = '<span class="bk-muted">Weather is not available right now.</span>'; });
  }
  loadWx(49.69, -112.84, 'Southern Alberta');

  // ── Booking ──
  var plan = '30', services = null, setupError = null;
  var view = new Date(today.getFullYear(), today.getMonth(), 1);
  var slotCache = {}, openDays = {}, selDay = null, selSlot = null, loadToken = 0;
  var side = $('bkSide');

  function serviceFor(p) {
    if (!services) return null;
    var want = PLANS[p].minutes;
    return services.filter(function (s) { return s.minutes === want; })[0] || null;
  }
  function fallback(msg) {
    return '<div class="bk-hint"><svg><use href="#i-clock"/></svg>' + msg + '<br><br><a href="' + BOOKINGS_PAGE + '" target="_blank" rel="noopener">Open our booking page</a> or call <a href="tel:+14039154230">(403) 915-4230</a>.</div>';
  }
  function hint() {
    var svc = serviceFor(plan);
    if (setupError) { side.innerHTML = fallback(esc(setupError)); return; }
    if (services && !svc) { side.innerHTML = fallback('Online booking for the <b>' + PLANS[plan].short + '</b> consultation opens soon.'); return; }
    side.innerHTML = '<div class="bk-hint"><svg><use href="#i-clock"/></svg><b>' + PLANS[plan].label + '</b><br>Pick a day with a gold dot to see open times.' +
      (sameTz ? '' : '<br><small>Times are shown in your time zone.</small>') + '</div>';
  }

  function render() {
    $('chMonth').textContent = view.toLocaleDateString([], { month: 'long', year: 'numeric' });
    var html = '';
    for (var i = 0; i < 7; i++) html += '<span class="ch-wd">' + new Date(2023, 0, 1 + i).toLocaleDateString([], { weekday: 'narrow' }) + '</span>';
    var lead = view.getDay(), days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (i = 0; i < lead; i++) html += '<span></span>';
    for (var d = 1; d <= days; d++) {
      var dt = new Date(view.getFullYear(), view.getMonth(), d), k = dkey(dt), h = holidayOn(dt), open = !!openDays[k], cls = ['ch-d'];
      if (open) cls.push('open');
      if (+dt === +today) cls.push('today');
      if (h) cls.push('hol');
      if (selDay === k) cls.push('sel');
      var label = fmtDay(dt) + (h ? ', ' + h : '') + (open ? ', open times' : '');
      html += '<button type="button" class="' + cls.join(' ') + '" data-k="' + k + '"' + (h ? ' title="' + esc(h) + '"' : '') + ' aria-label="' + esc(label) + '"' + (open ? '' : ' aria-disabled="true"') + '>' + d + '</button>';
    }
    $('chGrid').innerHTML = html;
    $('chPrev').disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
    $('chNext').disabled = view >= new Date(today.getFullYear(), today.getMonth() + 3, 1);
  }

  function loadMonth() {
    render();
    var svc = serviceFor(plan);
    if (!svc) { hint(); return; }
    var from = view < today ? today : view, key = svc.id + dkey(view), my = ++loadToken;
    var monthEnd = new Date(view.getFullYear(), view.getMonth() + 1, 0);
    var days = Math.round((monthEnd - from) / 864e5) + 2;
    var done = function (slots) {
      if (my !== loadToken) return;
      openDays = {};
      slots.forEach(function (iso) { var d = new Date(iso), k = dkey(d); (openDays[k] = openDays[k] || []).push(d); });
      $('chGrid').classList.remove('loading'); render();
      if (selDay && openDays[selDay]) showTimes(selDay); else { selDay = null; hint(); }
    };
    if (slotCache[key]) return done(slotCache[key]);
    $('chGrid').classList.add('loading');
    side.innerHTML = '<div class="bk-hint"><svg><use href="#i-clock"/></svg>Finding open times…</div>';
    api({ action: 'slots', serviceId: svc.id, from: dkey(new Date(from.getTime() - 864e5)), days: Math.min(days, 42) })
      .then(function (j) { slotCache[key] = j.slots; done(j.slots); })
      .catch(function (e) { if (my !== loadToken) return; $('chGrid').classList.remove('loading'); side.innerHTML = fallback(esc(e.message)); });
  }

  function showTimes(k) {
    selDay = k; selSlot = null; render();
    var list = openDays[k] || [];
    var p = k.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]), h = holidayOn(d);
    side.innerHTML = '<h4>' + fmtDay(d) + '</h4><p class="bk-sub">' + PLANS[plan].label + (h ? ' · ' + esc(h) : '') + (sameTz ? '' : ' · your time (Alberta time below)') + '</p>' +
      (list.length ? '<div class="bk-times">' + list.map(function (t, i) {
        return '<button type="button" class="bk-time" data-i="' + i + '">' + fmtTime(t) + (sameTz ? '' : '<small>' + fmtTime(t, MT) + ' Alberta</small>') + '</button>';
      }).join('') + '</div>' : '<div class="bk-hint">No open times on this day. Please choose another day.</div>');
  }

  function showForm(t) {
    selSlot = t;
    var when = fmtDay(t) + ' at ' + fmtTime(t) + (sameTz ? '' : ' (' + fmtTime(t, MT) + ' Alberta time)');
    side.innerHTML = '<div class="bk-pick"><span><b>' + esc(when) + '</b><br>' + PLANS[plan].label + '</span><button type="button" class="bk-back" id="bkBack">Change</button></div>' +
      '<form class="bk-form" id="bkForm" novalidate>' +
      '<label>Full name<input name="name" autocomplete="name" required maxlength="120"></label>' +
      '<label>Email<input name="email" type="email" autocomplete="email" required maxlength="200"></label>' +
      '<label>Phone (optional)<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>' +
      '<label>What would you like help with?<textarea name="notes" maxlength="1500" placeholder="For example: spousal sponsorship, work permit, refugee claim…"></textarea></label>' +
      '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">' +
      '<label class="bk-check"><input type="checkbox" name="consent">I understand this is a $' + PLANS[plan].price + ' CAD consultation. I will receive a written consultation agreement and a secure payment link by email, and my appointment is confirmed once both are complete.</label>' +
      '<p class="bk-err" id="bkErr" role="alert"></p>' +
      '<button class="bk-go" type="submit">Confirm booking</button></form>';
    $('bkBack').addEventListener('click', function () { showTimes(selDay); });
    $('bkForm').addEventListener('submit', submit);
    side.querySelector('input[name=name]').focus();
  }

  function submit(e) {
    e.preventDefault();
    var f = e.target, err = $('bkErr'), btn = f.querySelector('.bk-go');
    var v = function (n) { return f.elements[n].value.trim(); };
    if (v('name').length < 2) { err.textContent = 'Please enter your full name.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) { err.textContent = 'Please enter a valid email address.'; return; }
    if (!f.elements.consent.checked) { err.textContent = 'Please tick the box to confirm.'; return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Booking…';
    var svc = serviceFor(plan), t = selSlot;
    api({ action: 'book', serviceId: svc.id, start: t.toISOString(), name: v('name'), email: v('email'), phone: v('phone'), notes: v('notes'),
          website: f.elements.website.value, consent: true, tz: MY_TZ })
      .then(function () {
        slotCache = {};
        side.innerHTML = '<div class="bk-done"><div class="bk-tick"><svg><use href="#i-check"/></svg></div><h4>You are booked!</h4>' +
          '<p><b>' + esc(fmtDay(t) + ' at ' + fmtTime(t)) + '</b>' + (sameTz ? '' : '<br>' + esc(fmtTime(t, MT)) + ' Alberta time') + '<br>' + PLANS[plan].label + '</p>' +
          '<p>A confirmation with your Microsoft Teams link is on its way to <b>' + esc(v('email')) + '</b>. We will also email your consultation agreement and payment link.</p></div>';
      })
      .catch(function (er) {
        btn.disabled = false; btn.textContent = 'Confirm booking'; err.textContent = er.message;
        if (er.data && er.data.taken) { slotCache = {}; setTimeout(loadMonth, 1800); }
      });
  }

  $('chGrid').addEventListener('click', function (e) {
    var b = e.target.closest('.ch-d'); if (!b) return;
    if (openDays[b.dataset.k]) { showTimes(b.dataset.k); return; }
    var p = b.dataset.k.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]), h = holidayOn(d);
    if (h) side.innerHTML = '<div class="bk-hint"><b>' + fmtDay(d) + '</b><br>' + esc(h) + ' (statutory holiday)</div>';
  });
  side.addEventListener('click', function (e) {
    var b = e.target.closest('.bk-time'); if (b) showForm(openDays[selDay][+b.dataset.i]);
  });
  $('chPrev').addEventListener('click', function () { view.setMonth(view.getMonth() - 1); selDay = null; loadMonth(); });
  $('chNext').addEventListener('click', function () { view.setMonth(view.getMonth() + 1); selDay = null; loadMonth(); });

  function choosePlan(p, scroll) {
    plan = p; selDay = null;
    document.querySelectorAll('.price-card').forEach(function (b) { b.classList.toggle('active', b.dataset.plan === p); });
    $('bookSelected').textContent = PLANS[p].label;
    $('bookLength').textContent = PLANS[p].short;
    if (scroll) $('bookLayout').scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadMonth();
  }
  document.querySelectorAll('.price-card').forEach(function (b) { b.addEventListener('click', function () { choosePlan(b.dataset.plan, true); }); });

  render(); hint();
  var pre = new URLSearchParams(location.search).get('length');
  api({ action: 'services' })
    .then(function (j) { services = j.services || []; })
    .catch(function (e) { services = []; setupError = e.message; })
    .then(function () { choosePlan(pre === '60' ? '60' : '30', pre === '30' || pre === '60'); });
})();
