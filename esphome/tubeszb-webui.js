// TubesZB MGM210 Warre Edition - layout tweaks for the ESPHome web page (web_server v3).
// Baked into the firmware via web_server.js_include.
//  - content centred, entity groups in two columns (one column on narrow screens)
//  - the debug log becomes a collapsible window below the groups (click "Debug Log"),
//    newest line on top; open/closed is remembered in the browser
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
})();
