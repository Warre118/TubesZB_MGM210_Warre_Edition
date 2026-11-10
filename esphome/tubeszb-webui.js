// TubesZB MGM210 Warre Edition - layout tweaks for the ESPHome web page (web_server v3).
// Baked into the firmware via web_server.js_include.
//  - content centred, entity groups in two columns (one column on narrow screens)
//  - "Maintenance" and a "Debug Log" window side by side, both only after "Show All"
//  - web login: "Create login" dialog on first run; "Login settings" row in Maintenance
//    (needs warre_auth.h in the firmware)
// The v3 page uses shadow DOM, so this script adds <style> and elements inside those shadow roots.
(function () {
  var MAINT = 'Maintenance';
  var RESET_ENTITY = 'Reset web login';   // stays in Home Assistant, hidden on the page
  var LOG_ROWS = 200;

  var APP_CSS =
    'main.flex-grid-half{display:block!important;max-width:1280px;margin:0 auto!important;padding:0 16px}' +
    'main.flex-grid-half .col{display:block!important;width:auto!important;margin:8px 0!important}' +
    // the stock log column is replaced by our own window next to Maintenance
    '#col_logs{display:none!important}';

  var G = 'div:has(> .tab-header)';
  var TABLE_CSS =
    G + '{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-auto-flow:row dense;column-gap:28px;align-items:start}' +
    // group 1, 3, 5, ... left; group 2, 4, ... right (header + content stay together)
    G + '>:nth-child(4n+1),' + G + '>:nth-child(4n+2){grid-column:1}' +
    G + '>:nth-child(4n+3),' + G + '>:nth-child(4n+4){grid-column:2}' +
    G + '>.singlebutton-row{grid-column:1/-1;text-align:center}' +
    '.tab-container{margin-bottom:14px}' +
    '.warre-hidden{display:none!important}' +
    // log window
    // newest line on top (inserted as first child); same height as the Maintenance list
    '.warre-log{font-family:monospace;font-size:13px;line-height:1.35;height:200px;overflow:auto;padding:8px 10px}' +
    '.warre-log div{white-space:pre-wrap;word-break:break-word;padding:1px 0}' +
    '.warre-log .t{opacity:.55;margin-right:6px}.warre-log .g{opacity:.7;margin-right:6px}' +
    '.warre-log .E{color:#e53935;font-weight:700}.warre-log .W{color:#c9a400}.warre-log .I{color:#2e9d3a}' +
    '.warre-log .D{color:#0aa}.warre-log .V{color:#888}' +
    '.warre-log .empty{opacity:.6;font-style:italic}' +
    '@media (max-width:860px){' + G + '{display:block}}';

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

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }

  // --- Debug log window ----------------------------------------------------------------------

  var logLines = [];          // newest last
  var logBox = null;          // the scrolling element, re-used when the panel is re-inserted
  var logHooked = false;

  function renderLogLine(l) {
    var d = el('div', { class: l.level });
    d.appendChild(el('span', { class: 't' }, l.time));
    d.appendChild(el('span', { class: 'g' }, '[' + l.level + '][' + l.tag + ']'));
    d.appendChild(document.createTextNode(l.msg));
    return d;
  }

  function onLog(ev) {
    // ESPHome sends e.g. "\x1b[0;32m[I][uart_tcp:073]: Client connected...\x1b[0m"
    var raw = String(ev.data).replace(/\x1b\[[0-9;]*m/g, '');
    var m = raw.match(/^\[(\w)\]\[([^\]]*)\]:?\s?([\s\S]*)$/);
    var line = {
      time: new Date().toTimeString().split(' ')[0],
      level: m ? m[1] : 'I',
      tag: m ? m[2].split(':')[0] : '',
      msg: m ? m[3] : raw
    };
    logLines.push(line);
    if (logLines.length > LOG_ROWS) logLines.shift();
    if (logBox) {
      var empty = logBox.querySelector('.empty');
      if (empty) empty.remove();
      logBox.insertBefore(renderLogLine(line), logBox.firstChild);   // newest on top
      while (logBox.childNodes.length > LOG_ROWS) logBox.removeChild(logBox.lastChild);
    }
  }

  function hookLog() {
    if (!logHooked && window.source && window.source.addEventListener) {
      window.source.addEventListener('log', onLog);
      logHooked = true;
    }
  }

  function makeLogPanel() {
    var hdr = el('div', { class: 'tab-header warre-loghdr' }, 'Debug Log');
    var cont = el('div', { class: 'tab-container warre-logcont' });
    if (!logBox) {
      logBox = el('div', { class: 'warre-log' });
      for (var i = 0; i < logLines.length; i++) logBox.insertBefore(renderLogLine(logLines[i]), logBox.firstChild);
      if (!logLines.length) logBox.appendChild(el('div', { class: 'empty' }, 'Waiting for log messages (level INFO and up)...'));
    }
    cont.appendChild(logBox);
    return [hdr, cont];
  }

  // --- Maintenance group: only after "Show All", log window next to it --------------------------

  function arrangeTable(table) {
    var root = table.shadowRoot;
    var grid = root.querySelector(G);
    if (!grid) return;
    var showAll = !!table.show_all;

    var maintHdr = null;
    var headers = grid.querySelectorAll(':scope > .tab-header:not(.warre-loghdr)');
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].textContent.trim() === MAINT) maintHdr = headers[i];
    }
    var maintCont = maintHdr ? maintHdr.nextElementSibling : null;

    // hide the "Reset web login" row (it lives in the Login settings dialog instead)
    if (maintCont) {
      var rows = maintCont.querySelectorAll('.entity-row');
      for (var r = 0; r < rows.length; r++) {
        var name = rows[r].children[1] ? rows[r].children[1].textContent.trim() : '';
        if (name === RESET_ENTITY) rows[r].classList.add('warre-hidden');
      }
      if (!maintCont.querySelector('.warre-loginrow')) maintCont.insertBefore(makeLoginRow(), maintCont.firstChild);
    }

    // Maintenance only after "Show All"
    if (maintHdr) {
      maintHdr.classList.toggle('warre-hidden', !showAll);
      maintCont.classList.toggle('warre-hidden', !showAll);
    }

    // log window right after Maintenance (next grid cell = right column), only after "Show All"
    var lh = grid.querySelector(':scope > .warre-loghdr');
    var lc = grid.querySelector(':scope > .warre-logcont');
    if (showAll && maintCont) {
      if (!lh || !lc) {
        var p = makeLogPanel();
        lh = p[0];
        lc = p[1];
      }
      if (maintCont.nextElementSibling !== lh) maintCont.after(lh);
      if (lh.nextElementSibling !== lc) lh.after(lc);
    } else {
      if (lh) lh.remove();
      if (lc) lc.remove();
    }
  }

  function makeLoginRow() {
    // same markup as the stock entity rows, so it looks like a normal button row
    var row = el('div', { class: 'entity-row warre-loginrow' });
    var ic = el('div');
    ic.appendChild(el('iconify-icon', { icon: 'mdi:account-lock', height: '24px' }));
    row.appendChild(ic);
    row.appendChild(el('div', {}, 'Login settings'));
    var c = el('div');
    var b = el('button', { class: 'abutton', type: 'button' }, 'Open');
    b.onclick = function (ev) {
      ev.stopPropagation();
      openLoginSettings();
    };
    c.appendChild(b);
    row.appendChild(c);
    return row;
  }

  function apply() {
    var app = document.querySelector('esp-app');
    if (!app || !app.shadowRoot) return;
    add(app.shadowRoot, 'warre', APP_CSS);
    var table = app.shadowRoot.querySelector('esp-entity-table');
    if (table && table.shadowRoot) {
      add(table.shadowRoot, 'warre', TABLE_CSS);
      arrangeTable(table);
    }
    hookLog();
  }

  // The app builds itself asynchronously and re-renders parts: keep checking.
  apply();
  setInterval(apply, 500);

  // --- Web login (see warre_auth.h) ----------------------------------------------------------
  // First run: a "Create login" dialog. Later: Maintenance -> "Login settings" to change the login,
  // turn it off or reset it. The login itself is the browser's own Digest prompt.

  var DLG_CSS =
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
    '#warre-dlg .row.left{justify-content:flex-start;border-top:1px solid #7f7f7f40;padding-top:12px}' +
    '#warre-dlg button{padding:9px 14px;border-radius:8px;border:1px solid #7f7f7f80;background:transparent;' +
    'color:inherit;font:inherit;cursor:pointer}' +
    '#warre-dlg button.primary{background:#03a9f4;border-color:#03a9f4;color:#fff}' +
    '#warre-dlg button.danger{border-color:#e53935;color:#e53935}';

  var authState = null;

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
        'login and set one later via Maintenance > "Login settings" (after "Show All").',
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
    if (mode === 'setup') {
      var skip = el('button', { type: 'button' }, 'Continue without login');
      skip.onclick = function () { post('/warre/auth/disable').then(function () { closeDialog(); refresh(); }); };
      row.appendChild(skip);
    } else {
      var cancel = el('button', { type: 'button' }, 'Cancel');
      cancel.onclick = closeDialog;
      row.appendChild(cancel);
    }
    var save = el('button', { type: 'submit', class: 'primary' }, mode === 'setup' ? 'Create login' : 'Save login');
    row.appendChild(save);
    f.appendChild(row);

    if (mode !== 'setup') {
      var extra = el('div', { class: 'row left' });
      if (mode === 'change') {
        var off = el('button', { type: 'button' }, 'Turn login off');
        off.onclick = function () {
          if (!confirm('Turn the login off? Anyone on your network can then open this page.')) return;
          post('/warre/auth/disable').then(function () { closeDialog(); refresh(); });
        };
        extra.appendChild(off);
      }
      var reset = el('button', { type: 'button', class: 'danger' }, 'Reset web login');
      reset.onclick = function () {
        if (!confirm('Reset the web login? The username and password are erased and the page asks for a new login.')) return;
        post('/warre/auth/reset').then(function () { closeDialog(); refresh(); });
      };
      extra.appendChild(reset);
      f.appendChild(extra);
    }

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
    return fetch('/warre/auth', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (s) {
      authState = s;
      if (s.state === 'unset') showDialog('setup');
      return s;
    }, function () { /* older firmware without the login module */ });
  }

  function openLoginSettings() {
    refresh().then(function (s) {
      if (s && s.state !== 'unset') showDialog(s.state === 'enabled' ? 'change' : 'enable');
    });
  }

  add(document.head, 'warre-dlg-css', DLG_CSS);
  refresh();
})();
