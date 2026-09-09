/* Brick & Beam film engine (v3).
   One fixed film behind the whole page, scrubbed by scroll: the pour over the hero, the stream held behind
   the content, the cup landing at the very bottom. WebGL Catmull-Rom upscale + unsharp mask, overlapping
   caption bands, scroll-linked marquees, entrances, parallax, auto-pour moment, counters.
   window.BBFilm = { init(root, opts) -> { destroy(), set(opts) } } */
(function () {
  // Static-hero gates. Keep these byte-identical to the matching @media list in the page's <style>.
  const GATES = [
    '(prefers-reduced-motion: reduce)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)'
  ];
  // Which of the two films plays. One query, nothing else: portrait phones and portrait tablets get the
  // portrait film, every other viewport gets the landscape one. Keep this byte-identical to the matching
  // @media queries in the page's <style>.
  const PORTRAIT_Q = '(orientation: portrait) and (max-width: 1024px)';
  const RM = '(prefers-reduced-motion: reduce)';
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

  // Split text into word / char spans once, seeded so offsets are identical on every load.
  function splitEl(el, seed) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = '1';
    const mode = el.dataset.split || 'words';
    const spread = Number(el.dataset.spread) || 0.5;
    const rand = rng(seed);
    const full = el.textContent.replace(/\s+/g, ' ').trim();
    const items = [];
    [...el.childNodes].forEach(n => {
      if (n.nodeName === 'BR') items.push({ br: true });
      else n.textContent.split(/\s+/).filter(Boolean).forEach(w => items.push({ w }));
    });
    const total = items.filter(x => x.w).length;
    const vis = document.createElement('span');
    vis.setAttribute('aria-hidden', 'true');
    let wi = 0;
    items.forEach((x, idx) => {
      if (x.br) { vis.appendChild(document.createElement('br')); return; }
      if (mode === 'mask') {
        const m = document.createElement('span'); m.className = 'bb-mask';
        const inner = document.createElement('span'); inner.textContent = x.w; inner.style.setProperty('--i', wi);
        m.appendChild(inner); vis.appendChild(m);
      } else {
        const w = document.createElement('span'); w.className = 'bb-w';
        w.style.setProperty('--th', (wi / Math.max(1, total) * spread + rand() * 0.04).toFixed(3));
        if (mode === 'chars') {
          [...x.w].forEach(ch => {
            const c = document.createElement('span'); c.className = 'bb-c'; c.textContent = ch;
            c.style.setProperty('--th', (rand() * 0.55).toFixed(3));
            c.style.setProperty('--jx', ((rand() - 0.5) * 56).toFixed(1) + 'px');
            c.style.setProperty('--jy', (-(18 + rand() * 54)).toFixed(1) + 'px');
            c.style.setProperty('--jr', ((rand() - 0.5) * 18).toFixed(1) + 'deg');
            w.appendChild(c);
          });
        } else w.textContent = x.w;
        vis.appendChild(w);
      }
      const next = items[idx + 1];
      if (next && !next.br) vis.appendChild(document.createTextNode(' '));
      wi++;
    });
    const sr = document.createElement('span'); sr.className = 'bb-sr'; sr.textContent = full;
    el.textContent = '';
    el.appendChild(sr);
    el.appendChild(vis);
  }

  /* WebGL upscaler: 9-tap Catmull-Rom + unsharp mask + gentle contrast. Redraws only when a new frame lands. */
  function makeUpscaler(canvas, video, onLost, getZoom, getBand) {
    let gl = null;
    try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); } catch (_) {}
    if (!gl) return null;
    const VS = 'attribute vec2 p;uniform vec2 s,o;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5)*s+o;gl_Position=vec4(p,0.,1.);}';
    const FS = [
      '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
      'varying vec2 v;uniform sampler2D t;uniform vec2 px;uniform float sh,ct;',
      'vec3 cr(vec2 uv){vec2 sp=uv/px;vec2 t1=floor(sp-.5)+.5;vec2 f=sp-t1;',
      'vec2 w0=f*(-.5+f*(1.-.5*f));vec2 w1=1.+f*f*(-2.5+1.5*f);vec2 w2=f*(.5+f*(2.-1.5*f));vec2 w3=f*f*(-.5+.5*f);',
      'vec2 w12=w1+w2;vec2 o12=w2/w12;vec2 t0=(t1-1.)*px;vec2 t3=(t1+2.)*px;vec2 t12=(t1+o12)*px;',
      'vec3 r=texture2D(t,vec2(t0.x,t0.y)).rgb*w0.x*w0.y+texture2D(t,vec2(t12.x,t0.y)).rgb*w12.x*w0.y+texture2D(t,vec2(t3.x,t0.y)).rgb*w3.x*w0.y;',
      'r+=texture2D(t,vec2(t0.x,t12.y)).rgb*w0.x*w12.y+texture2D(t,vec2(t12.x,t12.y)).rgb*w12.x*w12.y+texture2D(t,vec2(t3.x,t12.y)).rgb*w3.x*w12.y;',
      'r+=texture2D(t,vec2(t0.x,t3.y)).rgb*w0.x*w3.y+texture2D(t,vec2(t12.x,t3.y)).rgb*w12.x*w3.y+texture2D(t,vec2(t3.x,t3.y)).rgb*w3.x*w3.y;return r;}',
      'void main(){vec3 c=cr(v);',
      'vec3 b=(texture2D(t,v+vec2(px.x,0.)).rgb+texture2D(t,v-vec2(px.x,0.)).rgb+texture2D(t,v+vec2(0.,px.y)).rgb+texture2D(t,v-vec2(0.,px.y)).rgb)*.25;',
      'c+=sh*(c-b);c=(c-.5)*ct+.5;gl_FragColor=vec4(clamp(c,0.,1.),1.);}'
    ].join('\n');
    function shader(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.info('[Brick & Beam] shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    const uS = gl.getUniformLocation(prog, 's'), uO = gl.getUniformLocation(prog, 'o'), uPx = gl.getUniformLocation(prog, 'px');
    const uSh = gl.getUniformLocation(prog, 'sh'), uCt = gl.getUniformLocation(prog, 'ct');
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.uniform1f(uSh, 0.7); gl.uniform1f(uCt, 1.05);
    let hasFrame = false, lost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; if (onLost) onLost(); }, { once: true });
    function render() {
      if (lost || !hasFrame || !video.videoWidth) return false;
      const W = canvas.width, H = canvas.height, av = video.videoWidth / video.videoHeight;
      gl.uniform2f(uPx, 1 / video.videoWidth, 1 / video.videoHeight);
      if (H > W && (!getBand || getBand())) {
        // Fallback framing, landscape film on a tall screen only: fit the whole frame to the full width,
        // anchor its top edge to the top, ink the rest. The portrait film covers a tall screen on its own
        // and takes the cover-crop path below instead.
        // Drawing into a top-band viewport keeps the CLAMP_TO_EDGE smear off the screen entirely.
        const band = Math.min(H, Math.floor(W / av));                        // floor: never taller than the CSS fade band
        gl.viewport(0, 0, W, H);
        gl.clearColor(11 / 255, 9 / 255, 8 / 255, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.viewport(0, H - band, W, band);                                   // GL's origin is bottom-left
        gl.uniform2f(uS, 1, 1); gl.uniform2f(uO, 0, 0);                      // whole frame, zoom ignored
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.viewport(0, 0, W, H);
        return true;
      }
      const ac = W / H;
      let sx = 1, sy = 1; if (av > ac) sx = ac / av; else sy = av / ac;      // cover-crop in uv space
      const z = getZoom ? (getZoom() || 1) : 1;                              // >1 pulls the camera back
      sx *= z; sy *= z;                                                      // beyond-edge samples clamp; the vignette covers them
      gl.uniform2f(uS, sx, sy); gl.uniform2f(uO, (1 - sx) / 2, (1 - sy) / 2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    }
    return {
      resize(w, h) { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } gl.viewport(0, 0, w, h); },
      look(sh, ct) { gl.uniform1f(uSh, sh); gl.uniform1f(uCt, ct); },
      draw() {
        if (lost || !video.videoWidth || video.readyState < 2) return false;
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video); } catch (_) { return false; }
        hasFrame = true; return render();
      },
      render
    };
  }

  function init(root, opts) {
    opts = Object.assign({
      videoSrc: 'assets/hero-film.mp4', posterSrc: 'assets/film-poster.jpg', videoBytes: 5417655,
      start: 0, zoom: 1.08, zones: [0.5645, 0.6899], introEnd: 0.3361,
      // The portrait film. Its own source, its own poster, its own byte count for the ring, its own mapping.
      portraitVideoSrc: 'assets/hero-film-portrait.mp4', portraitPosterSrc: 'assets/film-poster-portrait.jpg', portraitVideoBytes: 4056359,
      // portraitIntroEnd has to land inside the pour zone, below portraitZones[0], or the intro hands the
      // playhead over past the frame the hero scroll is aiming at and the hero has nothing left to scrub.
      // 0.1569 (~2.73s) lands safely past the drip becoming a continuous stream (~2.0s) and stays below
      // portraitZones[0] (0.4119, ~7.16s), which is where the hero's scrub range now ends.
      portraitStart: 0, portraitZoom: 1, portraitZones: [0.4119, 0.7366], portraitIntroEnd: 0.1569,
      // The portrait hero is shorter than the landscape one (360vh): on a phone the same vh count means far
      // more physical scrolling, so portraitHeroVh trims it independently. Picked up the same way as
      // portraitZones/portraitIntroEnd above, through filmIsPortrait.
      heroVh: 360, portraitHeroVh: 260, sharpen: 0.7, contrast: 1.05, dim: 0.72, intro: true, introEase: 0.35
    }, opts || {});
    const q = (s, el) => (el || root).querySelector(s);
    const qa = (s, el) => Array.from((el || root).querySelectorAll(s));
    const cleanups = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
    const reduced = () => matchMedia(RM).matches;
    root.classList.add('bb-js');

    const onVis = () => { if (document.hidden) endIntro(); document.body.classList.toggle('bb-paused', document.hidden); if (!document.hidden) { applyHeroMode(); onScrollAll(); } };
    on(document, 'visibilitychange', onVis); document.body.classList.toggle('bb-paused', document.hidden);

    qa('[data-split]').forEach((el, i) => splitEl(el, 1013 + i * 7919));

    /* ---------------- The film ---------------- */
    const film = q('[data-bb="film"]'), video = q('[data-bb="video"]'), canvas = q('[data-bb="canvas"]'), poster = q('[data-bb="poster"]'), dimEl = q('[data-bb="dim"]');
    const hero = q('[data-bb="hero"]'), end = q('[data-bb="end"]'), cue = q('[data-bb="cue"]'), ring = q('[data-bb="ring"]'), header = q('[data-bb="header"]');
    if (video) { video.muted = true; video.playsInline = true; video.preload = 'none'; video.removeAttribute('controls'); }

    /* ---------------- Two films, one code path ----------------
       usePortrait is what the viewport asks for; filmIsPortrait is what is actually loaded or loading.
       They differ only inside the swap debounce, which is exactly when the mapping must still describe the
       film still on screen. Everything downstream reads through the accessors below, so there is one
       set of load / seek / draw code and never a portrait copy of it. */
    const portraitMQ = matchMedia(PORTRAIT_Q);
    let usePortrait = portraitMQ.matches && !!opts.portraitVideoSrc;
    let filmIsPortrait = usePortrait;
    const srcNow      = () => filmIsPortrait ? opts.portraitVideoSrc : opts.videoSrc;
    const posterNow   = () => (filmIsPortrait ? opts.portraitPosterSrc : opts.posterSrc) || opts.posterSrc;
    const bytesNow    = () => (filmIsPortrait ? opts.portraitVideoBytes : opts.videoBytes) || 1;
    const zonesNow    = () => (filmIsPortrait ? opts.portraitZones : opts.zones) || opts.zones;
    const startNow    = () => clamp(Number(filmIsPortrait ? opts.portraitStart : opts.start) || 0, 0, 1);
    const introEndNow = () => clamp(Number(filmIsPortrait ? opts.portraitIntroEnd : opts.introEnd) || 0, 0, 1);
    const zoomNow     = () => Number(filmIsPortrait ? opts.portraitZoom : opts.zoom) || 1;
    const heroVhNow   = () => Number(filmIsPortrait ? opts.portraitHeroVh : opts.heroVh) || opts.heroVh;
    // The top band is only ever the landscape film's way of covering a tall screen. The portrait film fills it.
    const bandFit     = () => !filmIsPortrait && innerHeight > innerWidth;
    // The page's CSS keys the same decision off these classes: the band framing, the band-fade element and
    // the pushed-down copy all belong to .bb-film-landscape, and only to it.
    function markFilmClass() {
      root.classList.toggle('bb-film-portrait', filmIsPortrait);
      root.classList.toggle('bb-film-landscape', !filmIsPortrait);
    }
    markFilmClass();
    // Set once here for the initial orientation, and again in swapFilm() whenever filmIsPortrait flips, so
    // heroRange/zoneA (computed in measure(), below) are never derived from the wrong orientation's height.
    if (hero) hero.style.height = heroVhNow() + 'vh';

    const collect = stage => stage ? qa('.bb-band', stage).map(el => {
      const r = (el.dataset.band || '0,1').split(',').map(Number);
      return { el, a: r[0], b: r[1], fade: el.dataset.fade ? Number(el.dataset.fade) : null, ramp: el.dataset.ramp ? Number(el.dataset.ramp) : null, op: -1, k: -1, pb: -1 };
    }) : [];
    const heroBands = collect(hero), endBands = collect(end);
    const mqs = qa('[data-bb="mq"]').map(el => ({ el, rate: Number(el.dataset.rate) || 0.3, track: el.querySelector('[data-bb="track"]'), half: 0, x: null, on: false }));

    let vh = innerHeight, heroRange = 1, endTop = Infinity, endRange = 1, maxScroll = 1, zoneA = 1, zoneB = 2;
    function measure() {
      vh = innerHeight;
      const sy = scrollY;
      heroRange = hero ? Math.max(1, hero.offsetHeight - vh) : 1;
      if (end) { endTop = end.getBoundingClientRect().top + sy; endRange = Math.max(1, end.offsetHeight - vh); }
      maxScroll = Math.max(1, Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - vh);
      zoneA = heroRange;
      zoneB = end ? clamp(endTop - vh * 0.5, zoneA + 1, maxScroll - 1) : maxScroll;
      // Written unconditionally (not gated on m.on) so an off-screen band already carries the right
      // scroll-linked offset the instant it scrolls into view, instead of starting from --mx:0.
      mqs.forEach(m => {
        m.half = m.track ? m.track.scrollWidth / 2 : 0;
        if (!m.half) { m.x = null; return; }
        const raw = sy * m.rate, x = -(((raw % m.half) + m.half) % m.half);
        m.x = x; m.el.style.setProperty('--mx', x.toFixed(1) + 'px');
      });
    }
    // Where the scroll mapping begins. opts.start is the base; the intro hand-off replaces it with the
    // frame that was on screen when the visitor took over, so the scrub picks up with no jump.
    let liveStart = null;
    const startProg = () => (liveStart !== null ? liveStart : startNow());
    // scrollY -> film progress: the pour over the hero, a slow stream behind the content, the cup at the bottom.
    // The zones come from whichever film is loaded, so each one is cut at its own beats.
    function filmTime(y) {
      const zn = zonesNow(), z0 = startProg();
      // The scrub only ever runs forwards. If an intro hands over past the pour mark (introEnd set beyond
      // zones[0]) the pour zone would otherwise rewind, so each zone end is held at or after the one before.
      const z1 = Math.max(zn[0], z0), z2 = Math.max(zn[1], z1);
      if (!end) return lerp(z0, 1, clamp(y / maxScroll, 0, 1));
      if (y <= zoneA) return lerp(z0, z1, clamp(y / zoneA, 0, 1));
      if (y <= zoneB) return lerp(z1, z2, (y - zoneA) / Math.max(1, zoneB - zoneA));
      return lerp(z2, 1, clamp((y - zoneB) / Math.max(1, maxScroll - zoneB), 0, 1));
    }

    let target = scrollY, shown = scrollY, rafId = null, lastTick = 0, scrubOn = false, filmInited = false;
    let loadK = 0, loadStart = 0, videoReady = false, objectUrl = null, pinned = false, up = null, glOk = false;
    let pp = -1, dimV = -1, syV = -1, velS = 0, velW = 0, cueHidden = null;
    // Load identity. Every await in the loader re-checks loadGen, so a load whose film has been swapped out
    // bails at its next resumption instead of adopting a blob, a src or a ready flag that no longer belongs.
    let loadGen = 0, fetchCtrl = null, waitAbort = null, glInited = false, swapT = 0;

    // Seek gate: never write currentTime while a seek is in flight; coalesce to the newest target.
    let seekBusy = false, pendingTime = null;
    let introPlaying = false, introDone = false, introVfc = null, introRaf = null, introTo = 0, userScrolled = false;
    function requestSeek(t) {
      if (!video || !videoReady || !video.duration) return;
      if (introPlaying) return;                                              // the intro owns the playhead until it hands over
      if (seekBusy) { pendingTime = t; return; }
      if (Math.abs(t - video.currentTime) < 0.004) return;                   // already there; a same-value write may never fire 'seeked'
      seekBusy = true; video.currentTime = t;
    }
    function paint() { if (up && glOk) up.draw(); }
    if (video) {
      on(video, 'seeked', () => { seekBusy = false; paint(); if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); } });
      // An empty src is the teardown emptying the element between films, not a film that failed to decode.
      on(video, 'error', () => { seekBusy = false; pendingTime = null; if (video.getAttribute('src')) failVideo(); });
      // Belt and braces: the intro also stops off the media clock, not only off the frame callbacks.
      on(video, 'timeupdate', () => { if (introPlaying && video.currentTime >= introTo) endIntro(); });
      on(video, 'ended', () => { if (introPlaying) endIntro(); });
    }

    function updateBands(bands, p, loadRamp) {
      const last = bands.length - 1;
      bands.forEach((b, i) => {
        const f = b.fade != null ? b.fade : Math.min(0.02, (b.b - b.a) / 3);
        const op = (i === 0 ? 1 : smoothstep(p, b.a, b.a + f)) * (i === last ? 1 : 1 - smoothstep(p, b.b - f, b.b));
        let k = clamp((p - b.a) / (b.ramp || Math.min(0.06, (b.b - b.a) * 0.35)), 0, 1);
        if (i === 0 && loadRamp) k = Math.max(k, loadK);
        const pb = clamp((p - b.a) / Math.max(0.0001, b.b - b.a), 0, 1);
        if (Math.abs(op - b.op) > 0.005 || ((op === 0 || op === 1) && op !== b.op)) {
          b.op = op; b.el.style.opacity = op.toFixed(3); b.el.style.visibility = op <= 0.001 ? 'hidden' : 'visible';
        }
        if (Math.abs(k - b.k) > 0.008 || ((k === 0 || k === 1) && k !== b.k)) { b.k = k; b.el.style.setProperty('--k', k.toFixed(3)); }
        if (Math.abs(pb - b.pb) > 0.006 || ((pb === 0 || pb === 1) && pb !== b.pb)) { b.pb = pb; b.el.style.setProperty('--pb', pb.toFixed(3)); }
      });
    }
    function updateFrame(y) {
      if (pinned) return;
      const hp = clamp(y / heroRange, 0, 1);
      updateBands(heroBands, hp, true);
      if (end) updateBands(endBands, clamp((y - endTop) / endRange, 0, 1), false);
      const dIn = smoothstep(y, zoneA, zoneA + vh * 0.7);
      const dOut = end ? smoothstep(y, endTop - vh * 0.6, endTop + vh * 0.3) : 0;
      const d = opts.dim * dIn * (1 - 0.85 * dOut);
      if (dimEl && Math.abs(d - dimV) > 0.004) { dimV = d; dimEl.style.opacity = d.toFixed(3); }
      const p = clamp(y / maxScroll, 0, 1);
      if (Math.abs(p - pp) > 0.003 || ((p === 0 || p === 1) && p !== pp)) { pp = p; root.style.setProperty('--pp', p.toFixed(3)); }
      if (Math.abs(y - syV) > 0.5) { syV = y; root.style.setProperty('--sy', y.toFixed(1)); }
      mqs.forEach(m => {
        // Not gated on m.on: every band's --mx stays current even off-screen, so it is already
        // correct (not jumping from 0) the moment it scrolls into view. The delta check below still
        // keeps the writes cheap.
        if (!m.half) return;
        const raw = y * m.rate, x = -(((raw % m.half) + m.half) % m.half);
        if (m.x === null || Math.abs(x - m.x) > 0.4) { m.x = x; m.el.style.setProperty('--mx', x.toFixed(1) + 'px'); }
      });
      const hide = hp > 0.04;
      if (cue && hide !== cueHidden) { cueHidden = hide; cue.classList.toggle('bb-hidden', hide); }
    }

    // dt-normalized lerp that rests when converged.
    function tick(now) {
      const dt = Math.min(100, now - (lastTick || now)); lastTick = now;
      const prev = shown;
      shown += (target - shown) * (1 - Math.pow(1 - 0.16, dt / 16.667));
      if (loadK < 1) { if (!loadStart) loadStart = now; loadK = easeOut(clamp((now - loadStart) / 1500, 0, 1)); }
      const v = dt > 0 ? clamp((shown - prev) / dt / 2.2, -1, 1) : 0;
      velS += (v - velS) * (1 - Math.pow(1 - 0.12, dt / 16.667));
      if (Math.abs(velS) < 0.004) velS = 0;
      if (Math.abs(velS - velW) > 0.004 || (velS === 0 && velW !== 0)) { velW = velS; root.style.setProperty('--vel', velW.toFixed(3)); }
      const converged = Math.abs(target - shown) < 0.3 && loadK >= 1 && velS === 0;
      if (converged) { shown = target; rafId = null; lastTick = 0; } else rafId = requestAnimationFrame(tick);
      if (scrubOn && videoReady && video.duration) requestSeek(filmTime(shown) * video.duration);
      updateFrame(shown);
    }
    function kick() { if (rafId === null && !pinned) rafId = requestAnimationFrame(tick); }
    function stopLoop() { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; } }

    /* ---------------- Intro: the pour plays itself once, then hands the playhead to scroll ---------------- */
    const SCROLL_KEYS = { ArrowDown: 1, ArrowUp: 1, PageDown: 1, PageUp: 1, Home: 1, End: 1, ' ': 1, Spacebar: 1 };
    function introOk() {
      return opts.intro !== false && !introDone && !introPlaying && !userScrolled && scrubOn && !pinned
        && !reduced() && !document.hidden && scrollY < 40 && !!video && videoReady && !!video.duration;
    }
    function queueIntroPaint() {
      if (!introPlaying) return;
      if (video.requestVideoFrameCallback) introVfc = video.requestVideoFrameCallback(introPaint);
      else introRaf = requestAnimationFrame(introPaint);                     // no rVFC: paint on the frame clock instead
    }
    // The intro does not stop dead: over the last opts.introEase seconds of it, playbackRate eases from 1
    // down to RATE_FLOOR on a smoothstep, so the pour glides to a halt on the hand-off frame.
    const RATE_FLOOR = 0.5;         // at 24fps a lower rate shows too few new frames a second and reads as stutter
    const RATE_EPS = 0.045;         // one frame at 24fps: close enough to introTo to call it arrived
    let rateNow = 1, rateOk = true;
    function setRate(r) {
      if (!video || !rateOk || Math.abs(r - rateNow) < 0.005) return;
      try { video.playbackRate = r; rateNow = video.playbackRate; }          // Safari may clamp or refuse
      catch (_) { rateOk = false; rateNow = 1; }                             // degrade to the plain hard stop
    }
    function introPaint() {
      introVfc = null; introRaf = null;
      if (!introPlaying) return;
      if (up && glOk) up.draw();                                             // no-GL path shows the <video> itself, nothing to do
      const remain = introTo - video.currentTime;
      if (reduced() || document.hidden || video.paused || video.ended || remain <= RATE_EPS) { endIntro(); return; }
      const ramp = Number(opts.introEase) || 0;
      if (ramp > 0) { const s = clamp(remain / ramp, 0, 1); setRate(RATE_FLOOR + (1 - RATE_FLOOR) * s * s * (3 - 2 * s)); }
      queueIntroPaint();
    }
    function startIntro() {
      if (!introOk()) return false;
      const dur = video.duration, from = startNow() * dur, to = introEndNow() * dur;
      if (!(to > from + 0.08)) { introDone = true; return false; }
      introTo = to; introPlaying = true;
      if (Math.abs(video.currentTime - from) > 0.02) { try { video.currentTime = from; } catch (_) {} }
      const p = video.play();
      if (p && p.catch) p.catch(() => {                                      // autoplay refused: straight to the scrub
        introPlaying = false; introDone = true; seekBusy = !!video.seeking; pendingTime = null;
        if (scrubOn && videoReady && video.duration) requestSeek(filmTime(shown) * video.duration);
      });
      queueIntroPaint();
      return true;
    }
    // Hand-off: pause where we are and make that frame the mapping's start, so scroll continues without a jump.
    function endIntro() {
      if (!introPlaying) return;
      introPlaying = false; introDone = true;
      if (introVfc !== null && video.cancelVideoFrameCallback) { try { video.cancelVideoFrameCallback(introVfc); } catch (_) {} }
      if (introRaf !== null) cancelAnimationFrame(introRaf);
      introVfc = null; introRaf = null;
      try { video.pause(); } catch (_) {}
      try { video.playbackRate = 1; } catch (_) {}                           // the scrub never runs at anything but 1
      rateNow = 1;
      if (video.duration) liveStart = clamp(video.currentTime / video.duration, startNow(), introEndNow());
      seekBusy = !!video.seeking; pendingTime = null;
      if (up && glOk) up.draw();
      if (scrubOn && videoReady && video.duration) requestSeek(filmTime(shown) * video.duration);
      kick();
    }
    function scrollIntent() {
      if (userScrolled) return;
      userScrolled = true;
      if (introPlaying) endIntro();
    }

    // Poster first, then the video streamed as a Blob behind a progress ring (Range-safe on any host).
    function paintPoster() { if (poster) poster.style.backgroundImage = 'url("' + posterNow() + '")'; }
    function initFilmOnce() {
      if (filmInited) return; filmInited = true;
      paintPoster();
      let started = false;
      const start = () => { if (started) return; started = true; beginLoad(); };
      const img = new Image(); img.onload = start; img.onerror = start; img.src = posterNow();
      later(start, 4000);
    }
    // One entry point for both the first load and every reload, so a swap can never start a second fetch
    // alongside a live one: the generation bump above it retires whatever was still in flight.
    function beginLoad() {
      const gen = ++loadGen;
      loadFilmBlob(gen).catch(err => { if (gen === loadGen) failVideo(err); });
    }
    async function loadFilmBlob(gen) {
      if (!video || !film) throw new Error('no film');
      const stale = () => gen !== loadGen;
      const ctrl = new AbortController(); fetchCtrl = ctrl;
      let wd = setTimeout(() => ctrl.abort(), 20000);
      const done = () => { clearTimeout(wd); if (fetchCtrl === ctrl) fetchCtrl = null; };
      let res;
      try { res = await fetch(srcNow(), { priority: 'low', signal: ctrl.signal }); }
      catch (e) { done(); if (stale()) return; throw e; }
      if (stale()) { done(); return; }
      const type = res.headers.get('Content-Type') || '';
      if (!res.ok || !res.body || (type && !/^video\/|octet-stream/.test(type))) { done(); throw new Error('film unavailable (' + res.status + (type ? ', ' + type : '') + ')'); }
      const total = Number(res.headers.get('Content-Length')) || bytesNow();
      const reader = res.body.getReader(); const chunks = []; let got = 0, lastRing = 0;
      for (;;) {
        let r;
        try { r = await reader.read(); }
        catch (e) { done(); if (stale()) return; throw e; }
        if (r.done) break;
        if (stale()) { done(); try { reader.cancel(); } catch (_) {} return; }
        clearTimeout(wd); wd = setTimeout(() => ctrl.abort(), 20000);
        chunks.push(r.value); got += r.value.length;
        const frac = Math.min(1, got / total), now = performance.now();
        if (ring && (now - lastRing > 100 || frac === 1)) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
      }
      done();
      if (stale()) return;
      if (ring) ring.style.setProperty('--ld', 0);
      // One live object URL at a time: the previous film's is revoked before this one is adopted.
      const url = URL.createObjectURL(new Blob(chunks, { type: type || 'video/mp4' }));
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = url;
      try {
        await new Promise((ok, bad) => {
          const off = () => { video.removeEventListener('canplay', okH); video.removeEventListener('error', badH); if (waitAbort === kill) waitAbort = null; };
          const okH = () => { off(); ok(); };
          const badH = () => { off(); bad(new Error('film decode failed')); };
          const kill = () => { off(); bad(new Error('film swapped')); };   // teardown detaches the pair, never orphans it
          waitAbort = kill;
          video.addEventListener('canplay', okH); video.addEventListener('error', badH);
          video.src = url; video.load();
        });
      } catch (e) { if (stale()) return; throw e; }
      if (stale()) return;
      videoReady = true;
      setupGL(); paint();
      if (!startIntro()) requestSeek(filmTime(shown) * video.duration);
      film.classList.add('bb-video-ready');
      if (cue) cue.classList.add('bb-cue-done');
    }

    /* ---------------- Swapping films when the orientation query flips ---------------- */
    // Everything the outgoing film owns is released here: the fetch, the blob URL, the canplay pair, the
    // seek gate, the ready flag and the ready class. Nothing survives into the next load.
    function teardownFilm() {
      loadGen++;
      if (fetchCtrl) { try { fetchCtrl.abort(); } catch (_) {} fetchCtrl = null; }
      if (waitAbort) waitAbort();
      endIntro();
      videoReady = false; seekBusy = false; pendingTime = null;
      if (video) { try { video.pause(); } catch (_) {} video.removeAttribute('src'); try { video.load(); } catch (_) {} }
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      if (film) film.classList.remove('bb-video-ready');
      if (cue) cue.classList.remove('bb-cue-done');
      if (ring) ring.style.setProperty('--ld', 126);
    }
    function swapFilm() {
      swapT = 0;
      if (filmIsPortrait === usePortrait) return;
      teardownFilm();
      filmIsPortrait = usePortrait;
      markFilmClass();
      // The hero's own height flips with orientation too (portraitHeroVh vs heroVh); it must land before
      // measure() below re-derives heroRange/zoneA, or the scrub stays sized for the film that just left.
      if (hero) hero.style.height = heroVhNow() + 'vh';
      // liveStart is a progress on the film that has just left. Re-home it inside the new film's hand-off
      // range so the scrub picks up at the equivalent frame instead of a number from the other timeline.
      if (liveStart !== null) liveStart = clamp(liveStart, startNow(), introEndNow());
      paintPoster();
      applyVideoFit();
      sizeCanvas();
      measure();
      updateFrame(shown);                                                    // re-measured, re-seeked below
      if (filmInited) beginLoad();                                           // the poster is already painted: straight to the fetch
      kick();
    }
    function onOrientation() {
      const want = portraitMQ.matches && !!opts.portraitVideoSrc;
      if (want === usePortrait) return;
      usePortrait = want;
      clearTimeout(swapT);
      swapT = setTimeout(swapFilm, 220);                                     // a resize drag crosses the query once, not once a frame
    }
    on(portraitMQ, 'change', onOrientation);
    cleanups.push(() => clearTimeout(swapT));

    // The band framing belongs to the landscape film alone. With the portrait film loaded the <video>
    // fallback covers like it does on desktop and takes the same zoom pull-back the canvas path uses.
    function applyVideoFit() {
      if (!video) return;
      video.style.transform = bandFit() ? 'translateZ(0)' : 'translateZ(0) scale(' + (1 / zoomNow()).toFixed(4) + ')';
    }
    function setupGL() {
      if (glInited) { if (up && glOk) { up.look(opts.sharpen, opts.contrast); sizeCanvas(); } return; }
      glInited = true;
      if (!canvas) { glOk = false; if (film) film.classList.add('bb-no-gl'); return; }
      up = makeUpscaler(canvas, video, () => { glOk = false; up = null; film.classList.add('bb-no-gl'); }, zoomNow, bandFit);
      applyVideoFit();
      if (!up) { glOk = false; film.classList.add('bb-no-gl'); return; }
      glOk = true; sizeCanvas(); up.look(opts.sharpen, opts.contrast); up.draw();
    }
    function sizeCanvas() { if (!up) return; const dpr = Math.min(1.5, devicePixelRatio || 1); up.resize(Math.round(innerWidth * dpr), Math.round(innerHeight * dpr)); }
    function failVideo(err) {
      if (!film || film.classList.contains('bb-video-failed')) return;
      if (err) console.info('[Brick & Beam] still-image film:', err.message || err);
      film.classList.add('bb-video-failed'); root.classList.add('bb-film-failed');
      if (cue) cue.classList.add('bb-cue-done');
    }

    // Header goes solid once the page proper begins.
    let solid = null;
    function navSolid() {
      if (!header) return;
      const want = scrubOn && hero ? scrollY > zoneA + vh * 0.4 : scrollY > 24;
      if (want !== solid) { solid = want; header.classList.toggle('bb-solid', want); }
    }

    /* ---------------- Static-hero gate, decided live ---------------- */
    function enableScrub() {
      if (scrubOn) return; scrubOn = true;
      initFilmOnce();
      heroBands.concat(endBands).forEach(b => { b.op = -1; b.k = -1; b.pb = -1; }); pp = -1; dimV = -1; syV = -1; cueHidden = null;
      unpinFinalStates();
      measure();
      target = scrollY; shown = target;
      updateFrame(shown);
      if (videoReady) requestSeek(filmTime(target) * video.duration);
      kick(); navSolid();
    }
    function disableScrub() {
      if (!scrubOn) return; scrubOn = false;
      endIntro();
      navSolid();
    }
    const MQLS = GATES.map(g => matchMedia(g));
    function applyHeroMode() { if (MQLS.some(m => m.matches)) disableScrub(); else enableScrub(); }
    MQLS.forEach(m => on(m, 'change', applyHeroMode));

    /* ---------------- Entrances ---------------- */
    const reveals = qa('.bb-reveal');
    let counterRafs = [];
    function runCounter(el) {
      const raw = el.dataset.count, endV = Number(raw), dec = (raw.split('.')[1] || '').length;
      if (reduced() || pinned) { el.textContent = raw; return; }
      const t0 = performance.now(), dur = 1700; let lastTxt = '', lastAt = 0;
      const step = now => {
        const t = clamp((now - t0) / dur, 0, 1), txt = (endV * easeOut(t)).toFixed(dec);
        if (t === 1) el.textContent = raw;
        else if (now - lastAt > 90 && txt !== lastTxt) { lastTxt = txt; lastAt = now; el.textContent = txt; }
        if (t < 1) counterRafs.push(requestAnimationFrame(step));
      };
      counterRafs.push(requestAnimationFrame(step));
    }
    function arrive(el) {
      el.classList.add('in');
      later(() => el.classList.add('settled'), 1900);
      qa('[data-count]', el).forEach(runCounter);
    }
    const revealIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { arrive(e.target); revealIO.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    reveals.forEach(el => {
      if (el.getBoundingClientRect().bottom < 0) { el.classList.add('in', 'settled'); qa('[data-count]', el).forEach(c => c.textContent = c.dataset.count); }
      else { if (!reduced()) qa('[data-count]', el).forEach(c => c.textContent = (0).toFixed((c.dataset.count.split('.')[1] || '').length)); revealIO.observe(el); }
    });
    cleanups.push(() => revealIO.disconnect());

    /* ---------------- Parallax (transform only, on-screen only, delta-gated) ---------------- */
    const plx = qa('[data-parallax]').map(el => ({ el, rate: Number(el.dataset.parallax) || 0.08, on: false, y: null }));
    let plxRaf = null;
    function runPlx() {
      plxRaf = null;
      if (reduced() || pinned) return;
      plx.forEach(p => {
        if (!p.on) return;
        const r = p.el.getBoundingClientRect();
        const c = (r.top + r.height / 2 - vh / 2) / vh;
        const y = Math.round(-c * p.rate * Math.max(r.height, 120) * 10) / 10;
        if (p.y === null || Math.abs(y - p.y) > 0.5) { p.y = y; p.el.style.setProperty('--py', y + 'px'); }
      });
    }
    function schedulePlx() { if (plxRaf === null && plx.length) plxRaf = requestAnimationFrame(runPlx); }
    if (plx.length) {
      const plxIO = new IntersectionObserver(es => { es.forEach(e => { const p = plx.find(x => x.el === e.target); if (p) p.on = e.isIntersecting; }); schedulePlx(); }, { rootMargin: '25% 0px' });
      plx.forEach(p => plxIO.observe(p.el)); cleanups.push(() => plxIO.disconnect());
    }

    /* ---------------- Marquees and living elements pause off-screen ---------------- */
    if (mqs.length) {
      const mqIO = new IntersectionObserver(es => { es.forEach(e => { const m = mqs.find(x => x.el === e.target); if (m) { m.on = e.isIntersecting; m.x = null; } }); kick(); }, { rootMargin: '20% 0px' });
      mqs.forEach(m => mqIO.observe(m.el)); cleanups.push(() => mqIO.disconnect());
    }
    qa('[data-living]').forEach(el => {
      const io = new IntersectionObserver(es => es.forEach(e => el.classList.toggle('bb-off', !e.isIntersecting)));
      io.observe(el); cleanups.push(() => io.disconnect());
    });

    /* ---------------- Depth-drift photo carousels (#pour, #room) ----------------
       One scroll position per carousel drives everything: an rAF loop advances it for the idle drift,
       and a trackpad swipe, a touch drag, an arrow-key press and the prev/next buttons all move the same
       number through the same code path (view.scrollLeft). Every cell repaints its own scale/opacity, every
       frame, as a pure function of its own distance from that number - there is no separate slide index.
       Off-screen pausing reuses the same IntersectionObserver shape as the [data-living] loop just above,
       just gating a JS rAF loop instead of a CSS animation (bb-off only pauses animation-play-state, which
       a scrollLeft-driven loop ignores). Full writeup: the depth-drift-carousel skill. */
    qa('[data-bb="car"]').forEach(strip => {
      const view = q('.bb-car-view', strip), track = q('.bb-car-track', strip);
      const prevBtn = q('.bb-car-prev', strip), nextBtn = q('.bb-car-next', strip);
      if (!view || !track || !prevBtn || !nextBtn) return;
      const originals = Array.from(track.children);
      if (originals.length < 2) return;

      // Three sets total (original + 2 clones): the live position needs a whole set of cells on both
      // sides of it at all times, or the wrap-back moment briefly shows nothing to one side.
      for (let c = 0; c < 2; c++) {
        originals.forEach(cell => {
          const copy = cell.cloneNode(true);
          copy.setAttribute('aria-hidden', 'true');
          copy.tabIndex = -1;
          // normalise() below starts the view inside the first clone set (the middle of three), so
          // that set - not the originals - is what's actually on screen at first paint.
          if (c === 0) qa('img', copy).forEach(img => { img.loading = 'eager'; });
          track.appendChild(copy);
        });
      }
      const cells = Array.from(track.children);
      const activeCells = () => reduced() ? originals : cells; // reduced motion hides the clones (CSS); ignore them here too
      let setWidth = 0;
      const measureSet = () => { setWidth = cells[originals.length].offsetLeft - cells[0].offsetLeft; };

      let pos = null;
      const DRIFT = 40; // px/s - faster and the depth scaling reads as a glitch, not a glide

      function wrap() {
        if (setWidth <= 0) return;
        if (pos === null) pos = view.scrollLeft;
        if (pos >= setWidth * 2) pos -= setWidth;
        else if (pos < setWidth) pos += setWidth;
        view.scrollLeft = pos;
      }
      function normalise() {
        if (setWidth <= 0) return;
        const p = pos === null ? view.scrollLeft : pos;
        pos = setWidth + (((p % setWidth) + setWidth) % setWidth);
        view.scrollLeft = pos;
      }
      function paintCar() {
        if (reduced()) return;
        const mid = view.scrollLeft + view.clientWidth / 2, span = view.clientWidth;
        if (!span) return;
        cells.forEach(cell => {
          const off = cell.offsetLeft + cell.offsetWidth / 2 - mid;
          const d = Math.abs(off) / span;
          const scale = Math.max(0.84, 1 - d * 0.38);
          const fade = Math.max(0.38, 1 - d * 1.5);
          const t = Math.max(-1, Math.min(1, off / (span * 0.5)));
          cell.style.transformOrigin = (50 - t * 50).toFixed(1) + '% 50%';
          cell.style.transform = 'scale(' + scale.toFixed(3) + ')';
          cell.style.opacity = fade.toFixed(3);
          cell.classList.toggle('is-focus', d < 0.14);
        });
      }

      // Independent pause reasons: hover, a pointer held down, the tab hidden, and the strip off-screen.
      // Only the aggregate's edge (true<->false) should start or stop the rAF loop.
      const held = { hover: false, press: false, hidden: document.hidden, off: true, step: false };
      let carRunning = false, carLast = 0, carRaf = null;
      function frameCar(now) {
        if (!carRunning) return;
        const dt = Math.min((now - carLast) / 1000, 0.05); // caps the jump after a backgrounded tab
        carLast = now;
        if (pos === null) pos = view.scrollLeft;
        pos += DRIFT * dt;
        wrap(); paintCar();
        carRaf = requestAnimationFrame(frameCar);
      }
      function syncCar() {
        const should = !reduced() && !held.hover && !held.press && !held.hidden && !held.off && !held.step;
        if (should === carRunning) return;
        carRunning = should;
        if (carRunning) { carLast = performance.now(); pos = null; carRaf = requestAnimationFrame(frameCar); }
        else if (carRaf !== null) { cancelAnimationFrame(carRaf); carRaf = null; }
      }
      const holdReason = (key, on) => { held[key] = on; syncCar(); };

      let stepTimer = 0;
      function goTo(target) {
        if (!target) return;
        holdReason('step', true);
        view.scrollTo({ left: target.offsetLeft + target.offsetWidth / 2 - view.clientWidth / 2, behavior: reduced() ? 'auto' : 'smooth' });
        clearTimeout(stepTimer);
        // Long enough for the smooth-scroll to land before the drift re-syncs its cached position,
        // or the strip visibly jitters as the two fight over scrollLeft.
        stepTimer = setTimeout(() => { pos = null; wrap(); holdReason('step', false); }, 700);
      }
      function stepCar(dir) {
        const list = activeCells();
        const mid = view.scrollLeft + view.clientWidth / 2;
        let best = 0, dist = Infinity;
        list.forEach((cell, i) => { const d = Math.abs(cell.offsetLeft + cell.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i; } });
        goTo(list[Math.min(list.length - 1, Math.max(0, best + dir))]);
      }
      on(prevBtn, 'click', () => stepCar(-1));
      on(nextBtn, 'click', () => stepCar(1));
      on(view, 'keydown', e => { if (e.key === 'ArrowLeft') { stepCar(-1); e.preventDefault(); } else if (e.key === 'ArrowRight') { stepCar(1); e.preventDefault(); } });
      on(track, 'click', e => { const cell = e.target.closest('.bb-car-cell'); if (cell && !cell.hasAttribute('aria-hidden')) goTo(cell); });
      on(view, 'scroll', paintCar, { passive: true });
      on(strip, 'pointerenter', () => holdReason('hover', true));
      on(strip, 'pointerleave', () => holdReason('hover', false));
      on(strip, 'focusin', () => holdReason('hover', true));
      on(strip, 'focusout', () => holdReason('hover', false));
      on(view, 'pointerdown', () => holdReason('press', true));
      on(window, 'pointerup', () => holdReason('press', false), { passive: true });
      on(document, 'visibilitychange', () => holdReason('hidden', document.hidden));

      function settleCar() {
        if (reduced()) {
          if (carRaf !== null) { cancelAnimationFrame(carRaf); carRaf = null; }
          carRunning = false; pos = null;
          cells.forEach(cell => { cell.style.transform = ''; cell.style.opacity = ''; cell.style.transformOrigin = ''; cell.classList.add('is-focus'); });
          return;
        }
        measureSet(); normalise(); paintCar(); syncCar();
      }
      on(window, 'resize', () => later(settleCar, 120));
      on(matchMedia(RM), 'change', settleCar);

      const carIO = new IntersectionObserver(es => es.forEach(e => holdReason('off', !e.isIntersecting)), { threshold: 0.15 });
      carIO.observe(strip);
      cleanups.push(() => carIO.disconnect());
      cleanups.push(() => { if (carRaf !== null) cancelAnimationFrame(carRaf); });

      settleCar();
    });

    /* ---------------- The one interactive moment: auto-pour when the section scrolls into view ---------------- */
    const hold = q('[data-bb="hold"]');
    const pourSection = hold && hold.closest('[data-bb="pour"]');
    const POUR_MS = 2400;       // fill duration, --h 0 -> 1, eased
    const POUR_DELAY_MS = 900;  // beat after the section reveals, so "Proudly Brewed" lands before the fill starts
    let h = 0, pourStart = 0, holdRaf = null, holdDone = false, holdPinned = false, pourIO = null;
    function holdTick(now) {
      if (!pourStart) pourStart = now;
      const p = clamp((now - pourStart) / POUR_MS, 0, 1);
      h = easeOut(p);
      hold.style.setProperty('--h', h.toFixed(3));
      if (p >= 1) { holdRaf = null; if (!holdDone) completeHold(false); return; }
      holdRaf = requestAnimationFrame(holdTick);
    }
    function startPour() { if (holdDone || holdRaf !== null) return; pourStart = 0; holdRaf = requestAnimationFrame(holdTick); }
    function completeHold(byPin) {
      holdDone = true; holdPinned = !!byPin; h = 1;
      hold.style.setProperty('--h', '1');
      if (pourSection) pourSection.classList.add('bb-done');
    }
    function resetHold() {
      holdDone = false; holdPinned = false; h = 0; pourStart = 0;
      if (holdRaf !== null) { cancelAnimationFrame(holdRaf); holdRaf = null; }
      hold.style.setProperty('--h', '0');
      if (pourSection) pourSection.classList.remove('bb-done');
      if (pourIO && hold) pourIO.observe(hold); // badge may already be in view again
    }
    if (hold && pourSection) {
      if (pourSection.classList.contains('bb-done')) { holdDone = true; h = 1; }
      else {
        // The "Proudly Brewed" line arrives with the badge's own reveal; hold the fill back so it reads first.
        // Observe the badge itself, not the whole section: three photos were added to #pour and on a
        // phone the stacked section is taller than the viewport, so a section-wide threshold could
        // never be satisfied. The badge's size doesn't depend on how much content sits below it.
        pourIO = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { later(startPour, POUR_DELAY_MS); pourIO.unobserve(hold); } }); }, { threshold: 0.6 });
        pourIO.observe(hold);
        cleanups.push(() => pourIO.disconnect());
      }
    }

    /* ---------------- Nav scrollspy: mark whichever section currently sits over the screen's centre ----------------
       Nothing in the nav could ever highlight before this: the links only had a hover colour, and phones
       have no hover. The Instagram link is external (no #href) and is never a candidate. A rootMargin that
       eats 45% off the top and bottom shrinks the "viewport" IntersectionObserver measures against down to a
       thin band across the middle of the screen, so a section only counts as active once it crosses the
       centre line — this is what keeps the mark from flickering between neighbours on a fast scroll, rather
       than reacting to whichever section merely touches the edge of the screen first. */
    const navSpyLinks = qa('[data-bb="header"] nav a[href^="#"]')
      .map(a => ({ a, el: q(a.getAttribute('href')) }))
      .filter(x => x.el);
    if (navSpyLinks.length) {
      const navRatios = new Map();
      let navActive = null;
      function paintNavSpy() {
        let best = null, bestRatio = 0;
        navRatios.forEach((r, el) => { if (r > bestRatio) { bestRatio = r; best = el; } });
        if (best === navActive) return;
        navActive = best;
        navSpyLinks.forEach(({ a, el }) => {
          if (el === navActive) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      }
      const navSpyIO = new IntersectionObserver(es => {
        es.forEach(e => navRatios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
        paintNavSpy();
      }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
      navSpyLinks.forEach(({ el }) => navSpyIO.observe(el));
      cleanups.push(() => navSpyIO.disconnect());
    }

    /* ---------------- Reduced motion, honored live in both directions ---------------- */
    function pinToFinalStates() {
      endIntro();
      pinned = true; root.classList.add('bb-pinned'); stopLoop();
      reveals.forEach(el => { el.classList.add('in', 'settled'); revealIO.unobserve(el); });
      counterRafs.forEach(cancelAnimationFrame); counterRafs = [];
      qa('[data-count]').forEach(c => c.textContent = c.dataset.count);
      if (plxRaf !== null) { cancelAnimationFrame(plxRaf); plxRaf = null; }
      plx.forEach(p => { p.y = null; p.el.style.setProperty('--py', '0px'); });
      mqs.forEach(m => { m.x = null; m.el.style.setProperty('--mx', '0px'); });
      root.style.setProperty('--vel', '0'); velS = 0; velW = 0;
      if (hold && !holdDone) completeHold(true);
      heroBands.concat(endBands).forEach(b => { b.el.style.opacity = ''; b.el.style.visibility = ''; b.el.style.setProperty('--k', '1'); b.el.style.setProperty('--pb', '0.5'); });
    }
    function unpinFinalStates() {
      if (!pinned) return; pinned = false; root.classList.remove('bb-pinned');
      if (hold && holdPinned) resetHold();
      schedulePlx(); kick();
    }
    on(matchMedia(RM), 'change', e => { if (e.matches) pinToFinalStates(); else applyHeroMode(); });
    if (reduced()) pinToFinalStates();

    /* ---------------- One passive scroll listener, one resize path ---------------- */
    let lastY = scrollY;
    function onScrollAll() {
      const y = scrollY;
      if (y !== lastY) { lastY = y; scrollIntent(); }                        // a scroll that actually moved is real intent
      target = y; kick(); navSolid(); schedulePlx();
    }
    on(window, 'scroll', onScrollAll, { passive: true });
    on(window, 'wheel', scrollIntent, { passive: true });
    on(window, 'touchmove', scrollIntent, { passive: true });
    on(window, 'keydown', e => { if (SCROLL_KEYS[e.key]) scrollIntent(); }, { passive: true });
    // onOrientation is cheap and self-cancelling, so the resize path can carry it too: a viewport that
    // crosses the query without firing a media-query change still swaps films.
    on(window, 'resize', () => { measure(); sizeCanvas(); applyVideoFit(); if (up && glOk) up.render(); onOrientation(); applyHeroMode(); onScrollAll(); });
    let ro = null;
    if ('ResizeObserver' in window) { ro = new ResizeObserver(() => { measure(); kick(); }); ro.observe(root); }
    measure();
    applyHeroMode();
    onScrollAll();

    return {
      destroy() {
        endIntro();
        loadGen++;                                                             // retire any load still in flight
        if (fetchCtrl) { try { fetchCtrl.abort(); } catch (_) {} fetchCtrl = null; }
        if (waitAbort) waitAbort();
        cleanups.forEach(f => f()); timers.forEach(clearTimeout);
        stopLoop(); if (ro) ro.disconnect();
        [plxRaf, holdRaf].forEach(id => id !== null && cancelAnimationFrame(id));
        counterRafs.forEach(cancelAnimationFrame);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        document.body.classList.remove('bb-paused');
      },
      set(next) {
        const prevStart = opts.start, prevPStart = opts.portraitStart;
        Object.assign(opts, next || {});
        if (next && next.start !== undefined && next.start !== prevStart) liveStart = null;   // filmStart is the base start again
        if (next && next.portraitStart !== undefined && next.portraitStart !== prevPStart) liveStart = null;
        if (hero) hero.style.height = heroVhNow() + 'vh';
        if (filmInited) paintPoster();
        applyVideoFit();
        measure();
        if (videoReady && video && video.duration) requestSeek(filmTime(shown) * video.duration);
        if (up && glOk) { up.look(opts.sharpen, opts.contrast); up.render(); }
        dimV = -1; updateFrame(shown); kick();
      }
    };
  }

  window.BBFilm = { init };
})();

/* ---- Section jump arrows --------------------------------------------------
   Two chevrons that step through the page's top-level sections, one press a
   section. Deliberately its own IIFE, independent of BBFilm above: it only
   ever reads the DOM (the cue's own hidden state, the header's live height),
   so it stays correct whichever of that engine's states — playing, paused,
   pinned for reduced motion — happen to be current, with no need to reach
   into its closures.

   Nothing here is cached across a scroll tick — not the buttons, not the
   header, not the cue. film-engine.js loads and runs this in <head>, before
   <body> exists, and the page's own DC-template runtime replaces whatever it
   first painted with its real render shortly after that — proven with a
   headless capture where element references grabbed on first run had gone
   stale (0×0 rects) by the time the page had actually settled, while a fresh
   query at the same moment read the real, laid-out header. Querying fresh
   inside every sync() sidesteps that outright: whichever nodes are live when
   a tick runs are the ones read and written. Clicks are delegated to
   `document` for the same reason — the one element in this whole chain
   guaranteed never to be swapped out from under a listener.

   Stops: every direct child <section> of #main, plus the footer's own cup
   film, count as a step — that list is exactly "The sections, in page
   order" this was briefed against, hero and footer included. The hero
   counts as a step like any other: its own stop sits at the very top of the
   document, so the down arrow's target the moment it first appears — as
   soon as the visitor has scrolled past the "Scroll to pour" cue, see
   cueShowing below — is still Shop, the whole rest of the 360vh pour in one
   press. The pour is skippable, not mandatory — a genuine fast path for a
   visitor who came back for the menu, not the film, and a quieter way to
   skip scroll-jacking than none at all. A hidden section
   (offsetHeight 0 — <section data-bb="static-hero"> normally, or the film
   hero itself under reduced motion or short-landscape mode, where the CSS
   swaps which of the two is shown) drops out of the stop list on its own,
   no extra state to track.

   The footer is the last stop. Landing on it retires the down arrow for
   the rest of its 240vh cup film rather than trying to keep clearing the
   address/Instagram/email block that sits pinned to the same
   viewport-bottom band for that whole stretch — simplest way to guarantee
   the two never share the screen. */
(function () {
  var SECTION_SELECTOR = '#main > section, [data-bb="end"]';
  var GAP = 14; // breathing room below the fixed header, in px

  // A landed section sits a pixel or so either side of its own stop; anything inside this
  // counts as already there, so the arrow offers the next stop instead of nudging back onto
  // the section already on screen.
  var EPS = 8;

  var root = document.scrollingElement || document.documentElement;
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  var maxScroll = function () {
    return Math.max(0, root.scrollHeight - root.clientHeight);
  };

  var headerOffset = function () {
    var header = document.querySelector('[data-bb="header"]');
    return header ? header.offsetHeight : 0;
  };

  var anchorTop = function (el) {
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerOffset());
  };

  // Every stop on the page, measured on demand rather than cached, so a stop is never stale
  // behind a reflow. offsetHeight filters out whichever hero variant the CSS currently hides.
  var stops = function () {
    var out = [];
    var max = maxScroll();
    document.querySelectorAll(SECTION_SELECTOR).forEach(function (sec) {
      if (!sec.offsetHeight) return;
      out.push(Math.min(anchorTop(sec), max));
    });
    return out;
  };

  var beyond = function (list, y, dir) {
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (dir > 0) {
        if (list[i] > y + EPS) { found = list[i]; break; }
      } else if (list[i] < y - EPS) {
        found = list[i];
      }
    }
    return found;
  };

  var step = function (dir) {
    var to = beyond(stops(), window.scrollY, dir);
    if (to === null) return;
    window.scrollTo({ top: to, behavior: motionQuery.matches ? 'auto' : 'smooth' });
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#jump-up, #jump-down');
    if (!t) return;
    step(t.id === 'jump-up' ? -1 : 1);
  });

  // The hero's own "Scroll to pour" cue already invites the first move; showing the down
  // arrow on top of it at the very top of the page would both duplicate that invitation and,
  // positioned where it is, sit right over it. offsetParent is null whenever the cue (or an
  // ancestor — the whole hero, under reduced motion or short-landscape mode) is display:none,
  // so this reads as "not showing" there too, with nothing extra to track.
  var cueShowing = function () {
    var cue = document.querySelector('[data-bb="cue"]');
    return !!cue && cue.offsetParent !== null && !cue.classList.contains('bb-hidden');
  };

  // Only written on the change: setting hidden to what it already is still costs a style
  // invalidation, and this runs on every scroll tick.
  var reveal = function (el, gone) { if (el && el.hidden !== gone) el.hidden = gone; };

  var raf = null;
  var sync = function () {
    raf = null;
    var up = document.getElementById('jump-up');
    var down = document.getElementById('jump-down');
    if (!up || !down) return;
    var wrap = up.closest('.jump') || up.parentElement;
    if (wrap) wrap.style.setProperty('--jump-offset-top', (headerOffset() + GAP) + 'px');
    var list = stops();
    var y = window.scrollY;
    reveal(up, beyond(list, y, -1) === null);
    reveal(down, cueShowing() || y >= maxScroll() - EPS || beyond(list, y, 1) === null);
  };
  var kick = function () { if (!raf) raf = window.requestAnimationFrame(sync); };

  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);
  window.addEventListener('load', kick);
  if (typeof motionQuery.addEventListener === 'function') {
    motionQuery.addEventListener('change', kick);
  }
  sync();
  // The buttons can still be mid-swap on this first pass (see above), so give sync a few more
  // unprompted ticks over the following second rather than waiting on a real scroll or resize to
  // ever arrive — cheap, and it's what makes the arrows correct on a page load with no interaction.
  [50, 150, 300, 600, 1000].forEach(function (ms) { setTimeout(kick, ms); });
})();
