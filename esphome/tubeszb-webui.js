// TubesZB MGM210 Warre Edition - layout tweaks for the ESPHome web page (web_server v3).
// Baked into the firmware via web_server.js_include.
//  - content centred, entity groups in two columns (one column on narrow screens)
//  - the debug log becomes a collapsible window below the groups (click "Debug Log"),
//    newest line on top; open/closed is remembered in the browser
//  - web login: "Create login" dialog on first run, "Login settings" link under the page
//    (needs warre_auth.h in the firmware)
// The v3 page uses shadow DOM, so this script adds a <style> inside those shadow roots.
(function () {
  var KEY = 'warre.logOpen';

  var APP_CSS =
    'main.flex-grid-half{display:block!important;max-width:1280px;margin:0 auto!important;padding:0 16px}' +
    // keep both sections visible (the stock page hides one on a double click)
    'main.flex-grid-half .col{display:block!important;width:auto!important;margin:8px 0!important}';

  var G = 'div:has(> .tab-header)';
  var TABLE_CSS =
    G + '{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-auto-flow:row dense;column-gap:28px;align-items:start}' +
    // group 1, 3, 5, ... left; group 2, 4, ... right (header + content stay together)
    G + '>:nth-child(4n+1),' + G + '>:nth-child(4n+2){grid-column:1}' +
    G + '>:nth-child(4n+3),' + G + '>:nth-child(4n+4){grid-column:2}' +
    G + '>.singlebutton-row{grid-column:1/-1;text-align:center}' +
    '.tab-container{margin-bottom:14px}' +
    '@media (max-width:860px){' + G + '{display:block}}';

  var LOG_CSS =
    '.tab-header{cursor:pointer;user-select:none}' +
    '.tab-header::before{content:"\\25B8  ";display:inline-block;transition:transform .2s}' +
    ':host(.open) .tab-header::before{transform:rotate(90deg)}' +
    ':host(:not(.open)) .tab-container{display:none}' +
    '.logs{max-height:360px;overflow-y:auto}' +
    '.tbody{display:flex;flex-direction:column-reverse}';

  function add(root, id, css) {
    if (root && !root.querySelector('style#' + id)) {
      var s = document.createElement('style');
      s.id = id;
      s.textContent = css;
      root.appendChild(s);
      return true;
    }
    return false;
  }

  function isOpen() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  function setOpen(log, open) {
    log.classList.toggle('open', open);
    try { localStorage.setItem(KEY, open ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  function setupLog(log) {
    if (!log || !log.shadowRoot) return;
    if (add(log.shadowRoot, 'warre', LOG_CSS)) {
      log.classList.toggle('open', isOpen());
      log.shadowRoot.addEventListener('click', function (ev) {
        var h = ev.target.closest && ev.target.closest('.tab-header');
        if (h) setOpen(log, !log.classList.contains('open'));
      });
      // stop the stock double click (it would hide the entity groups)
      log.shadowRoot.addEventListener('dblclick', function (ev) { ev.stopPropagation(); }, true);
    }
  }

  function apply() {
    var app = document.querySelector('esp-app');
    if (!app || !app.shadowRoot) return;
    add(app.shadowRoot, 'warre', APP_CSS);
    var table = app.shadowRoot.querySelector('esp-entity-table');
    if (table && table.shadowRoot) add(table.shadowRoot, 'warre', TABLE_CSS);
    setupLog(app.shadowRoot.querySelector('esp-log'));
  }

  // The app builds itself asynchronously and may re-create parts: keep checking.
  apply();
  setInterval(apply, 1000);

  // --- Web login (see warre_auth.h) ----------------------------------------------------------
  // First run: a "Create login" dialog. Afterwards a "Login settings" link under the page to
  // change the login or switch it off. The login itself is the browser's own Digest prompt.

  var DLG_CSS =
    '#warre-login-link{display:block;margin:4px auto 24px;padding:6px 14px;border:1px solid #7f7f7f40;' +
    'border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:.9rem;opacity:.75;cursor:pointer}' +
    '#warre-login-link:hover{opacity:1}' +
    '#warre-dlg{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;' +
    'background:#0008;padding:16px}' +
    '#warre-dlg form{width:100%;max-width:380px;background:#fff;color:#111;border-radius:14px;padding:22px;' +
    'box-shadow:0 10px 40px #0006;font-family:system-ui,sans-serif}' +
    '@media (prefers-color-scheme:dark){#warre-dlg form{background:#1e1e1e;color:#eee}}' +
    '#warre-dlg h2{margin:0 0 6px;font-size:1.25rem}' +
    '#warre-dlg p{margin:0 0 14px;font-size:.9rem;opacity:.8;line-height:1.35}' +
    '#warre-dlg label{display:block;font-size:.85rem;margin:10px 0 4px}' +
    '#warre-dlg input{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:8px;border:1px solid #7f7f7f80;' +
    'background:transparent;color:inherit;font:inherit}' +
    '#warre-dlg .err{color:#d33;font-size:.85rem;min-height:1.2em;margin:10px 0 0}' +
    '#warre-dlg .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}' +
    '#warre-dlg button{padding:9px 14px;border-radius:8px;border:1px solid #7f7f7f80;background:transparent;' +
    'color:inherit;font:inherit;cursor:pointer}' +
    '#warre-dlg button.primary{background:#03a9f4;border-color:#03a9f4;color:#fff}';

  var authState = null;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }

  function post(path, data) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data || {}).toString(),
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return { ok: r.ok }; });
    });
  }

  function closeDialog() {
    var d = document.getElementById('warre-dlg');
    if (d) d.remove();
  }

  function showDialog(mode) {
    // mode: 'setup' (first run), 'change' (login on), 'enable' (login off)
    closeDialog();
    var titles = { setup: 'Create a login', change: 'Login settings', enable: 'Login settings' };
    var texts = {
      setup: 'Protect this page with a username and password. You can also continue without a ' +
        'login and set one later via "Login settings" at the bottom of the page.',
      change: 'Logged in as "' + (authState && authState.user) + '". Enter a new username and ' +
        'password, or turn the login off.',
      enable: 'The login is off: anyone on your network can open this page. Set a username and ' +
        'password to turn it on.'
    };
    var wrap = el('div', { id: 'warre-dlg' });
    var f = el('form', { autocomplete: 'on' });
    f.appendChild(el('h2', {}, titles[mode]));
    f.appendChild(el('p', {}, texts[mode]));
    f.appendChild(el('label', { for: 'warre-u' }, 'Username'));
    var u = el('input', { id: 'warre-u', name: 'username', autocomplete: 'username', maxlength: '32', required: '' });
    if (mode === 'change' && authState) u.value = authState.user;
    f.appendChild(u);
    f.appendChild(el('label', { for: 'warre-p' }, 'New password (8-64 characters)'));
    var p = el('input', { id: 'warre-p', type: 'password', autocomplete: 'new-password', maxlength: '64', required: '' });
    f.appendChild(p);
    f.appendChild(el('label', { for: 'warre-p2' }, 'Repeat password'));
    var p2 = el('input', { id: 'warre-p2', type: 'password', autocomplete: 'new-password', maxlength: '64', required: '' });
    f.appendChild(p2);
    var err = el('div', { class: 'err' });
    f.appendChild(err);
    var row = el('div', { class: 'row' });
    var off = el('button', { type: 'button' }, mode === 'setup' ? 'Continue without login' : (mode === 'change' ? 'Turn login off' : 'Cancel'));
    var save = el('button', { type: 'submit', class: 'primary' }, mode === 'setup' ? 'Create login' : 'Save login');
    if (mode !== 'setup') {
      var cancel = el('button', { type: 'button' }, 'Cancel');
      cancel.onclick = closeDialog;
      if (mode === 'change') row.appendChild(cancel);
    }
    row.appendChild(off);
    row.appendChild(save);
    f.appendChild(row);

    off.onclick = function () {
      if (mode === 'enable') { closeDialog(); return; }
      if (mode === 'change' && !confirm('Turn the login off? Anyone on your network can then open this page.')) return;
      post('/warre/auth/disable').then(function () { closeDialog(); refresh(); });
    };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      err.textContent = '';
      if (p.value !== p2.value) { err.textContent = 'The passwords do not match.'; return; }
      save.disabled = true;
      post('/warre/auth/set', { user: u.value.trim(), pass: p.value }).then(function (res) {
        save.disabled = false;
        if (!res.ok) { err.textContent = res.error || 'Could not save the login.'; return; }
        closeDialog();
        alert('Login saved. Your browser will now ask for the new username and password.');
        location.reload();
      }, function () {
        save.disabled = false;
        err.textContent = 'No connection to the device.';
      });
    };

    wrap.appendChild(f);
    document.body.appendChild(wrap);
    u.focus();
  }

  function refresh() {
    fetch('/warre/auth', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (s) {
      authState = s;
      if (s.state === 'unset') showDialog('setup');
    }, function () { /* older firmware without the login module */ });
  }

  function initLogin() {
    add(document.head, 'warre-dlg-css', DLG_CSS);
    if (!document.getElementById('warre-login-link')) {
      var b = el('button', { id: 'warre-login-link', type: 'button' }, 'Login settings');
      b.onclick = function () {
        if (!authState) return;
        showDialog(authState.state === 'enabled' ? 'change' : (authState.state === 'unset' ? 'setup' : 'enable'));
      };
      document.body.appendChild(b);
    }
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLogin);
  else initLogin();
})();
