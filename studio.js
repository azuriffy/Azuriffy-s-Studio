/* studio.js - shared behaviour for every page of Azuriffy's Studio
   Toasts, page transitions, back-to-top, scroll reveal, nav avatar + dropdowns,
   and the Supabase-backed game leaderboards. Needs config.js to load first. */
(function () {
  'use strict';
  var C = window.APP_CONFIG || {};
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  /* ------------------------------------------------------------------ session */
  function readSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          var v = JSON.parse(localStorage.getItem(k));
          if (v && v.access_token) return v;
        }
      }
    } catch (e) {}
    return null;
  }
  function sessionValid(s) { return !!(s && (!s.expires_at || s.expires_at * 1000 > Date.now())); }
  function safeUrl(u) { return typeof u === 'string' && /^https:\/\//i.test(u) ? u : null; }

  function userFrom(s) {
    if (!s || !s.user) return null;
    var u = s.user, m = u.user_metadata || {};
    var name = m.username || (m.custom_claims && m.custom_claims.global_name) || m.full_name || m.name ||
      (u.email ? u.email.split('@')[0] : '') || 'Member';
    return { id: u.id, email: u.email, name: String(name), avatar: safeUrl(m.custom_avatar) || safeUrl(m.avatar_url) || safeUrl(m.picture), meta: m };
  }
  function currentUser() { var s = readSession(); return sessionValid(s) ? userFrom(s) : null; }

  /* ----------------------------------------------------------- supabase client */
  var _sb = null, _sbp = null;
  function sbSync() {
    if (_sb) return _sb;
    try {
      if (window.supabase && C.SUPABASE_URL && C.SUPABASE_ANON_KEY && !/YOUR-/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY))
        _sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    } catch (e) { console.error(e); }
    return _sb;
  }
  function sbAsync() {
    if (sbSync()) return Promise.resolve(_sb);
    if (!_sbp) _sbp = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = SB_CDN; s.onload = function () { res(sbSync()); }; s.onerror = function () { _sbp = null; rej(new Error('Could not load Supabase')); };
      document.head.appendChild(s);
    });
    return _sbp;
  }
  function getToken() {
    var s = readSession();
    if (sessionValid(s)) return Promise.resolve(s.access_token);
    if (!s) return Promise.resolve(C.SUPABASE_ANON_KEY);
    // expired but refreshable: let the real client refresh it
    return sbAsync().then(function (sb) { return sb.auth.getSession(); })
      .then(function (r) { return (r && r.data && r.data.session && r.data.session.access_token) || C.SUPABASE_ANON_KEY; })
      .catch(function () { return C.SUPABASE_ANON_KEY; });
  }
  function rpc(fn, args, keepalive) {
    if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return Promise.reject(new Error('config'));
    return getToken().then(function (tok) {
      return fetch(C.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
        method: 'POST', keepalive: !!keepalive,
        headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {})
      });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
      return r.json();
    });
  }

  /* -------------------------------------------------------------------- avatars */
  function avatar(url, name, cls) {
    var w = document.createElement('span');
    w.className = 'st-av-wrap' + (cls ? ' ' + cls : '');
    var letter = (String(name || '?').trim().charAt(0) || '?').toUpperCase();
    url = safeUrl(url);
    if (url) {
      var i = new Image();
      i.className = 'st-av'; i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer';
      i.onerror = function () { i.remove(); w.textContent = letter; };
      i.src = url; w.appendChild(i);
    } else w.textContent = letter;
    return w;
  }

  /* --------------------------------------------------------------------- toasts */
  function toastHost() {
    var h = document.getElementById('st-toasts');
    if (!h) { h = document.createElement('div'); h.id = 'st-toasts'; h.setAttribute('role', 'status'); h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
    return h;
  }
  function toast(msg, type, opts) {
    opts = opts || {};
    var h = toastHost(), t = document.createElement('div');
    type = type || 'info';
    t.className = 'st-toast ' + type;
    var icons = { ok: '✓', err: '✕', info: 'i', trophy: '🏆' };
    var ic = document.createElement('span'); ic.className = 'ti'; ic.textContent = icons[type] || 'i';
    var tx = document.createElement('span'); tx.className = 'tx'; tx.textContent = msg;
    if (opts.href) { var a = document.createElement('a'); a.href = opts.href; a.textContent = opts.action || 'Open'; tx.appendChild(a); }
    var x = document.createElement('button'); x.className = 'tc'; x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    t.appendChild(ic); t.appendChild(tx); t.appendChild(x);
    while (h.children.length >= 4) h.removeChild(h.firstChild);
    h.appendChild(t);
    var gone = false;
    function close() { if (gone) return; gone = true; t.classList.add('out'); setTimeout(function () { t.remove(); }, 230); }
    x.onclick = close;
    setTimeout(close, opts.ms || (type === 'err' ? 6500 : 4500));
    return close;
  }
  function toastNext(msg, type) {
    try { sessionStorage.setItem('st_toast', JSON.stringify({ m: msg, t: type || 'ok' })); } catch (e) {}
  }
  function flushQueuedToast() {
    try {
      var q = sessionStorage.getItem('st_toast');
      if (q) { sessionStorage.removeItem('st_toast'); q = JSON.parse(q); toast(q.m, q.t); }
    } catch (e) {}
  }

  /* ----------------------------------------------------------- page transitions */
  function initTransitions() {
    if (reduce) return;
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return;
      var u; try { u = new URL(a.href, location.href); } catch (er) { return; }
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search) return;
      e.preventDefault();
      document.documentElement.classList.add('st-leaving');
      setTimeout(function () { location.href = u.href; }, 150);
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) document.documentElement.classList.remove('st-leaving'); });
  }

  /* ------------------------------------------------------------- back to top */
  function initBackToTop() {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'st-top'; b.setAttribute('aria-label', 'Back to top'); b.textContent = '↑';
    b.onclick = function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); };
    document.body.appendChild(b);
    var tick = false;
    function upd() { tick = false; b.classList.toggle('show', window.scrollY > 520); }
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }

  /* ------------------------------------------------------------ scroll reveal */
  function initReveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var sel = '.grid>.card,.grid>.stat,.stats>.stat,.ev,.steps>li,.rules>li,details,.st-member,.st-lb';
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('st-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    document.querySelectorAll(sel).forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      if (r.width && r.top > window.innerHeight) {
        el.classList.add('st-rv');
        el.style.transitionDelay = Math.min((i % 6) * 40, 200) + 'ms';
        io.observe(el);
      }
    });
  }

  /* -------------------------------------------------- skeletons for live counts */
  function initCountSkeletons() {
    document.querySelectorAll('[data-members],[data-online]').forEach(function (el) {
      if (el.textContent.trim() !== '—') return;
      el.classList.add('st-skel');
      var mo = new MutationObserver(function () {
        if (el.textContent.trim() !== '—') { el.classList.remove('st-skel'); mo.disconnect(); }
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
      setTimeout(function () { el.classList.remove('st-skel'); mo.disconnect(); }, 6000);
    });
  }

  /* --------------------------------------------------------------------- nav */
  function enhanceNav() {
    var nv = document.getElementById('nv');
    if (!nv) return;
    function size() {
      var l = nv.querySelector('.nv-links');
      if (l) nv.style.setProperty('--nvh', l.offsetHeight + 'px');
    }
    var file = location.pathname.split('/').pop() || 'index.html';

    function toDropdown(href, label, items) {
      var a = nv.querySelector('.nv-links > a.nv-l[href="' + href + '"]');
      if (!a) return;
      var dd = document.createElement('div'); dd.className = 'nv-dd';
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = a.className; btn.textContent = label;
      btn.setAttribute('aria-haspopup', 'true');
      var menu = document.createElement('div'); menu.className = 'nv-menu';
      items.forEach(function (it) {
        var l = document.createElement('a'); l.href = it[0]; l.textContent = it[1];
        if (it[0] === file) l.className = 'cur';
        menu.appendChild(l);
      });
      dd.appendChild(btn); dd.appendChild(menu);
      a.parentNode.replaceChild(dd, a);
      btn.addEventListener('click', function () {
        nv.querySelectorAll('.nv-dd.open').forEach(function (o) { if (o !== dd) o.classList.remove('open'); });
        dd.classList.toggle('open'); btn.setAttribute('aria-expanded', dd.classList.contains('open')); size();
      });
    }
    toDropdown('games.html', 'Games', [['games.html', 'All Games'], ['leaderboards.html', '🏆 Leaderboards']]);
    toDropdown('community.html', 'Community', [['community.html', 'Community'], ['team.html', 'Meet the Team']]);
    document.addEventListener('click', function (e) {
      if (!e.target.closest || e.target.closest('.nv-dd')) return;
      nv.querySelectorAll('.nv-dd.open').forEach(function (o) { o.classList.remove('open'); });
    });

    var cta = document.getElementById('nvcta'), u = currentUser();
    if (cta && u) {
      cta.classList.add('has-av');
      cta.setAttribute('aria-label', 'Open your dashboard (' + u.name + ')');
      cta.textContent = '';
      cta.appendChild(avatar(u.avatar, u.name));
      var s = document.createElement('span'); s.className = 'nm'; s.textContent = u.name; cta.appendChild(s);
    }
  }

  /* ------------------------------------------------------------- leaderboards */
  var GAMES = {
    snake:       { name: 'Snake',          icon: '🐍', lower: false, unit: '',        local: 'snake' },
    memory:      { name: 'Memory Match',   icon: '🧠', lower: true,  unit: ' moves',  local: 'mem' },
    reaction:    { name: 'Reaction Test',  icon: '⚡', lower: true,  unit: ' ms',     local: 'react' },
    clicker:     { name: 'Click Speed',    icon: '🖱️', lower: false, unit: ' CPS',    local: 'cps' },
    '2048':      { name: '2048',           icon: '🔢', lower: false, unit: '',        local: 'g2048' },
    tictactoe:   { name: 'Tic-Tac-Toe',    icon: '❌', lower: false, unit: ' wins',   local: 'tttw' },
    minesweeper: { name: 'Minesweeper',    icon: '💣', lower: true,  unit: 's',       local: 'mst' },
    whack:       { name: 'Whack-a-Zombie', icon: '🧟', lower: false, unit: '',        local: 'whk' },
    typing:      { name: 'Typing Test',    icon: '⌨️', lower: false, unit: ' WPM',    local: 'wpm' }
  };
  var LOCAL2GAME = {};
  Object.keys(GAMES).forEach(function (g) { LOCAL2GAME[GAMES[g].local] = g; });

  function fmtScore(game, v) {
    var g = GAMES[game] || { unit: '' };
    v = Number(v);
    var s = Number.isInteger(v) ? v.toLocaleString() : String(Math.round(v * 100) / 100);
    return s + g.unit;
  }
  function better(game, a, b) { return GAMES[game].lower ? a < b : a > b; }

  var boards = []; // mounted boards, so a new record can refresh them
  function mountBoard(el, game, opts) {
    opts = opts || {};
    var limit = opts.limit || 10;
    var me = currentUser();
    function skeleton() {
      el.className = 'st-lb'; el.innerHTML = '';
      for (var i = 0; i < Math.min(limit, 5); i++) {
        var r = document.createElement('div'); r.className = 'st-lb-row';
        r.innerHTML = '<span class="rk"><span class="st-skel-line" style="width:22px;margin:0 auto"></span></span><span class="pl"><span class="st-skel-line" style="width:' + (50 + (i * 11) % 30) + '%;margin:0"></span></span><span class="sc"><span class="st-skel-line" style="width:54px;margin:0"></span></span>';
        el.appendChild(r);
      }
    }
    function msg(html) { el.className = 'st-lb'; el.innerHTML = '<div class="st-lb-msg">' + html + '</div>'; }
    function load() {
      skeleton();
      rpc('get_leaderboard', { p_game: game, p_limit: limit }).then(function (rows) {
        if (!rows || !rows.length) {
          msg('No scores yet - be the first on the board! 🏆' + (me ? '' : '<br><a href="auth.html">Log in</a> to save your scores.'));
          return;
        }
        el.innerHTML = '';
        var hd = document.createElement('div'); hd.className = 'st-lb-row hd';
        hd.innerHTML = '<span style="text-align:center">#</span><span>Player</span><span>' + (GAMES[game].lower ? 'Best (lower wins)' : 'Best') + '</span>';
        el.appendChild(hd);
        var medals = ['🥇', '🥈', '🥉'];
        rows.forEach(function (r) {
          var row = document.createElement('div');
          var rk = Number(r.rank);
          row.className = 'st-lb-row' + (rk <= 3 ? ' top' + rk : '') + (r.is_me ? ' me' : '');
          var c1 = document.createElement('span'); c1.className = 'rk'; c1.textContent = rk <= 3 ? medals[rk - 1] : rk;
          var c2 = document.createElement('span'); c2.className = 'pl';
          c2.appendChild(avatar(r.avatar_url, r.username));
          var b = document.createElement('b'); b.textContent = r.username || 'Player'; c2.appendChild(b);
          if (r.is_me) { var y = document.createElement('span'); y.className = 'you'; y.textContent = 'YOU'; c2.appendChild(y); }
          var c3 = document.createElement('span'); c3.className = 'sc'; c3.textContent = fmtScore(game, r.score);
          row.appendChild(c1); row.appendChild(c2); row.appendChild(c3); el.appendChild(row);
        });
        if (!me) {
          var n = document.createElement('div'); n.className = 'st-lb-msg'; n.style.borderTop = '1px solid #241631';
          n.innerHTML = '<a href="auth.html">Log in</a> or <a href="auth.html#signup">create an account</a> to get your name on the board.';
          el.appendChild(n);
        }
      }).catch(function (e) {
        console.warn('leaderboard', e);
        msg('The leaderboard is unavailable right now. Please try again later.');
      });
    }
    var handle = { reload: load, game: game, el: el, destroy: function () { var i = boards.indexOf(handle); if (i > -1) boards.splice(i, 1); } };
    boards.push(handle);
    load();
    return handle;
  }
  function reloadBoards(game) { boards.forEach(function (b) { if (b.game === game) b.reload(); }); }

  var pending = {}, remoteBest = {}, submitTimer = null, warnedAnon = false;
  function rbKey(uid, g) { return 'st_rb_' + uid + '_' + g; }
  function getRB(uid, g) { try { var v = localStorage.getItem(rbKey(uid, g)); return v === null ? null : Number(v); } catch (e) { return null; } }
  function setRB(uid, g, v) { try { localStorage.setItem(rbKey(uid, g), String(v)); } catch (e) {} }

  // Called by each game whenever it records a score (via the game's own best() helper).
  function report(localKey, value) {
    var game = LOCAL2GAME[localKey];
    if (!game) return;
    var v = Number(value);
    if (!isFinite(v) || v <= 0) return;
    if (pending[game] === undefined || better(game, v, pending[game])) pending[game] = v;
    clearTimeout(submitTimer);
    submitTimer = setTimeout(flush, 2500);
  }
  function flush(keepalive) {
    var u = currentUser();
    var games = Object.keys(pending);
    if (!games.length) return;
    if (!u) {
      if (!warnedAnon && !keepalive) { warnedAnon = true; toast('Log in to save your scores to the leaderboard.', 'info', { href: 'auth.html', action: 'Log in', ms: 7000 }); }
      pending = {}; return;
    }
    games.forEach(function (g) {
      var v = pending[g]; delete pending[g];
      var rb = getRB(u.id, g);
      if (rb !== null && !better(g, v, rb)) return; // not a new personal best
      rpc('submit_score', { p_game: g, p_score: v }, keepalive).then(function (res) {
        if (!res) return;
        if (typeof res.best === 'number') setRB(u.id, g, res.best);
        if (res.updated) {
          toast('New personal best on the ' + GAMES[g].name + ' leaderboard: ' + fmtScore(g, v) + '!', 'trophy', { href: 'leaderboards.html#' + g, action: 'View', ms: 6000 });
          reloadBoards(g);
        }
      }).catch(function (e) { console.warn('submit_score', e); });
    });
  }
  // One-time upload of scores that were only saved on this device before accounts had leaderboards.
  function syncLocal() {
    var u = currentUser(); if (!u) return;
    var flag = 'st_synced_' + u.id;
    try { if (localStorage.getItem(flag)) return; } catch (e) { return; }
    var any = false;
    Object.keys(GAMES).forEach(function (g) {
      var raw; try { raw = localStorage.getItem(GAMES[g].local); } catch (e) {}
      var v = Number(raw);
      if (isFinite(v) && v > 0) { any = true; pending[g] = v; }
    });
    try { localStorage.setItem(flag, '1'); } catch (e) {}
    if (any) setTimeout(flush, 800);
  }
  window.addEventListener('pagehide', function () { clearTimeout(submitTimer); flush(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { clearTimeout(submitTimer); flush(true); } });

  /* ------------------------------------------------------------------- public */
  window.Studio = {
    toast: toast, toastNext: toastNext,
    user: currentUser, session: readSession,
    sb: sbSync, sbAsync: sbAsync, rpc: rpc, avatar: avatar,
    scores: { GAMES: GAMES, report: report, mount: mountBoard, fmt: fmtScore, syncLocal: syncLocal }
  };

  function ready() {
    flushQueuedToast();
    initTransitions();
    enhanceNav();
    initBackToTop();
    initCountSkeletons();
    initReveal();
    document.querySelectorAll('[data-lb]').forEach(function (el) {
      mountBoard(el, el.getAttribute('data-lb'), { limit: +el.getAttribute('data-limit') || 10 });
    });
    syncLocal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
