const RAW_JS = `
(function() {
  if (window.__shmakk_design_injected__) return;
  window.__shmakk_design_injected__ = true;

  function init() {
    if (!document.body) { requestAnimationFrame(init); return; }

    var overlay = document.createElement('div');
    overlay.id = '__shmakk_overlay__';
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;border:2px solid #4a90d9;border-radius:2px;display:none;transition:all 80ms ease;';
    document.body.appendChild(overlay);

    var selectedEl = null;
    var appliedEdits = new Map();

    function getSelector(el) {
      if (el.id) return '#' + el.id;
      var path = [];
      while (el && el !== document.body && el !== document.documentElement) {
        var tag = el.tagName.toLowerCase();
        if (el.id) { path.unshift('#' + el.id); break; }
        var parent = el.parentElement;
        if (parent) {
          var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
          if (siblings.length > 1) {
            var idx = siblings.indexOf(el) + 1;
            tag += ':nth-of-type(' + idx + ')';
          }
        }
        path.unshift(tag);
        el = parent;
      }
      return path.join(' > ');
    }

    function getComputed(el) {
      var s = window.getComputedStyle(el);
      return {
        selector: getSelector(el),
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        classes: Array.from(el.classList || []),
        text: (el.textContent || '').trim().slice(0, 200),
        styles: {
          color: s.color, backgroundColor: s.backgroundColor,
          fontSize: s.fontSize, fontWeight: s.fontWeight,
          fontFamily: s.fontFamily, lineHeight: s.lineHeight,
          textAlign: s.textAlign, letterSpacing: s.letterSpacing,
          padding: s.padding, margin: s.margin,
          width: s.width, height: s.height,
          display: s.display, flexDirection: s.flexDirection,
          alignItems: s.alignItems, justifyContent: s.justifyContent,
          gap: s.gap, border: s.border, borderRadius: s.borderRadius,
          boxShadow: s.boxShadow, opacity: s.opacity,
          position: s.position, top: s.top, left: s.left, right: s.right, bottom: s.bottom,
          cursor: s.cursor, transition: s.transition,
          overflow: s.overflow, zIndex: s.zIndex,
        },
      };
    }

    document.addEventListener('mousemove', function(e) {
      if (!e.target || e.target === overlay || e.target === document.body || e.target === document.documentElement) {
        overlay.style.display = 'none';
        return;
      }
      var rect = e.target.getBoundingClientRect();
      overlay.style.display = 'block';
      overlay.style.top = rect.top + 'px';
      overlay.style.left = rect.left + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    }, { passive: true });

    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      overlay.style.display = 'none';
      selectedEl = e.target;
      var info = getComputed(selectedEl);
      var msg = { type: 'shmakk:elementClick', info: info };
      try { window.parent.postMessage(msg, '*'); } catch(_) {}
      console.log('__SHMAKK__' + JSON.stringify(msg));
    }, true);

    // Click with Ctrl/Cmd also works as a fallback
    document.addEventListener('click', function(e) {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        overlay.style.display = 'none';
        selectedEl = e.target;
        var info = getComputed(selectedEl);
        var msg = { type: 'shmakk:elementClick', info: info };
        try { window.parent.postMessage(msg, '*'); } catch(_) {}
        console.log('__SHMAKK__' + JSON.stringify(msg));
      }
    }, true);

    window.addEventListener('message', function(e) {
      var msg = e.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'shmakk:applyEdit' && selectedEl) {
        if (msg.style) {
          for (var k in msg.style) {
            selectedEl.style.setProperty(k, msg.style[k], 'important');
          }
          appliedEdits.set(getSelector(selectedEl), msg.style);
        }
        if (msg.text !== undefined) {
          selectedEl.textContent = msg.text;
        }
      }
      if (msg.type === 'shmakk:deleteElement' && selectedEl) {
        if (selectedEl.parentNode) selectedEl.parentNode.removeChild(selectedEl);
        selectedEl = null;
        overlay.style.display = 'none';
      }
      if (msg.type === 'shmakk:getEdits') {
        var edits = [];
        appliedEdits.forEach(function(styles, sel) { edits.push({ selector: sel, styles: styles }); });
        window.parent.postMessage({ type: 'shmakk:editsResponse', edits: edits }, '*');
      }
    });
  }
  init();
})();`;

/**
 * For injection into HTML strings (srcDoc, doc.write).
 */
export const DETECTION_SCRIPT = `<script>${RAW_JS}</script>`;

/**
 * For programmatic injection into existing documents (createElement('script').textContent).
 */
export const DETECTION_SCRIPT_RAW = RAW_JS;
