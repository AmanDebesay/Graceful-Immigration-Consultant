// Booking page: the time, weather and Canadian holidays, and an Outlook-style week calendar where clients click an
// open time and book it in place, through Microsoft Bookings (the "booking" function returns open times and creates the appointment).
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

  // ── Booking: an Outlook-style week calendar. Open times sit in the calendar; click one to book it right there. ──
  var plan = '30', services = null, setupError = null;
  var slots = {}, covered = {}, booked = [], anchor = null, sel = null, loading = false, firstJump = true;
  var body = $('wkBody'), pop = null;
  var HOUR = 56;

  function serviceFor(p) {
    if (!services) return null;
    return services.filter(function (s) { return s.minutes === PLANS[p].minutes; })[0] || null;
  }
  var addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0, 0, 0, 0); return x; };
  var perView = function () { return innerWidth < 640 ? 1 : innerWidth < 980 ? 3 : 7; };
  function viewStart() {
    var n = perView();
    if (n === 7) { var s = addDays(anchor, 0); s.setDate(s.getDate() - s.getDay()); return s; }
    return addDays(anchor, 0);
  }
  var hm = function (d) { return d.getHours() + d.getMinutes() / 60; };

  // Open times come in 42-day windows, cached per consultation length.
  function ensure(from) {
    var svc = serviceFor(plan); if (!svc) return Promise.resolve();
    var key = svc.id, have = covered[key] || [];
    var start = from < today ? today : from, end = addDays(start, perView());
    if (have.some(function (w) { return w[0] <= start && w[1] >= end; })) return Promise.resolve();
    loading = true; draw();
    var winFrom = addDays(start, -1);
    return api({ action: 'slots', serviceId: svc.id, from: dkey(winFrom), days: 42 }).then(function (j) {
      slots[key] = (slots[key] || []).concat(j.slots.map(function (s) { return new Date(s); }))
        .filter(function (d, i, a) { return a.findIndex(function (x) { return +x === +d; }) === i; }).sort(function (a, b) { return a - b; });
      (covered[key] = have).push([start, addDays(winFrom, 41)]);
    }).catch(function (e) { setupError = e.message; }).then(function () { loading = false; });
  }
  function slotsIn(a, b) { var svc = serviceFor(plan); return ((svc && slots[svc.id]) || []).filter(function (d) { return d >= a && d < b; }); }

  function draw() {
    closePop();
    var n = perView(), s = viewStart(), e = addDays(s, n), list = slotsIn(s, e), svc = serviceFor(plan);
    var mins = PLANS[plan].minutes;
    var lo = 8, hi = 18;
    list.concat(booked.map(function (b) { return b.t; })).forEach(function (d) { lo = Math.min(lo, Math.floor(hm(d))); hi = Math.max(hi, Math.ceil(hm(d) + mins / 60)); });
    hi = Math.min(hi, 24);
    var last = addDays(e, -1);
    $('wkRange').textContent = n === 1 ? fmtDay(s) : s.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' – ' +
      (last.getMonth() === s.getMonth() ? last.getDate() : last.toLocaleDateString([], { month: 'short', day: 'numeric' })) + ', ' + last.getFullYear();
    $('wkPrev').disabled = s <= today;
    document.querySelectorAll('.wk-len button').forEach(function (b) { b.classList.toggle('on', b.dataset.plan === plan); });

    var head = '<div class="wk-corner">' + (sameTz ? '' : '<small>Your time</small>') + '</div>', cols = '', gut = '';
    for (var h = lo; h < hi; h++) gut += '<div class="wk-hr" style="top:' + (h - lo) * HOUR + 'px">' + new Date(2026, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' }) + '</div>';
    for (var i = 0; i < n; i++) {
      var d = addDays(s, i), k = dkey(d), hol = holidayOn(d), isToday = +d === +today, past = d < today;
      head += '<div class="wk-dh' + (isToday ? ' today' : '') + '"><span>' + d.toLocaleDateString([], { weekday: 'short' }) + '</span><b>' + d.getDate() + '</b>' + (hol ? '<em title="' + esc(hol) + '">' + esc(hol) + '</em>' : '') + '</div>';
      var blocks = list.filter(function (t) { return dkey(t) === k; }).map(function (t) {
        var top = (hm(t) - lo) * HOUR, ht = Math.min(mins, 30) / 60 * HOUR - 4, isSel = sel && +sel === +t;
        return '<button type="button" class="wk-slot' + (isSel ? ' sel' : '') + '" data-t="' + t.toISOString() + '" style="top:' + top + 'px;height:' + ht + 'px" aria-label="Book ' + esc(fmtDay(t) + ' at ' + fmtTime(t)) + '">' + fmtTime(t) + '</button>';
      }).join('') + booked.filter(function (b) { return dkey(b.t) === k; }).map(function (b) {
        return '<div class="wk-ev" style="top:' + (hm(b.t) - lo) * HOUR + 'px;height:' + (mins / 60 * HOUR - 4) + 'px"><b>✓ Booked</b><span>' + fmtTime(b.t) + ' · ' + esc(b.name) + '</span></div>';
      }).join('');
      cols += '<div class="wk-col' + (isToday ? ' today' : '') + (hol ? ' hol' : '') + (past ? ' past' : '') + '" data-k="' + k + '">' + blocks + '</div>';
    }
    var nowLine = '';
    var nowD = new Date(); if (nowD >= s && nowD < e && hm(nowD) >= lo && hm(nowD) < hi) {
      var ci = Math.floor((addDays(nowD, 0) - s) / 864e5);
      nowLine = '<div class="wk-now" style="top:' + (hm(nowD) - lo) * HOUR + 'px;left:calc(var(--gut) + (100% - var(--gut)) / ' + n + ' * ' + ci + ');width:calc((100% - var(--gut)) / ' + n + ')"></div>';
    }
    var msg = '';
    if (setupError) msg = '<div class="wk-msg"><b>Online booking is paused for a moment.</b><span>' + esc(setupError) + '</span><span>Please call <a href="tel:+14039154230">(403) 915-4230</a>, email <a href="mailto:info@gracefulimmigration.ca">info@gracefulimmigration.ca</a>, or use <a href="' + BOOKINGS_PAGE + '" target="_blank" rel="noopener">our Microsoft booking page</a>.</span></div>';
    else if (services && !svc) msg = '<div class="wk-msg"><b>Online booking for the ' + PLANS[plan].short + ' consultation opens soon.</b><span>Please call <a href="tel:+14039154230">(403) 915-4230</a>.</span></div>';
    else if (loading) msg = '<div class="wk-msg soft"><span class="wk-spin"></span><span>Finding open times…</span></div>';
    else if (!list.length) {
      var next = slotsIn(e, addDays(e, 400))[0];
      msg = '<div class="wk-msg soft"><b>No open times ' + (n === 1 ? 'on this day' : 'in these days') + '.</b>' + (next ? '<button type="button" class="wk-next" data-go="' + next.toISOString() + '">Next available: ' + esc(fmtDay(next) + ', ' + fmtTime(next)) + ' ›</button>' : '<span>Please check the following weeks.</span>') + '</div>';
    }
    body.style.setProperty('--n', n);
    body.innerHTML = '<div class="wk-head">' + head + '</div><div class="wk-scroll"><div class="wk-grid" style="height:' + (hi - lo) * HOUR + 'px"><div class="wk-gut">' + gut + '</div>' + cols +
      '<div class="wk-lines">' + Array.apply(null, Array(hi - lo)).map(function (_, j) { return '<i style="top:' + j * HOUR + 'px"></i><i class="half" style="top:' + (j * HOUR + HOUR / 2) + 'px"></i>'; }).join('') + '</div>' + nowLine + '</div></div>' + msg;
    var sc = body.querySelector('.wk-scroll'), firstSlot = body.querySelector('.wk-slot');
    if (firstSlot) sc.scrollTop = Math.max(0, firstSlot.offsetTop - 40);
  }

  function go(date) { anchor = addDays(date, 0); ensure(viewStart()).then(draw); draw(); }

  // ── The booking card, like a new meeting in Outlook ──
  function closePop() { if (pop) { pop.remove(); pop = null; } if (sel) { var b = body.querySelector('.wk-slot.sel'); if (b) b.classList.remove('sel'); } }
  function openPop(btn) {
    var t = new Date(btn.dataset.t), end = new Date(+t + PLANS[plan].minutes * 6e4);
    closePop(); sel = t; btn.classList.add('sel');
    pop = document.createElement('div'); pop.className = 'wk-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Book this time');
    pop.innerHTML = '<div class="wk-pop-h"><span class="wk-pop-bar"></span><div><b>' + PLANS[plan].label + '</b><small>with Aman Debesay, RCIC-IRB</small></div><button type="button" class="wk-x" aria-label="Close">×</button></div>' +
      '<div class="wk-pop-when"><svg><use href="#i-clock"/></svg><span><b>' + esc(t.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })) + '</b><br>' + esc(fmtTime(t) + ' – ' + fmtTime(end)) + (sameTz ? '' : ' your time · ' + esc(fmtTime(t, MT)) + ' Alberta') + '</span></div>' +
      '<div class="wk-pop-when"><svg><use href="#i-phone"/></svg><span>Microsoft Teams video call · link sent by email</span></div>' +
      '<form class="wk-form" novalidate>' +
      '<input name="name" autocomplete="name" maxlength="120" placeholder="Your full name" required aria-label="Full name">' +
      '<input name="email" type="email" autocomplete="email" maxlength="200" placeholder="Email address" required aria-label="Email">' +
      '<input name="phone" type="tel" autocomplete="tel" maxlength="40" placeholder="Phone (optional)" aria-label="Phone">' +
      '<textarea name="notes" maxlength="1500" rows="2" placeholder="What would you like help with? (optional)" aria-label="What would you like help with"></textarea>' +
      '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">' +
      '<label class="wk-check"><input type="checkbox" name="consent"><span>I understand this is a $' + PLANS[plan].price + ' CAD consultation. I will receive a consultation agreement and a secure payment link by email; my time is confirmed once both are done.</span></label>' +
      '<p class="wk-err" role="alert"></p>' +
      '<div class="wk-pop-f"><button type="button" class="wk-cancel">Cancel</button><button type="submit" class="wk-book">Book this time</button></div></form>';
    $('calendar').appendChild(pop);
    place(btn);
    pop.querySelector('.wk-x').onclick = pop.querySelector('.wk-cancel').onclick = function () { closePop(); sel = null; };
    pop.querySelector('form').onsubmit = function (ev) { submit(ev, t); };
    setTimeout(function () { pop && pop.querySelector('input[name=name]').focus({ preventScroll: true }); }, 30);
  }
  function place(btn) {
    if (innerWidth < 640) { pop.classList.add('sheet'); return; }
    var card = $('calendar').getBoundingClientRect(), r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var left = r.right - card.left + 10; if (left + w > card.width - 10) left = r.left - card.left - w - 10;
    var top = Math.min(Math.max(r.top - card.top - 20, 10), card.height - h - 10);
    pop.style.left = Math.max(10, left) + 'px'; pop.style.top = Math.max(10, top) + 'px';
  }

  function submit(ev, t) {
    ev.preventDefault();
    var f = ev.target, err = f.querySelector('.wk-err'), btn = f.querySelector('.wk-book');
    var v = function (n) { return f.elements[n].value.trim(); };
    if (v('name').length < 2) { err.textContent = 'Please enter your full name.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) { err.textContent = 'Please enter a valid email address.'; return; }
    if (!f.elements.consent.checked) { err.textContent = 'Please tick the box to confirm.'; return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Booking…';
    var svc = serviceFor(plan);
    api({ action: 'book', serviceId: svc.id, start: t.toISOString(), name: v('name'), email: v('email'), phone: v('phone'), notes: v('notes'), website: f.elements.website.value, consent: true, tz: MY_TZ })
      .then(function (res) {
        var key = svc.id; slots[key] = (slots[key] || []).filter(function (d) { return +d !== +t; });
        booked.push({ t: t, name: v('name') }); sel = null;
        var email = v('email'); draw();
        pop = document.createElement('div'); pop.className = 'wk-pop wk-done' + (innerWidth < 640 ? ' sheet' : '');
        pop.innerHTML = '<button type="button" class="wk-x" aria-label="Close">×</button><div class="bk-tick"><svg><use href="#i-check"/></svg></div><h4>You are booked!</h4><p><b>' + esc(fmtDay(t) + ' at ' + fmtTime(t)) + '</b>' + (sameTz ? '' : '<br>' + esc(fmtTime(t, MT)) + ' Alberta time') + '<br>' + PLANS[plan].label + '</p><p>A confirmation with your Microsoft Teams link is on its way to <b>' + esc(email) + '</b>. We will also email your consultation agreement and payment link.</p>' +
          (res && res.joinUrl ? '<a class="wk-join" href="' + esc(res.joinUrl) + '" target="_blank" rel="noopener">Your Microsoft Teams link</a><p class="wk-small">Save this link. Use it to join at the time of your consultation.</p>' : '');
        $('calendar').appendChild(pop);
        var ev2 = body.querySelector('.wk-ev:last-of-type'); if (ev2 && innerWidth >= 640) place(ev2);
        pop.querySelector('.wk-x').onclick = closePop;
      })
      .catch(function (er) {
        btn.disabled = false; btn.textContent = 'Book this time'; err.textContent = er.message;
        if (er.data && er.data.taken) { var key = svc.id; covered[key] = []; slots[key] = []; setTimeout(function () { go(anchor); }, 1500); }
      });
  }

  body.addEventListener('click', function (e) {
    var b = e.target.closest('.wk-slot'); if (b) return openPop(b);
    var n = e.target.closest('.wk-next'); if (n) return go(new Date(n.dataset.go));
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop) { closePop(); sel = null; } });
  document.addEventListener('mousedown', function (e) { if (pop && !pop.contains(e.target) && !e.target.closest('.wk-slot')) { closePop(); sel = null; } });
  $('wkPrev').onclick = function () { go(addDays(viewStart(), -perView())); };
  $('wkNext').onclick = function () { go(addDays(viewStart(), perView())); };
  $('wkToday').onclick = function () { go(today); };
  var lastN = perView(); addEventListener('resize', function () { if (perView() !== lastN) { lastN = perView(); draw(); } else if (pop && !pop.classList.contains('sheet')) { var b = body.querySelector('.wk-slot.sel'); if (b) place(b); } });

  function choosePlan(p, scroll) {
    plan = p; sel = null;
    document.querySelectorAll('.price-card').forEach(function (b) { b.classList.toggle('active', b.dataset.plan === p); });
    $('bookSelected').textContent = PLANS[p].label;
    $('bookLength').textContent = PLANS[p].short;
    if (scroll) $('bookLayout').scrollIntoView({ behavior: 'smooth', block: 'start' });
    ensure(viewStart()).then(function () {
      // First visit: jump to the week with the next open time
      var all = slotsIn(today, addDays(today, 60));
      if (firstJump && all.length && !slotsIn(viewStart(), addDays(viewStart(), perView())).length) { anchor = addDays(all[0], 0); firstJump = false; return ensure(viewStart()); }
      firstJump = false;
    }).then(draw);
    draw();
  }
  document.querySelectorAll('.price-card').forEach(function (b) { b.addEventListener('click', function () { choosePlan(b.dataset.plan, true); }); });
  document.querySelectorAll('.wk-len button').forEach(function (b) { b.addEventListener('click', function () { choosePlan(b.dataset.plan, false); }); });

  anchor = addDays(today, 0); draw();
  var pre = new URLSearchParams(location.search).get('length');
  api({ action: 'services' })
    .then(function (j) { services = j.services || []; })
    .catch(function (e) { services = []; setupError = e.message; })
    .then(function () { choosePlan(pre === '60' ? '60' : '30', pre === '30' || pre === '60'); });
})();
