// TubesZB MGM210 Warre Edition - layout tweaks for the ESPHome web page (web_server v3).
// Baked into the firmware via web_server.js_include.
//  - content centred, entity groups in two columns (one column on narrow screens)
//  - "Maintenance" and a "Debug Log" window side by side, both only after "Show All"
//  - web login: "Create login" dialog on first run; "Login settings" row in Maintenance
//    (needs warre_auth.h in the firmware)
// The v3 page uses shadow DOM, so this script adds <style> and elements inside those shadow roots.
(function () {
  var MAINT = 'Maintenance';
  var RADIO_GROUP = 'Radio firmware';     // web_server sorting group of the radio update entities
  var RADIO_UPDATE = 'Radio firmware';    // the update entity (efr32_radio)
  // rows that only mean something while the radio runs the Zigbee router firmware
  var ROUTER_ROWS = ['Zigbee router network', 'Zigbee router: join network', 'Zigbee router: leave network'];
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
    '.warre-ver.new{font-weight:700}' +
    // zebra rows counted over the visible rows only (the stock nth-child also counts hidden ones)
    '.tab-container>.entity-row.warre-z0{background-color:transparent!important}' +
    '.tab-container>.entity-row.warre-z1{background-color:rgba(90,90,90,.1)!important}' +
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

    // Radio firmware group: router rows only with the router firmware on the radio, the update
    // entity shows the version instead of "UPDATE AVAILABLE", "Install radio firmware" right below it
    for (var h = 0; h < headers.length; h++) {
      if (headers[h].textContent.trim() !== RADIO_GROUP) continue;
      var rc = headers[h].nextElementSibling;
      if (!rc) continue;
      var updRow = null;
      var rrows = rc.querySelectorAll(':scope > .entity-row:not(.warre-radiorow)');
      for (var q = 0; q < rrows.length; q++) {
        var rn = rrows[q].children[1] ? rrows[q].children[1].textContent.trim() : '';
        if (ROUTER_ROWS.indexOf(rn) >= 0) rrows[q].classList.toggle('warre-hidden', radioInstalled !== 'zigbee_router');
        if (rn === RADIO_UPDATE) updRow = rrows[q];
      }
      var radioRow = rc.querySelector('.warre-radiorow') || makeRadioRow();
      if (updRow) {
        if (updRow.nextElementSibling !== radioRow) updRow.after(radioRow);
        showUpdateVersion(table, updRow);
      } else if (!radioRow.parentNode) {
        rc.appendChild(radioRow);
      }
    }

    stripeRows(grid);

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

  function stripeRows(grid) {
    var conts = grid.querySelectorAll(':scope > .tab-container');
    for (var c = 0; c < conts.length; c++) {
      var n = 0;
      var rows = conts[c].querySelectorAll(':scope > .entity-row');
      for (var r = 0; r < rows.length; r++) {
        var shown = !rows[r].classList.contains('warre-hidden') && rows[r].offsetParent !== null;
        var odd = shown ? n++ % 2 === 1 : false;
        rows[r].classList.toggle('warre-z0', shown && !odd);
        rows[r].classList.toggle('warre-z1', shown && odd);
      }
    }
  }

  function buttonRow(cls, icon, name, label, onClick) {
    // same markup as the stock entity rows, so it looks like a normal button row
    var row = el('div', { class: 'entity-row ' + cls });
    var ic = el('div');
    ic.appendChild(el('iconify-icon', { icon: icon, height: '24px' }));
    row.appendChild(ic);
    row.appendChild(el('div', {}, name));
    var c = el('div');
    var b = el('button', { class: 'abutton', type: 'button' }, label);
    b.onclick = function (ev) {
      ev.stopPropagation();
      onClick();
    };
    c.appendChild(b);
    row.appendChild(c);
    return row;
  }

  function makeLoginRow() {
    return buttonRow('warre-loginrow', 'mdi:account-lock', 'Login settings', 'Open', function () { openLoginSettings(); });
  }

  // Installed radio firmware (from /warre/radio), for the router rows; refreshed now and then.
  var radioInstalled = null;
  function refreshRadioInstalled() {
    radioStatus().then(function (st) { radioInstalled = st.installed_firmware || null; }, function () {});
  }

  // The stock update row says "NO UPDATE" / "UPDATE AVAILABLE"; show the offered version instead.
  function showUpdateVersion(table, row) {
    var ent = null, list = table.entities || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].domain === 'update' && list[i].name === RADIO_UPDATE) ent = list[i];
    }
    var cell = row.children[2];
    if (!cell) return;
    var stock = cell.querySelector(':scope > div:not(.warre-ver)');
    var mine = cell.querySelector(':scope > .warre-ver');
    var state = ent ? String(ent.state || '').toUpperCase() : '';
    var show = ent && ent.value && state.indexOf('INSTALL') < 0 && !(stock && stock.querySelector('button'));
    if (!show) {
      if (mine) mine.remove();
      if (stock) stock.classList.remove('warre-hidden');
      return;
    }
    if (!mine) {
      mine = el('div', { class: 'warre-ver' });
      cell.appendChild(mine);
    }
    var isNew = state.indexOf('AVAILABLE') >= 0;
    var text = isNew ? 'New: ' + ent.value : ent.value;
    if (mine.textContent !== text) mine.textContent = text;
    mine.classList.toggle('new', isNew);
    mine.title = isNew ? 'Update available' : 'Up to date';
    if (stock) stock.classList.add('warre-hidden');
  }

  function makeRadioRow() {
    return buttonRow('warre-radiorow', 'mdi:chip', 'Install radio firmware', 'Choose version', function () { openRadio(); });
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
  setTimeout(refreshRadioInstalled, 1000);
  setInterval(refreshRadioInstalled, 30000);

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
    '#warre-dlg button.danger{border-color:#e53935;color:#e53935}' +
    '#warre-dlg button:disabled{opacity:.45;cursor:default}' +
    '#warre-dlg button.danger.fill{background:#e53935;color:#fff}' +
    // radio firmware dialog
    '#warre-dlg form.wide{max-width:560px;max-height:calc(100vh - 32px);overflow:auto}' +
    '#warre-dlg .fwlist{display:flex;flex-direction:column;gap:6px;margin:4px 0 0}' +
    '#warre-dlg .fw{display:flex;gap:10px;align-items:flex-start;margin:0;padding:9px 10px;border:1px solid #7f7f7f50;' +
    'border-radius:9px;cursor:pointer;font-size:.9rem}' +
    '#warre-dlg .fw:has(input:checked){border-color:#03a9f4;background:#03a9f418}' +
    '#warre-dlg .fw input{width:auto;margin:3px 0 0}' +
    '#warre-dlg .fw small{display:block;opacity:.7;margin-top:2px}' +
    '#warre-dlg .tag{display:inline-block;font-size:.72rem;padding:1px 6px;border-radius:6px;margin-left:6px;' +
    'border:1px solid currentColor;vertical-align:1px}' +
    '#warre-dlg .tag.inst{color:#2e9d3a}#warre-dlg .tag.exp{color:#e08a00}' +
    '#warre-dlg ul.warn{margin:6px 0 10px;padding-left:20px;font-size:.88rem;line-height:1.4}' +
    '#warre-dlg ul.warn li{margin:4px 0}#warre-dlg ul.warn li.big{color:#e53935;font-weight:600}' +
    '#warre-dlg label.ack{display:flex;gap:8px;align-items:flex-start;font-size:.88rem;margin:8px 0}' +
    '#warre-dlg label.ack input{width:auto;margin:2px 0 0}' +
    '#warre-dlg .bar{height:10px;border-radius:5px;background:#7f7f7f30;overflow:hidden;margin:12px 0 6px}' +
    '#warre-dlg .bar div{height:100%;background:#03a9f4;width:0;transition:width .4s}' +
    '#warre-dlg .ok{color:#2e9d3a;font-weight:600}#warre-dlg .bad{color:#e53935;font-weight:600}' +
    '#warre-dlg a{color:#03a9f4}';

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

  // --- Radio firmware (see components/efr32_radio) -----------------------------------------------
  // Radio firmware -> "Install radio firmware": pick a firmware type + channel from the firmware
  // list in this repository's `firmware` branch (index.json), press Update. The device checks the
  // signed manifest for that choice; the page then shows a warning and only after it is accepted
  // asks the device to flash exactly that verified version into the EFR32.

  var FW_LABEL = {
    zigbee_ncp: 'Zigbee coordinator (EmberZNet NCP)',
    openthread_rcp: 'Thread (OpenThread RCP)',
    zigbee_router: 'Zigbee router'
  };
  var FW_ORDER = ['zigbee_ncp', 'openthread_rcp', 'zigbee_router'];
  var CH_ORDER = ['stable', 'latest'];
  var radioBusy = false;      // a check or install is being followed by this page

  function radioStatus() {
    return fetch('/warre/radio', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  // Poll the status until done(st) is true. Failed requests are tolerated (the device is busy while it
  // flashes); gives up after `limit` ms.
  function pollRadio(done, limit, onEach) {
    var until = Date.now() + limit;
    function step() {
      if (Date.now() > until) return Promise.reject(new Error('timeout'));
      return radioStatus().then(function (st) {
        if (onEach) onEach(st);
        return done(st) ? st : sleep(1000).then(step);
      }, function () {
        if (onEach) onEach(null);
        return sleep(2000).then(step);
      });
    }
    return step();
  }

  function radioDialog(title) {
    closeDialog();
    var wrap = el('div', { id: 'warre-dlg' });
    var f = el('form', { class: 'wide' });
    f.onsubmit = function (ev) { ev.preventDefault(); };
    f.appendChild(el('h2', {}, title));
    var body = el('div');
    f.appendChild(body);
    wrap.appendChild(f);
    document.body.appendChild(wrap);
    return body;
  }

  function sdkText(sdk) {
    if (!sdk) return '';
    var p = String(sdk).split(':');
    var name = { gecko_sdk: 'Gecko SDK', simplicity_sdk: 'Simplicity SDK' }[p[0]] || p[0];
    return p[1] ? name + ' ' + p[1] : name;
  }

  function installedText(st) {
    return (FW_LABEL[st.installed_firmware] || st.installed_firmware) + ' ' + (st.installed_version || '(version unknown)');
  }

  function openRadio() {
    if (radioBusy) return;
    var body = radioDialog('Install radio firmware');
    body.appendChild(el('p', {}, 'Loading the firmware list...'));
    radioStatus().then(function (st) {
      // the list comes from the `firmware` branch of the repository (same place the device checks)
      return fetch(st.base_url + '/index.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (idx) { return [st, idx]; }, function () { return [st, null]; });
    }).then(function (res) {
      showRadioChoice(res[0], res[1]);
    }, function () {
      body.textContent = '';
      body.appendChild(el('p', { class: 'err' }, 'This firmware has no radio update module, or the device does not respond.'));
      body.appendChild(closeRow());
    });
  }

  function closeRow(label, onClick) {
    var row = el('div', { class: 'row' });
    var b = el('button', { type: 'button', class: 'primary' }, label || 'Close');
    b.onclick = onClick || closeDialog;
    row.appendChild(b);
    return row;
  }

  function showRadioChoice(st, idx) {
    var body = radioDialog('Install radio firmware');
    body.appendChild(el('p', {}, 'The radio (EFR32) now runs ' + installedText(st) + '. Choose a firmware type and ' +
      'channel; the files come from the firmware list of this repository and are checked against its signature ' +
      'before anything is flashed.'));
    if (!idx) {
      body.appendChild(el('p', { class: 'err' }, 'Could not load the firmware list from ' + st.base_url +
        '. You can still choose; the device shows the version after it checked the signed manifest.'));
    }
    var list = el('div', { class: 'fwlist' });
    var count = 0;
    FW_ORDER.forEach(function (fw) {
      CH_ORDER.forEach(function (ch) {
        var e = idx ? ((idx.firmware || {})[fw] || {})[ch] : {};
        if (!e) return;      // not published (yet)
        count++;
        var lab = el('label', { class: 'fw' });
        var inp = el('input', { type: 'radio', name: 'warre-rfw', value: fw + '|' + ch });
        if (fw === st.selected_firmware && ch === st.selected_channel) inp.checked = true;
        lab.appendChild(inp);
        var t = el('div');
        var head = el('div');
        head.appendChild(el('b', {}, FW_LABEL[fw] || fw));
        head.appendChild(document.createTextNode(' · ' + ch));
        if (e.version && fw === st.installed_firmware && e.version === st.installed_version)
          head.appendChild(el('span', { class: 'tag inst' }, 'installed'));
        if (e.experimental) head.appendChild(el('span', { class: 'tag exp' }, 'experimental'));
        t.appendChild(head);
        t.appendChild(el('small', {}, e.version ? 'Version ' + e.version + (e.sdk ? ' · ' + sdkText(e.sdk) : '')
          : 'Version shown after the check'));
        lab.appendChild(t);
        list.appendChild(lab);
      });
    });
    body.appendChild(list);
    if (!count) body.appendChild(el('p', { class: 'err' }, 'The firmware list has no builds for this device.'));
    var err = el('div', { class: 'err' });
    body.appendChild(err);
    var row = el('div', { class: 'row' });
    var cancel = el('button', { type: 'button' }, 'Cancel');
    cancel.onclick = closeDialog;
    var go = el('button', { type: 'button', class: 'primary' }, 'Update...');
    row.appendChild(cancel);
    row.appendChild(go);
    body.appendChild(row);

    go.onclick = function () {
      var sel = body.querySelector('input[name="warre-rfw"]:checked');
      if (!sel) { err.textContent = 'Choose a firmware first.'; return; }
      var v = sel.value.split('|');
      var e = idx ? idx.firmware[v[0]][v[1]] : null;
      checkChoice(v[0], v[1], e, err, [go, cancel]);
    };
  }

  // Let the device check the signed manifest of this choice, then show the warning.
  function checkChoice(fw, ch, entry, err, buttons) {
    err.textContent = '';
    buttons.forEach(function (b) { b.disabled = true; });
    radioBusy = true;
    var before;
    function fail(msg) {
      radioBusy = false;
      buttons.forEach(function (b) { b.disabled = false; });
      err.textContent = msg;
    }
    radioStatus().then(function (st) {
      before = st.check_seq;
      err.textContent = 'Checking the signed manifest...';
      return post('/warre/radio/select', { firmware: fw, channel: ch });
    }).then(function (res) {
      if (!res.ok) throw new Error(res.error || 'The device refused the choice.');
      return pollRadio(function (st) {
        return st.check_seq !== before && !st.checking && st.check_firmware === fw && st.check_channel === ch;
      }, 60000);
    }).then(function (st) {
      radioBusy = false;
      if (st.check_error) { fail('No verified firmware for this choice: ' + st.check_error); return; }
      if (st.offer_firmware !== fw || st.offer_channel !== ch || !st.offer_version) {
        fail('The device has no verified offer for this choice.');
        return;
      }
      showRadioWarning(st, entry);
    }).catch(function (e) {
      fail(e && e.message === 'timeout' ? 'The device did not finish the check in time; try again.'
        : (e && e.message) || 'No connection to the device.');
    });
  }

  function showRadioWarning(st, entry) {
    var fw = st.offer_firmware, ch = st.offer_channel, ver = st.offer_version;
    var switching = fw !== st.installed_firmware;
    var body = radioDialog('Flash the radio?');
    body.appendChild(el('p', {}, 'The radio is about to be flashed with ' + (FW_LABEL[fw] || fw) + ' ' + ver +
      ' (' + ch + '). The device downloaded the signed manifest and verified it.'));
    if (st.offer_summary) body.appendChild(el('p', {}, st.offer_summary));
    if (st.offer_release_url) {
      var pl = el('p');
      pl.appendChild(el('a', { href: st.offer_release_url, target: '_blank', rel: 'noopener' }, 'Release notes'));
      body.appendChild(pl);
    }

    var ul = el('ul', { class: 'warn' });
    if (switching) {
      ul.appendChild(el('li', { class: 'big' }, 'This changes the radio from ' + (FW_LABEL[st.installed_firmware] ||
        st.installed_firmware) + ' to ' + (FW_LABEL[fw] || fw) + '. The network on the radio is lost: ZHA, ' +
        'Zigbee2MQTT or the OpenThread border router have to be set up again for the new type.'));
    }
    ul.appendChild(el('li', {}, 'Make a backup of your network first (ZHA / Zigbee2MQTT backup, or the Thread dataset).'));
    ul.appendChild(el('li', {}, 'Stop ZHA / Zigbee2MQTT / OTBR or let them lose the connection: during the update ' +
      'the serial bridge is closed.'));
    ul.appendChild(el('li', {}, 'For about half a minute this page, the API and the bridge do not respond. ' +
      'Do not unplug the device while the radio is being flashed.'));
    if (entry && entry.experimental) ul.appendChild(el('li', {}, 'This build is marked experimental.'));
    if (!switching && ver === st.installed_version) ul.appendChild(el('li', {}, 'This version is already installed; ' +
      'it is flashed again.'));
    ul.appendChild(el('li', {}, 'If flashing fails the radio stays in its bootloader; you can then start the update again.'));
    body.appendChild(ul);

    var acks = [];
    function ack(text) {
      var l = el('label', { class: 'ack' });
      var c = el('input', { type: 'checkbox' });
      l.appendChild(c);
      l.appendChild(document.createTextNode(text));
      body.appendChild(l);
      acks.push(c);
    }
    if (switching) ack('I understand that the current network on the radio is lost.');
    ack('I made a backup and want to flash the radio now.');

    var err = el('div', { class: 'err' });
    body.appendChild(err);
    var row = el('div', { class: 'row' });
    var cancel = el('button', { type: 'button' }, 'Cancel');
    cancel.onclick = closeDialog;
    var go = el('button', { type: 'button', class: 'danger fill' }, 'Install ' + ver);
    go.disabled = true;
    acks.forEach(function (c) {
      c.onchange = function () { go.disabled = !acks.every(function (x) { return x.checked; }); };
    });
    row.appendChild(cancel);
    row.appendChild(go);
    body.appendChild(row);

    go.onclick = function () {
      if (!acks.every(function (x) { return x.checked; })) return;
      go.disabled = cancel.disabled = true;
      post('/warre/radio/install', { firmware: fw, channel: ch, version: ver }).then(function (res) {
        if (!res.ok) {
          go.disabled = cancel.disabled = false;
          err.textContent = res.error || 'The device refused the install.';
          return;
        }
        followInstall(res.install_seq, fw, ver);
      }, function () {
        go.disabled = cancel.disabled = false;
        err.textContent = 'No connection to the device.';
      });
    };
  }

  function followInstall(seq, fw, ver) {
    radioBusy = true;
    var body = radioDialog('Flashing the radio');
    body.appendChild(el('p', {}, (FW_LABEL[fw] || fw) + ' ' + ver + '. Keep this page open and the device powered.'));
    var bar = el('div', { class: 'bar' });
    var fill = el('div');
    bar.appendChild(fill);
    body.appendChild(bar);
    var msg = el('p', {}, 'Starting...');
    body.appendChild(msg);

    pollRadio(function (st) { return st.install_seq !== seq && !st.installing && !st.queued; }, 300000, function (st) {
      if (!st) { msg.textContent = 'The device is busy flashing and does not answer; waiting...'; return; }
      if (st.queued && !st.installing) msg.textContent = 'Waiting for the device to start...';
      else if (st.phase === 'download') msg.textContent = 'Downloading and verifying the image...';
      else if (st.phase === 'flash') {
        msg.textContent = 'Flashing the radio: ' + st.progress + '%';
        fill.style.width = st.progress + '%';
      } else if (st.installing) msg.textContent = 'Preparing the radio...';
    }).then(function (st) {
      radioBusy = false;
      body.textContent = '';
      body.appendChild(el('p', { class: st.result_ok ? 'ok' : 'bad' }, st.result_ok ? 'Done.' : 'The update failed.'));
      body.appendChild(el('p', {}, st.result_message || ''));
      if (st.result_ok) body.appendChild(el('p', {}, 'Reconnect ZHA / Zigbee2MQTT / OTBR to the radio.'));
      body.appendChild(closeRow('Close', function () { closeDialog(); location.reload(); }));
    }, function () {
      radioBusy = false;
      msg.textContent = 'No result from the device after five minutes. Reload the page and look at the ' +
        '"Radio firmware" entity and the log.';
      body.appendChild(closeRow());
    });
  }

  add(document.head, 'warre-dlg-css', DLG_CSS);
  refresh();
})();
