/*
 * Voice AI Assistant - ElevenLabs HD Human Voice Supported Drop-in Widget
 */
(function () {
  'use strict';

  console.log('[voice-agent] script loaded');

  var script = document.currentScript;
  var API =
    (script && script.getAttribute('data-api')) ||
    (window.VoiceAgentConfig && window.VoiceAgentConfig.api) ||
    '/api/chat';
  var LANG =
    (script && script.getAttribute('data-lang')) ||
    (window.VoiceAgentConfig && window.VoiceAgentConfig.lang) ||
    'en-US';

  var STORE_KEY = 'voice-agent-state';
  var hooks = window.VoiceAgentHooks || {};

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var state = { history: [], listening: false, busy: false, speakOnLoad: null };

  /* ---------- persistence across page navigation ---------- */

  function saveState() {
    try {
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ history: state.history.slice(-12), speakOnLoad: state.speakOnLoad })
      );
    } catch (e) {}
  }

  function loadState() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      state.history = saved.history || [];
      state.speakOnLoad = saved.speakOnLoad || null;
      saved.speakOnLoad = null;
      sessionStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch (e) {}
  }

  /* ---------- UI (shadow DOM so host page CSS cannot break it) ---------- */

  var host = document.createElement('div');
  host.setAttribute('data-voice-agent', '');
  host.style.cssText =
    'position:fixed !important;z-index:2147483000 !important;right:0 !important;' +
    'bottom:0 !important;display:block !important;visibility:visible !important;' +
    'opacity:1 !important;width:auto !important;height:auto !important;' +
    'margin:0 !important;transform:none !important;pointer-events:auto !important;';
  var root = host.attachShadow({ mode: 'open' });

  root.innerHTML = [
    '<style>',
    ':host{all:initial;display:block}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    '.wrap{position:fixed;right:20px;bottom:20px;display:flex;flex-direction:column;',
    'align-items:flex-end;gap:10px;',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}",
    '.panel{width:300px;max-width:calc(100vw - 40px);background:#131A24;color:#F2F5F7;',
    'border:1px solid #24313F;border-radius:14px;padding:14px;opacity:0;transform:translateY(8px);',
    'pointer-events:none;transition:opacity .18s ease,transform .18s ease;',
    'box-shadow:0 12px 32px rgba(6,10,16,.34)}',
    '.panel.show{opacity:1;transform:none;pointer-events:auto}',
    '.status{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;',
    'letter-spacing:.13em;text-transform:uppercase;color:#8A9AAB;margin-bottom:8px}',
    '.status.live{color:#2FD6C3}',
    '.status.err{color:#F2635C}',
    '.line{font-size:13.5px;line-height:1.5;margin-bottom:7px}',
    '.line.you{color:#8A9AAB}',
    '.line.you b{color:#B9C6D3;font-weight:600}',
    '.hint{font-size:11.5px;color:#6C7C8C;line-height:1.5;margin-top:8px;',
    'border-top:1px solid #24313F;padding-top:8px}',
    '.btn{display:flex;align-items:center;gap:10px;height:52px;padding:0 18px 0 16px;',
    'background:#131A24;color:#F2F5F7;border:1px solid #24313F;border-radius:26px;cursor:pointer;',
    'font:inherit;font-size:14px;font-weight:600;box-shadow:0 8px 22px rgba(6,10,16,.3);',
    'transition:border-color .18s ease,background .18s ease}',
    '.btn:hover{border-color:#3A4B5C}',
    '.btn:focus-visible{outline:2px solid #2FD6C3;outline-offset:3px}',
    '.btn.live{border-color:#2FD6C3;background:#16232B}',
    '.btn[disabled]{opacity:.55;cursor:default}',
    '.viz{display:flex;align-items:center;gap:2.5px;height:20px;width:26px}',
    '.viz i{display:block;width:3px;height:4px;border-radius:2px;background:#8A9AAB;',
    'transition:height .07s linear,background .18s ease}',
    '.btn.live .viz i{background:#2FD6C3}',
    '@media (prefers-reduced-motion:reduce){.viz i{transition:none}.panel{transition:none}}',
    '</style>',
    '<div class="wrap">',
    '  <div class="panel" id="panel">',
    '    <div class="status" id="status">Ready</div>',
    '    <div id="log"></div>',
    '    <div class="hint">Try: "Take me to contact" - "Add two blue mugs to my cart" - "Fill the contact form"</div>',
    '  </div>',
    '  <button class="btn" id="btn" type="button" aria-label="Talk to the assistant">',
    '    <span class="viz"><i></i><i></i><i></i><i></i><i></i></span>',
    '    <span id="label">Talk</span>',
    '  </button>',
    '</div>',
  ].join('');

  var $btn = root.getElementById('btn');
  var $label = root.getElementById('label');
  var $panel = root.getElementById('panel');
  var $status = root.getElementById('status');
  var $log = root.getElementById('log');
  var bars = root.querySelectorAll('.viz i');

  function setStatus(text, kind) {
    $status.textContent = text;
    $status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function addLine(who, text) {
    var el = document.createElement('div');
    el.className = 'line' + (who === 'you' ? ' you' : '');
    el.innerHTML = who === 'you' ? '<b>You:</b> ' : '';
    el.appendChild(document.createTextNode(text));
    $log.appendChild(el);
    while ($log.children.length > 4) $log.removeChild($log.firstChild);
    $panel.classList.add('show');
  }

  function setBars(level) {
    for (var i = 0; i < bars.length; i++) {
      var wave = Math.sin(Date.now() / 130 + i * 1.1) * 0.35 + 0.65;
      var h = 4 + level * wave * 16;
      bars[i].style.height = Math.max(4, Math.min(20, h)) + 'px';
    }
  }

  function idleBars() {
    for (var i = 0; i < bars.length; i++) bars[i].style.height = '4px';
  }

  /* ---------- microphone level meter ---------- */

  var audioCtx, analyser, micStream, rafId;

  function startMeter() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        micStream = stream;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        var buf = new Uint8Array(analyser.frequencyBinCount);
        (function tick() {
          if (!analyser) return;
          analyser.getByteTimeDomainData(buf);
          var sum = 0;
          for (var i = 0; i < buf.length; i++) {
            var v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          setBars(Math.min(1, Math.sqrt(sum / buf.length) * 6));
          rafId = requestAnimationFrame(tick);
        })();
      })
      .catch(function () {});
  }

  function stopMeter() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    analyser = null;
    if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
    micStream = null;
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    audioCtx = null;
    idleBars();
  }

  /* ---------- speech output (ElevenLabs HD Audio + Fallback) ---------- */

 /* ---------- speech output (ElevenLabs HD Audio + Autoplay Safety) ---------- */

  function fallbackSpeak(text, done) {
    if (!('speechSynthesis' in window) || !text) return done && done();
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = LANG;
    u.rate = 0.95;
    u.pitch = 1.1;
    u.onend = function () { done && done(); };
    u.onerror = function () { done && done(); };
    window.speechSynthesis.speak(u);
  }

  function speak(audioBase64, text, done) {
    if (audioBase64) {
      try {
        var audio = new Audio("data:audio/mpeg;base64," + audioBase64);
        
        audio.onended = function () { 
          console.log('[voice-agent] ElevenLabs playback finished');
          done && done(); 
        };

        audio.onerror = function (e) {
          console.warn('[voice-agent] ElevenLabs audio element error, falling back:', e);
          fallbackSpeak(text, done);
        };

        var playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(function (error) {
            console.warn('[voice-agent] Autoplay blocked or audio error:', error);
            // Fallback to browser voice if autoplay was blocked
            fallbackSpeak(text, done);
          });
        }
      } catch (e) {
        console.error('[voice-agent] Exception playing audio:', e);
        fallbackSpeak(text, done);
      }
    } else {
      console.log('[voice-agent] No base64 audio returned from backend, using fallback TTS.');
      fallbackSpeak(text, done);
    }
  }

  /* ---------- page context sent to the backend ---------- */

  function collectLinks() {
    var seen = {};
    var out = [];
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length && out.length < 40; i++) {
      var a = anchors[i];
      var text = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      var href = a.getAttribute('href');
      if (!text || !href) continue;
      if (href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) continue;
      try {
        var u = new URL(href, location.href);
        if (u.origin !== location.origin) continue;
        var pathKey = u.pathname + u.search;
        if (seen[pathKey]) continue;
        seen[pathKey] = 1;
        out.push({ text: text, href: pathKey });
      } catch (e) {}
    }
    return out;
  }

  function pageText() {
    var clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,[data-voice-agent]').forEach(function (n) {
      n.remove();
    });
    return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* ---------- action executors ---------- */

  function setNativeValue(el, value) {
    var proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findField(key) {
    var k = String(key || '').toLowerCase();
    var typeMap = { email: 'email', phone: 'tel', tel: 'tel' };
    var fields = document.querySelectorAll('input,textarea,select');

    for (var pass = 0; pass < 3; pass++) {
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.type === 'hidden' || f.disabled || f.readOnly) continue;
        var hay = [
          f.name, f.id, f.placeholder, f.getAttribute('aria-label'),
          f.labels && f.labels[0] ? f.labels[0].textContent : '',
        ].join(' ').toLowerCase();

        if (pass === 0 && (f.name || '').toLowerCase() === k) return f;
        if (pass === 1 && hay.indexOf(k) !== -1) return f;
        if (pass === 2 && typeMap[k] && f.type === typeMap[k]) return f;
      }
    }
    if (k === 'message' || k === 'comment') return document.querySelector('textarea');
    return null;
  }

  function findAddToCartButton(product) {
    var needle = String(product || '').toLowerCase().trim();
    var buttons = document.querySelectorAll(
      'button,a,[role="button"],input[type="submit"]'
    );
    var fallback = null;

    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var text = ((b.textContent || b.value || '') + ' ' + (b.getAttribute('aria-label') || ''))
        .toLowerCase();
      if (text.indexOf('add to cart') === -1 && text.indexOf('add to bag') === -1) continue;
      if (!fallback) fallback = b;
      if (!needle) continue;

      var card = b.closest('[data-product],article,li,.product,.card,form,div');
      for (var hops = 0; card && hops < 4; hops++) {
        if ((card.innerText || '').toLowerCase().indexOf(needle) !== -1) return b;
        card = card.parentElement;
      }
    }
    return fallback;
  }

  function runAction(res) {
    switch (res.action) {
      case 'navigate_to_page': {
        if (!res.url) return;
        state.speakOnLoad = null;
        saveState();
        var target;
        try { target = new URL(res.url, location.href).href; } catch (e) { return; }
        setTimeout(function () { location.href = target; }, 450);
        return;
      }

      case 'add_to_cart': {
        var qty = Math.max(1, parseInt(res.quantity, 10) || 1);
        if (hooks.addToCart && hooks.addToCart(res.product, qty)) return;
        var btn = findAddToCartButton(res.product);
        if (!btn) { setStatus('Add to cart button not found', 'err'); return; }
        var qtyInput = btn.closest('form,article,li,div');
        qtyInput = qtyInput && qtyInput.querySelector('input[type="number"],[name*="qty" i],[name*="quant" i]');
        if (qtyInput) setNativeValue(qtyInput, String(qty));
        for (var i = 0; i < (qtyInput ? 1 : qty); i++) btn.click();
        return;
      }

      case 'proceed_to_checkout': {
        if (hooks.checkout && hooks.checkout()) return;
        var link = Array.prototype.find.call(
          document.querySelectorAll('a[href],button'),
          function (el) { return /check\s?out/i.test(el.textContent || ''); }
        );
        if (link) link.click();
        else location.href = '/checkout';
        return;
      }

      case 'fill_form_field': {
        if (hooks.fillField && hooks.fillField(res.field, res.value)) return;
        var field = findField(res.field);
        if (!field) { setStatus('Field "' + res.field + '" not found', 'err'); return; }
        setNativeValue(field, res.value || '');
        field.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      case 'submit_contact_form': {
        if (hooks.submitForm && hooks.submitForm()) return;
        var form =
          document.querySelector('form[id*="contact" i],form[class*="contact" i]') ||
          document.querySelector('form');
        if (!form) { setStatus('No form on this page', 'err'); return; }
        var submit = form.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
        if (submit) submit.click();
        else form.requestSubmit ? form.requestSubmit() : form.submit();
        return;
      }
    }
  }

  /* ---------- backend round trip ---------- */

  function send(message) {
    state.busy = true;
    $btn.disabled = true;
    $label.textContent = 'Thinking';
    setStatus('Thinking');
    addLine('you', message);

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        currentUrl: location.href,
        pageText: pageText().slice(0, 8000),
        links: collectLinks(),
        history: state.history.slice(-10),
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.debug) console.warn('[voice-agent]', res.debug);
        var reply = res.reply || 'Sorry, I did not get that.';
        addLine('bot', reply);
        state.history.push({ role: 'user', text: message });
        state.history.push({ role: 'assistant', text: reply });
        saveState();
        setStatus(res.action && res.action !== 'none' ? res.action : 'Ready');
        speak(res.audio, reply, function () { runAction(res); });
        if (res.action === 'navigate_to_page') runAction(res);
      })
      .catch(function (err) {
        console.error('[voice-agent]', err);
        setStatus('Connection failed', 'err');
        addLine('bot', 'I could not reach the server.');
      })
      .then(function () {
        state.busy = false;
        $btn.disabled = false;
        $label.textContent = 'Talk';
      });
  }

  /* ---------- speech input ---------- */

  var recognition = null;

  function initRecognition() {
    if (!SR) return null;
    var r = new SR();
    r.lang = LANG;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    var finalText = '';

    r.onstart = function () {
      finalText = '';
      state.listening = true;
      $btn.classList.add('live');
      $label.textContent = 'Listening';
      setStatus('Listening', 'live');
      $panel.classList.add('show');
      startMeter();
    };

    r.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (interim) setStatus(interim.slice(-48), 'live');
    };

    r.onerror = function (e) {
      setStatus(
        e.error === 'not-allowed' ? 'Microphone blocked' : 'Mic error: ' + e.error,
        'err'
      );
    };

    r.onend = function () {
      state.listening = false;
      $btn.classList.remove('live');
      $label.textContent = 'Talk';
      stopMeter();
      var text = finalText.trim();
      if (text) send(text);
      else if ($status.className.indexOf('err') === -1) setStatus('Ready');
    };

    return r;
  }

  $btn.addEventListener('click', function () {
    if (state.busy) return;
    window.speechSynthesis && window.speechSynthesis.cancel();

    if (!SR) {
      $panel.classList.add('show');
      setStatus('Voice input unsupported', 'err');
      addLine('bot', 'Voice input needs Chrome, Edge, or Safari. Type your question instead.');
      var typed = prompt('Ask the assistant:');
      if (typed) send(typed);
      return;
    }

    if (state.listening) { recognition && recognition.stop(); return; }
    if (!recognition) recognition = initRecognition();
    try { recognition.start(); } catch (e) { recognition.stop(); }
  });

  /* ---------- boot ---------- */

  loadState();
  idleBars();

  function mount() {
    if (!document.body) return setTimeout(mount, 50);
    document.body.appendChild(host);
    console.log('[voice-agent] widget mounted, API =', API);
    if (state.speakOnLoad) {
      addLine('bot', state.speakOnLoad);
      state.speakOnLoad = null;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.VoiceAgent = { send: send, state: state };
})();