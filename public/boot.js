/**
 * Wave's boot watchdog.
 *
 * This file is deliberately plain, classic JavaScript, loaded before the app
 * bundle and never bundled with it. If a stale service worker serves an old
 * document whose hashed bundles are gone, the app never mounts and the page is
 * just an empty dark rectangle. There is no JavaScript left to call the service
 * worker API in that situation — so this small script does it, unregisters the
 * broken worker, clears the shell caches and reloads once, by itself.
 *
 * The user does not need Ctrl+Shift+R, and nothing here touches the library.
 */
(function () {
  'use strict';
  var RECOVERY_KEY = 'wave-shell-recovered';
  var STARTUP_GRACE_MS = 9000;
  var SPLASH_DELAY_MS = 1200;
  var script = document.currentScript;
  var base =
    script && script.src ? new URL('.', script.src).href : new URL('.', location.href).href;
  var started = Date.now();
  var recovering = false;
  var reloaded = false;

  function root() {
    return document.getElementById('root');
  }
  function booted() {
    var node = root();
    return !!window.__waveBooted || !!(node && node.childElementCount > 0);
  }
  function controlled() {
    return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  }
  function tried() {
    try {
      return window.sessionStorage.getItem(RECOVERY_KEY) === '1';
    } catch {
      return false;
    }
  }
  function markTried() {
    try {
      window.sessionStorage.setItem(RECOVERY_KEY, '1');
    } catch {
      /* Private modes may refuse storage; the one-shot guard below still holds. */
    }
  }

  function reload() {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  }

  /** A calm wordmark instead of a black rectangle while the shell repairs itself. */
  function showSplash() {
    if (!controlled() || booted() || !document.body) return;
    if (document.getElementById('wave-boot-splash')) return;
    var host = document.createElement('div');
    host.id = 'wave-boot-splash';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;' +
      'background:#12131a;color:#f5f6ff;font-family:system-ui,sans-serif';
    var mark = document.createElement('img');
    mark.src = new URL('wave.svg', base).href;
    mark.alt = '';
    mark.width = 96;
    mark.height = 96;
    mark.style.cssText = 'opacity:.86;max-width:36vw;max-height:36vh';
    host.appendChild(mark);
    document.body.appendChild(host);
  }
  function hideSplash() {
    var host = document.getElementById('wave-boot-splash');
    if (host) host.remove();
  }

  /** One automatic recovery per tab session; never a reload loop. */
  function recover() {
    if (recovering || reloaded || booted() || tried()) return;
    recovering = true;
    markTried();
    var tasks = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      tasks.push(
        navigator.serviceWorker
          .getRegistrations()
          .then(function (registrations) {
            return Promise.all(
              registrations.map(function (registration) {
                return registration.unregister();
              }),
            );
          })
          .catch(function () {}),
      );
    }
    if (window.caches && window.caches.keys) {
      tasks.push(
        window.caches
          .keys()
          .then(function (keys) {
            return Promise.all(
              keys
                .filter(function (key) {
                  return key.indexOf('wave-shell-') === 0;
                })
                .map(function (key) {
                  return window.caches.delete(key);
                }),
            );
          })
          .catch(function () {}),
      );
    }
    // Revalidate the document in the browser's own HTTP cache as well.
    if (window.fetch) {
      tasks.push(fetch(new Request(location.href, { cache: 'reload' })).catch(function () {}));
    }
    Promise.all(tasks).then(reload, reload);
    setTimeout(reload, 2500);
  }

  if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'WAVE_SHELL_STALE') recover();
    });
  }

  var ticker = setInterval(function () {
    if (booted()) {
      hideSplash();
      clearInterval(ticker);
      return;
    }
    var elapsed = Date.now() - started;
    if (elapsed >= STARTUP_GRACE_MS) {
      clearInterval(ticker);
      recover();
    } else if (elapsed >= SPLASH_DELAY_MS) {
      showSplash();
    }
  }, 250);
})();
