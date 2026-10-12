// Galáxia: a home. Cada órbita (agrupamento de aplicações, ver orbitKey em
// common.js) é um planeta; clicar num planeta abre o painel filtrado por ela
// (painel.html?orbita=<chave>). Como o script.js do painel, é um script comum
// carregado antes do boot do dc-runtime: a tag data-dc-script do index.html só
// faz `const Component = createComponent(DCLogic);`. O cadastro (o botão +) vem de
// app-form.js, o mesmo do painel.

// Os planetinhas de uma órbita na galáxia: uma amostra, não a contagem (essa vai
// na legenda). Quantos: de 0 a 5 conforme o tamanho da órbita. De que cor: na
// proporção dos status reais, com ao menos um planetinha para cada queda ou
// lentidão que exista, para o problema nunca sumir na amostra.
function systemTones(o, status) {
  const n = o.apps.length;
  const k = n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 7 ? 3 : n <= 14 ? 4 : 5;
  const share = c => (c ? Math.max(1, Math.round(c / n * k)) : 0);
  const down = Math.min(k, share(o.down));
  const warn = Math.min(k - down, share(o.degraded));
  const idle = Math.min(k - down - warn, share(o.apps.filter(a => !status[a.id]).length));
  const up = k - down - warn - idle;
  return [...Array(down).fill('unhealthy'), ...Array(warn).fill('degraded'), ...Array(up).fill('healthy'), ...Array(idle).fill('idle')];
}
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function easeCubicIn(t) { return t * t * t; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
// Contorno fechado e suave por pontos: quadráticas com controle em cada ponto e
// ponta no meio de cada lado (faz o papel do curveCardinalClosed do d3-shape,
// que não é carregado).
function smoothClosedPath(pts) {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = pts.length;
  const start = mid(pts[n - 1], pts[0]);
  let d = `M ${start[0]} ${start[1]}`;
  pts.forEach((p, i) => { const m = mid(p, pts[(i + 1) % n]); d += ` Q ${p[0]} ${p[1]} ${m[0]} ${m[1]}`; });
  return d + ' Z';
}

// Espaço de referência do layout: as posições são calculadas nele e só depois
// reescaladas para a janela, então redimensionar não embaralha os planetas.
const REF_W = 1280;
const REF_H = 800;
// Duração da "sucção" ao entrar numa órbita, e quando o véu começa a cobrir.
const ENTER_MS = 900;
const VEIL_AT_MS = 720;

function createComponent(DCLogic) {
  return withAppForm(class Component extends DCLogic {
    state = { apps: [], status: {}, theme: 'dark', apiDown: false, lastOk: null, synced: false, d3Failed: false, ...appFormState(DEFAULT_ENV) };

    async componentDidMount() {
      const { theme, apps, status: cached, statusTs, prefs } = readLocalCache(false);
      const known = new Set(apps.map(a => a.id));
      const status = migrateStatus(Object.fromEntries(Object.entries(cached).filter(([id]) => known.has(id))));
      // Status da carga mais velho que STATUS_STALE_MS aparece apagado até o primeiro evento.
      this.statusOld = Object.keys(status).length > 0 && Date.now() - statusTs > STATUS_STALE_MS;
      this.onResize = () => { clearTimeout(this.resizeTid); this.resizeTid = setTimeout(() => this.draw(), RESIZE_DEBOUNCE_MS); };
      window.addEventListener('resize', this.onResize);
      this.onMotion = () => this.draw();
      try { this.motionMq = matchMedia('(prefers-reduced-motion: reduce)'); this.motionMq.addEventListener('change', this.onMotion); } catch (e) {}
      // Voltar do painel pelo histórico restaura a página com o véu fechado: recarrega.
      this.onPageShow = e => { if (e.persisted) location.reload(); };
      window.addEventListener('pageshow', this.onPageShow);
      this.setState({ apps, status, theme, lastOk: prefs.lastOk || null }, () => { this.applyTheme(); this.waitForD3(); this.connectEvents(); this.updateTitle(); });
      if (!(await this.loadApps())) this.markApiDown();
    }
    componentWillUnmount() {
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('pageshow', this.onPageShow);
      if (this.motionMq) this.motionMq.removeEventListener('change', this.onMotion);
      if (this.drift) this.drift.stop();
      if (this.rockTimer) this.rockTimer.stop();
      if (this.es) this.es.close();
      clearTimeout(this.esDownTid);
      clearTimeout(this.esRetryTid);
      clearTimeout(this.resizeTid);
    }

    // Mesma fonte do painel (GET /applications) e mesmo cache local (orbital-apps-v1).
    // O status local (orbital-status-v1) é só lido aqui: quem o grava é o painel.
    loadApps() {
      if (this.appsReq) return this.appsReq;
      this.appsReq = (async () => {
        try {
          const data = await apiFetch('/applications');
          const apps = Object.entries(data).flatMap(([apiEnv, list]) => list.map(doc => fromApi(doc, apiEnv)));
          try { localStorage.setItem(AKEY, JSON.stringify(apps)); } catch (e) {}
          this.setState({ apps }, () => { this.drawOrbits(); this.updateTitle(); });
          return true;
        } catch (e) { return false; }
        finally { this.appsReq = null; }
      })();
      return this.appsReq;
    }

    // O mesmo stream do painel. Aqui só interessa o status de cada app, para a
    // saúde de cada órbita; os alertas de queda ficam no painel.
    connectEvents() {
      clearTimeout(this.esRetryTid);
      if (this.es) this.es.close();
      const es = this.es = new EventSource(`${API_BASE}/applications/events?changes=true`);
      es.onopen = () => { clearTimeout(this.esDownTid); this.esDownTid = null; };
      es.onerror = () => {
        if (!this.esDownTid) this.esDownTid = setTimeout(() => { this.esDownTid = null; if (this.es?.readyState !== EventSource.OPEN) this.markApiDown(); }, SSE_DOWN_GRACE_MS);
        if (es.readyState === EventSource.CLOSED) { clearTimeout(this.esRetryTid); this.esRetryTid = setTimeout(() => this.connectEvents(), SSE_RETRY_MS); }
      };
      es.addEventListener('snapshot', e => this.onSnapshot(parseEvent(e)));
      es.addEventListener('status', e => this.onStatus(parseEvent(e)));
      es.addEventListener('cycle', e => this.onCycle(parseEvent(e)));
    }
    // Qualquer evento prova que a API voltou: a tempestade passa e a lista é relida.
    applyResults(results, extra = {}) {
      const patch = {};
      results.forEach(r => { patch[r.id] = STATUSES.includes(r.status) ? r.status : 'unhealthy'; });
      const cleared = this.state.apiDown;
      const unknown = results.some(r => !this.state.apps.some(a => a.id === r.id));
      this.setState({ status: { ...this.state.status, ...patch }, apiDown: false, synced: true, ...extra }, () => { this.drawOrbits(); this.updateTitle(); });
      if (cleared || unknown) this.loadApps();
    }
    onSnapshot(data) {
      const env = data && API_TO_ENV[data.env];
      if (!env || !Array.isArray(data.apps)) return;
      const checkedAt = data.cycle ? Date.parse(data.cycle.checkedAt) : null;
      const listed = new Set(data.apps.map(a => a.id));
      const mine = this.state.apps.filter(a => a.env === env);
      const listStale = listed.size !== mine.length || mine.some(a => !listed.has(a.id));
      this.applyResults(data.apps.filter(a => a.status !== null), checkedAt ? { lastOk: Math.max(this.state.lastOk || 0, checkedAt) } : {});
      if (listStale) this.loadApps();
    }
    onStatus(data) {
      if (data && API_TO_ENV[data.env]) this.applyResults([data]);
    }
    onCycle(data) {
      const env = data && API_TO_ENV[data.env];
      if (!env) return;
      this.applyResults([], { lastOk: Math.max(this.state.lastOk || 0, Date.parse(data.checkedAt)) });
      if (data.checked !== this.state.apps.filter(a => a.env === env).length) this.loadApps();
    }
    markApiDown() {
      if (this.state.apiDown) return;
      this.setState({ apiDown: true }, () => { this.drawOrbits(); this.updateTitle(); });
    }
    updateTitle() {
      if (this.state.apiDown) { document.title = `⛈ API inacessível · ${BASE_TITLE}`; return; }
      const n = this.state.apps.filter(a => this.state.status[a.id] === 'unhealthy').length;
      document.title = n ? `(${n}) ⚠ ${BASE_TITLE}` : BASE_TITLE;
    }
    // Status da carga antigo, ou API fora: as contagens aparecem como "último conhecido".
    isStale() { return this.state.apiDown || (this.statusOld && !this.state.synced); }

    applyTheme() {
      const el = this.rootEl; if (!el) return;
      const vars = THEMES[this.state.theme];
      Object.keys(vars).forEach(k => el.style.setProperty(k, vars[k]));
      document.body.style.background = vars['--page-bg'];
    }

    waitForD3() {
      if (d3Ready()) { this.draw(); return; }
      if (!this.d3Since) this.d3Since = Date.now();
      if (Date.now() - this.d3Since > D3_TIMEOUT) { this.setState({ d3Failed: true }); return; }
      setTimeout(() => this.waitForD3(), D3_POLL_MS);
    }
    draw() {
      if (!d3Ready() || !this.rootEl || this.leaving) return;
      this.W = this.rootEl.clientWidth;
      this.H = this.rootEl.clientHeight;
      this.drawSky(); this.drawTwinkles(); this.drawRocks(); this.drawOrbits();
    }

    // As órbitas na ordem em que nasceram (orbitsByBirth), com a saúde de cada uma.
    // Contam aplicações como o painel: cada uma em cada ambiente (checkout-api em
    // dev e em prd são duas), que é o que o servidor monitora.
    orbitsData() {
      const { status } = this.state;
      const count = (apps, s) => apps.filter(a => status[a.id] === s).length;
      return orbitsByBirth(this.state.apps).map(o => ({
        ...o,
        n: o.apps.length,
        down: count(o.apps, 'unhealthy'),
        degraded: count(o.apps, 'degraded'),
        checked: o.apps.some(a => status[a.id])
      }));
    }

    drawSky() {
      const cv = this.skyEl; if (!cv) return;
      const W = this.W, H = this.H, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr;
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const r = rng(106);
      const glow = (x, y, rad, col, a) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      };
      const star = (x, y, s, a, tint) => { ctx.fillStyle = tint ? `rgba(207,201,242,${a})` : `rgba(233,233,237,${a})`; ctx.fillRect(x, y, s, s); };
      ctx.globalCompositeOperation = 'lighter';
      // Galáxia espiral de dois braços, inclinada e achatada, no centro da tela.
      const cx = W * .5, cy = H * .5, R = Math.min(W, H) * .46, tilt = -0.35, sq = .5;
      const P = (rad, ang) => { const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad * sq; return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]; };
      glow(cx, cy, R * 1.1, '110,96,200', .1);
      for (let i = 0; i < 5200; i++) {
        const arm = i % 2, t = Math.pow(r(), .75), ang = arm * Math.PI + t * 3.4 * Math.PI + gauss(r) * (.18 + .25 * (1 - t));
        const [x, y] = P(t * R + gauss(r) * 6, ang);
        star(x, y, r() < .06 ? 1.5 : .8, (1 - t * .75) * (.25 + r() * .5), r() < .5);
      }
      for (let i = 0; i < 26; i++) { const t = .2 + r() * .8, ang = (i % 2) * Math.PI + t * 3.4 * Math.PI; const [x, y] = P(t * R, ang); glow(x, y, 18 + r() * 26, '145,132,217', .12); }
      glow(cx, cy, R * .28, '233,226,255', .35); glow(cx, cy, R * .1, '255,250,240', .55);
      const n = Math.round(W * H / 2400);
      for (let i = 0; i < n; i++) star(r() * W, r() * H, r() < .05 ? 1.5 : r() < .35 ? 1 : .7, .15 + r() * .55, r() < .25);
      ctx.globalCompositeOperation = 'source-over';
    }

    drawTwinkles() {
      const el = this.twinkleEl; if (!el) return;
      const r = rng(99), still = reducedMotion();
      const data = Array.from({ length: 34 }, () => ({ x: r() * 100, y: r() * 100, s: 1.5 + r() * 1.6, d: 2.5 + r() * 5, o: r() * 6 }));
      window.d3.select(el).selectAll('span').data(data).join('span')
        .style('position', 'absolute').style('left', d => d.x + '%').style('top', d => d.y + '%')
        .style('width', d => d.s + 'px').style('height', d => d.s + 'px').style('border-radius', '50%')
        .style('background', 'var(--moon)').style('box-shadow', d => `0 0 ${d.s * 3}px var(--comet-tail)`)
        .style('opacity', still ? .5 : null)
        .style('animation', d => still ? null : `twinkle ${d.d}s ease-in-out ${-d.o}s infinite`);
    }

    // Asteroides à deriva: dá para arremessá-los com o ponteiro, e eles colidem.
    drawRocks() {
      const el = this.rocksEl; if (!el) return;
      const d3 = window.d3, W = this.W, H = this.H, r = rng(211);
      if (this.rockTimer) this.rockTimer.stop();
      d3.select(el).selectAll('svg').remove();
      const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).style('display', 'block');
      const gr = svg.append('defs').append('radialGradient').attr('id', 'rockg').attr('cx', '32%').attr('cy', '28%').attr('r', '80%');
      gr.append('stop').attr('offset', 0).style('stop-color', 'var(--rock-hi)');
      gr.append('stop').attr('offset', .55).style('stop-color', 'var(--rock-mid)');
      gr.append('stop').attr('offset', 1).style('stop-color', 'var(--rock-lo)');
      const shape = (size, rr) => {
        const n = 7 + Math.floor(rr() * 4);
        return smoothClosedPath(Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, k = size * (.68 + rr() * .42); return [Math.cos(a) * k, Math.sin(a) * k * (.75 + rr() * .2)]; }));
      };
      const count = Math.round(Math.min(22, 8 + W * H / 90000));
      const rocks = Array.from({ length: count }, (_, i) => {
        const big = r() < .25, size = big ? 8 + r() * 9 : 2.5 + r() * 5;
        const ang = r() * Math.PI * 2, sp = (big ? 3 : 6) + r() * 8;
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp, vr = (r() - .5) * (big ? 8 : 20);
        return { x: r() * W, y: r() * H, size, vx, vy, bvx: vx, bvy: vy, rot: r() * 360, vr, bvr: vr, path: shape(size, rng(900 + i)), craters: big ? 2 + Math.floor(r() * 2) : 0, seed: i };
      });
      const g = svg.selectAll('g').data(rocks).join('g').style('opacity', 'var(--rock-opacity)')
        .style('pointer-events', 'all').style('cursor', 'grab').style('touch-action', 'none');
      g.append('circle').attr('r', d => Math.max(14, d.size * 1.6)).attr('fill', 'transparent');
      // Arremesso: a velocidade do gesto vira a do asteroide, com teto pelo tamanho.
      g.on('pointerdown', (e, d) => {
        e.preventDefault();
        const start = { x: e.clientX, y: e.clientY, t: performance.now() };
        const up = ev => {
          window.removeEventListener('pointerup', up);
          const dt = Math.max(.04, (performance.now() - start.t) / 1000), dx = ev.clientX - start.x, dy = ev.clientY - start.y;
          if (Math.hypot(dx, dy) < 6) return;
          let vx = dx / dt, vy = dy / dt;
          const sp = Math.hypot(vx, vy), cap = 1800 / Math.sqrt(d.size / 4);
          if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
          d.vx = vx; d.vy = vy; d.vr = (dx >= 0 ? 1 : -1) * Math.min(540, Math.hypot(vx, vy) * .6);
        };
        window.addEventListener('pointerup', up);
      });
      g.append('path').attr('d', d => d.path).attr('fill', 'url(#rockg)').style('stroke', 'var(--rock-edge)').attr('stroke-width', .7);
      g.each(function (d) {
        const rr = rng(500 + d.seed);
        for (let k = 0; k < d.craters; k++) {
          const a = rr() * 6.28, dist = rr() * d.size * .45;
          d3.select(this).append('circle').attr('cx', Math.cos(a) * dist).attr('cy', Math.sin(a) * dist).attr('r', d.size * (.12 + rr() * .12))
            .attr('fill', 'rgba(0,0,0,.28)').attr('stroke', 'rgba(255,255,255,.08)').attr('stroke-width', .6);
        }
      });
      this.rockData = rocks;
      if (reducedMotion()) { g.attr('transform', d => `translate(${d.x},${d.y}) rotate(${d.rot})`); return; }
      let last = performance.now();
      this.rockTimer = d3.timer(() => {
        const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
        // Depois de um arremesso, a velocidade volta aos poucos à de cruzeiro.
        const k = Math.pow(.35, dt);
        g.attr('transform', d => {
          d.vx = d.bvx + (d.vx - d.bvx) * k; d.vy = d.bvy + (d.vy - d.bvy) * k; d.vr = d.bvr + (d.vr - d.bvr) * k;
          d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
          const m = d.size * 2;
          if (d.x < -m) d.x = W + m; else if (d.x > W + m) d.x = -m;
          if (d.y < -m) d.y = H + m; else if (d.y > H + m) d.y = -m;
          return `translate(${d.x},${d.y}) rotate(${d.rot})`;
        });
        // Colisão elástica entre pares (massa ~ área), com um pouco de giro.
        for (let i = 0; i < rocks.length; i++) {
          const a = rocks[i];
          for (let j = i + 1; j < rocks.length; j++) {
            const b = rocks[j], dx = b.x - a.x, dy = b.y - a.y, min = (a.size + b.size) * .82;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const dist = Math.sqrt(d2), nx = dx / dist, ny = dy / dist;
            const ma = a.size * a.size, mb = b.size * b.size, overlap = min - dist;
            a.x -= nx * overlap * mb / (ma + mb); a.y -= ny * overlap * mb / (ma + mb);
            b.x += nx * overlap * ma / (ma + mb); b.y += ny * overlap * ma / (ma + mb);
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel >= 0) continue;
            const imp = -(1 + .85) * rel / (1 / ma + 1 / mb);
            a.vx -= imp / ma * nx; a.vy -= imp / ma * ny;
            b.vx += imp / mb * nx; b.vy += imp / mb * ny;
            const tang = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
            a.vr -= tang * 2 * mb / (ma + mb); b.vr += tang * 2 * ma / (ma + mb);
            [a, b].forEach(q => { const bs = Math.hypot(q.bvx, q.bvy), s = Math.hypot(q.vx, q.vy) || 1; q.bvx = q.vx / s * bs; q.bvy = q.vy / s * bs; });
          }
        }
      });
    }

    // Posições estáveis: calculadas no espaço REF_W×REF_H, na ordem de nascimento,
    // com candidatos sorteados a partir do hash da chave de cada órbita e comparados
    // só às anteriores. O título, a barra do topo, o botão + e o núcleo da galáxia
    // ficam reservados.
    layout(orbits) {
      const W = this.W, H = this.H, rmx = 110, rmy = 104;
      const reserved = [[170, 40, 150], [REF_W - 110, 30, 90], [REF_W - 58, REF_H - 58, 110], [REF_W / 2, REF_H / 2, Math.min(REF_W, REF_H) * .16]];
      const placed = [];
      orbits.forEach(o => {
        const r = rng(hashId(o.key));
        let best = null, bestD = -1;
        for (let k = 0; k < 60; k++) {
          const x = rmx + r() * (REF_W - 2 * rmx), y = rmy + r() * (REF_H - 2 * rmy - 30);
          let d = Infinity;
          placed.forEach(p => { d = Math.min(d, Math.hypot(p[0] - x, (p[1] - y) * 1.25)); });
          reserved.forEach(p => { d = Math.min(d, Math.hypot(p[0] - x, p[1] - y) - p[2] + 60); });
          if (d > bestD) { bestD = d; best = [x, y]; }
        }
        placed.push(best);
      });
      const mx = Math.min(110, W * .12), my = Math.min(110, H * .13);
      return placed.map(([x, y]) => [
        mx + (x - rmx) / (REF_W - 2 * rmx) * (W - 2 * mx),
        my + (y - rmy) / (REF_H - 2 * rmy - 30) * (H - 2 * my - 30)
      ]);
    }

    // Cada órbita é um sistema como o do painel: no centro, a lua (tema escuro) ou o
    // sol (claro); em volta, anéis tracejados na cor da órbita com planetinhas na
    // cor de status (systemTones). Embaixo, o nome, a contagem e a saúde.
    drawOrbits() {
      const el = this.orbitsEl; if (!el || !d3Ready() || !this.W || this.leaving) return;
      const d3 = window.d3, theme = this.state.theme, light = theme === 'light', still = reducedMotion(), stale = this.isStale();
      const orbits = this.orbitsData();
      const pos = this.layout(orbits);
      d3.select(el).selectAll('svg').remove();
      const svg = d3.select(el).append('svg').attr('width', this.W).attr('height', this.H).style('display', 'block').style('pointer-events', 'none');
      const defs = svg.append('defs');
      const f = defs.append('filter').attr('id', 'gglow').attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
      f.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'b');
      const m = f.append('feMerge'); m.append('feMergeNode').attr('in', 'b'); m.append('feMergeNode').attr('in', 'SourceGraphic');

      const rr = rng(53);
      const colorOf = orbitColors(this.state.apps, theme);
      const data = orbits.map((o, i) => {
        const size = Math.min(26, 13 + Math.sqrt(o.n) * 3.2);
        const tones = systemTones(o, this.state.status);
        const rings = tones.length >= 3 ? [size * 1.9, size * 2.9] : [size * 2.3];
        const ph = (hashId(o.key) % 628) / 100;
        return {
          ...o, i, size, rings,
          col: colorOf(o.key),
          x: pos[i][0], y: pos[i][1], bx: pos[i][0], by: pos[i][1],
          // Planetinhas alternando entre os anéis; o de dentro gira mais rápido.
          planets: tones.map((tone, k) => {
            const ring = k % rings.length;
            return { tone, rx: rings[ring], ry: rings[ring] * .42, ph: ph + k * 2.399, sp: .4 / (1 + ring * .55) };
          }),
          // Deriva lenta: duas senoides por eixo com frequência e fase próprias.
          ax: 18 + rr() * 22, ay: 14 + rr() * 18,
          f1: .035 + rr() * .03, f2: .021 + rr() * .02, f3: .028 + rr() * .025, f4: .017 + rr() * .02,
          p1: rr() * 6.28, p2: rr() * 6.28, p3: rr() * 6.28, p4: rr() * 6.28
        };
      });

      const g = svg.selectAll('g.orb').data(data).join('g').attr('class', 'orb').style('pointer-events', 'all')
        .attr('transform', d => `translate(${d.x},${d.y})`).style('cursor', 'pointer')
        .attr('role', 'link').attr('tabindex', 0).attr('aria-label', d => `Abrir a órbita ${d.name}`)
        .on('click', (e, d) => this.enter(d))
        .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.enter(d); } })
        .on('mouseenter', function () { d3.select(this).select('.body').style('transform', 'scale(1.08)'); d3.select(this).selectAll('.ring').attr('stroke-opacity', 1); })
        .on('mouseleave', function () { d3.select(this).select('.body').style('transform', 'scale(1)'); d3.select(this).selectAll('.ring').attr('stroke-opacity', .6); });
      this.orbData = data;

      g.append('circle').attr('r', d => d.size * 3).attr('fill', 'transparent');
      const b = g.append('g').attr('class', 'body').style('transition', 'transform .2s ease');
      b.selectAll('ellipse.ring').data(d => d.rings.map(r => ({ r, col: d.col }))).join('ellipse').attr('class', 'ring')
        .attr('rx', r => r.r).attr('ry', r => r.r * .42).attr('fill', 'none')
        .style('stroke', r => r.col).attr('stroke-width', 1.3).attr('stroke-dasharray', '4 6').attr('stroke-opacity', .6);
      // O núcleo do painel tem raio 17: aqui ele fica com ~70% do tamanho da órbita.
      appendOrbitCore(b.append('g').attr('transform', d => `scale(${d.size * .7 / 17})`), defs, light, 'gglow');
      const planets = b.selectAll('circle.mini').data(d => d.planets).join('circle').attr('class', 'mini')
        .attr('r', 4.6).style('fill', p => (stale ? 'var(--stale)' : statusColor(p.tone)))
        .style('stroke', 'var(--planet-edge)').attr('stroke-width', .8)
        .attr('stroke-dasharray', stale ? '1.5 1.5' : null);
      const planetTick = t => planets.each(function (p) {
        const a = p.ph + t * p.sp;
        this.setAttribute('cx', Math.cos(a) * p.rx); this.setAttribute('cy', Math.sin(a) * p.ry);
      });

      const labelY = d => d.size * 1.3 + 26;
      g.append('text').attr('y', labelY).attr('text-anchor', 'middle').style('fill', 'var(--ink)')
        .style('font', "500 14px 'Inter', sans-serif").style('letter-spacing', '-.01em').text(d => d.name);
      g.append('text').attr('y', d => labelY(d) + 18).attr('text-anchor', 'middle').style('fill', 'var(--muted)')
        .style('font-family', 'var(--mono)').style('font-size', '10.5px').style('font-weight', 500).style('letter-spacing', '.14em')
        .text(d => `${d.n} ${d.n === 1 ? 'APLICAÇÃO' : 'APLICAÇÕES'}`);
      const health = g.append('text').attr('y', d => labelY(d) + 34).attr('text-anchor', 'middle')
        .style('font-family', 'var(--mono)').style('font-size', '10px').style('font-weight', 500).style('letter-spacing', '.14em');
      health.each(function (d) {
        const t = d3.select(this);
        if (!d.checked) { t.style('fill', 'var(--faint)').text('VERIFICANDO'); return; }
        if (stale) { t.style('fill', 'var(--stale)').text(`ÚLTIMO: ${d.down ? `${d.down} FORA` : d.degraded ? `${d.degraded} DEGRADADO` : 'NO AR'}`); return; }
        if (!d.down && !d.degraded) { t.style('fill', 'var(--up)').text('TODAS NO AR'); return; }
        if (d.down) t.append('tspan').style('fill', 'var(--down)').text(`${d.down} FORA`);
        if (d.down && d.degraded) t.append('tspan').style('fill', 'var(--faint)').text(' · ');
        if (d.degraded) t.append('tspan').style('fill', 'var(--warn)').text(`${d.degraded} DEGRADADO`);
      });

      if (this.drift) this.drift.stop();
      this.drift = null;
      if (!this.t0) this.t0 = performance.now();
      const place = t => g.attr('transform', d => {
        d.x = d.bx + d.ax * (.65 * Math.sin(t * d.f1 * 6.28 + d.p1) + .35 * Math.sin(t * d.f2 * 6.28 + d.p2));
        d.y = d.by + d.ay * (.65 * Math.sin(t * d.f3 * 6.28 + d.p3) + .35 * Math.sin(t * d.f4 * 6.28 + d.p4));
        return `translate(${d.x},${d.y})`;
      });
      if (still) { planetTick(0); return; }
      this.drift = d3.timer(() => {
        if (this.leaving) return;
        const t = (performance.now() - this.t0) / 1000;
        planetTick(t);
        place(t);
      });
    }

    // Entrar numa órbita: a galáxia é sugada para o planeta, a tela escurece e o
    // painel abre filtrado por ela.
    enter(d) {
      if (this.leaving || !this.fxEl) return;
      this.leaving = true;
      const W = this.W, H = this.H, light = this.state.theme === 'light';
      const go = () => { location.href = `painel.html?orbita=${encodeURIComponent(d.key)}`; };
      if (reducedMotion()) { this.veilAt(0, 120); setTimeout(go, 130); return; }
      const r = rng(13), parts = [];
      (this.orbData || []).filter(o => o !== d).forEach(o => {
        for (let i = 0; i < 70; i++) { const a = r() * 6.283, rad = Math.sqrt(r()) * o.size * 2; parts.push({ x: o.x + Math.cos(a) * rad, y: o.y + Math.sin(a) * rad, c: o.col, s: .8 + r() * 1.8 }); }
      });
      // O canvas não entende var(): as cores saem já resolvidas pelo navegador
      // (color do root = --ink, fundo do véu = --veil; --rock-mid e --faint são hex nos dois temas).
      const style = getComputedStyle(this.rootEl);
      const rockCol = style.getPropertyValue('--rock-mid').trim();
      const dustCol = light ? style.getPropertyValue('--faint').trim() : style.color;
      (this.rockData || []).forEach(k => { for (let i = 0; i < 10; i++) parts.push({ x: k.x + (r() - .5) * k.size * 2, y: k.y + (r() - .5) * k.size * 2, c: rockCol, s: .7 + r() * 1.3 }); });
      for (let i = 0; i < 220; i++) parts.push({ x: r() * W, y: r() * H, c: dustCol, s: .5 + r() * .9 });
      parts.forEach(q => { q.a0 = Math.atan2(q.y - d.y, q.x - d.x); q.r0 = Math.hypot(q.x - d.x, q.y - d.y); q.dl = r() * .3 + (q.r0 / Math.hypot(W, H)) * .2; q.sw = 1.6 + r() * 1.4; });
      window.d3.select(this.orbitsEl).selectAll('g.orb').filter(o => o !== d).style('transition', 'opacity .16s').style('opacity', 0);
      if (this.rocksEl) { this.rocksEl.style.transition = 'opacity .16s'; this.rocksEl.style.opacity = '0'; }
      if (this.skyEl) { this.skyEl.style.transition = 'opacity .8s ease-in'; this.skyEl.style.opacity = '.25'; }
      const veil = this.veilEl ? getComputedStyle(this.veilEl).backgroundColor : style.backgroundColor;
      this.runFx(ENTER_MS, (ctx, p) => {
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
        parts.forEach(q => {
          const e = easeCubicIn(clamp01((p - q.dl) / .62));
          if (e >= 1) return;
          const rad = q.r0 * (1 - e), ang = q.a0 + e * q.sw, s = q.s * (1 - e * .5);
          ctx.globalAlpha = 1 - e * .6; ctx.fillStyle = q.c;
          ctx.fillRect(d.x + Math.cos(ang) * rad - s / 2, d.y + Math.sin(ang) * rad - s / 2, s, s);
        });
        ctx.globalAlpha = Math.pow(clamp01((p - .6) / .4), 1.6);
        ctx.globalCompositeOperation = 'source-over';
        if (ctx.globalAlpha > 0) { ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H); }
        ctx.globalAlpha = 1;
      }, go);
      this.veilAt(VEIL_AT_MS, 180);
    }
    runFx(dur, frame, done) {
      const cv = this.fxEl, W = this.W, H = this.H, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr;
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t0 = performance.now();
      const loop = () => { const p = Math.min(1, (performance.now() - t0) / dur); frame(ctx, p); if (p < 1) requestAnimationFrame(loop); else done(); };
      requestAnimationFrame(loop);
    }
    veilAt(ms, dur) {
      const v = this.veilEl; if (!v) return;
      v.style.transition = `opacity ${dur}ms ease`;
      setTimeout(() => { v.style.opacity = '1'; }, ms);
    }

    rootRef = el => { this.rootEl = el; if (el) this.applyTheme(); };
    skyRef = el => { this.skyEl = el; };
    twinkleRef = el => { this.twinkleEl = el; };
    rocksRef = el => { this.rocksEl = el; };
    orbitsRef = el => { this.orbitsEl = el; };
    fxRef = el => { this.fxEl = el; };
    veilRef = el => { this.veilEl = el; };

    // Cadastro feito (app-form.js): a app entra na lista, e uma órbita nova vira planeta.
    onAppCreated(app, done) {
      const apps = [...this.state.apps.filter(x => x.id !== app.id), app];
      try { localStorage.setItem(AKEY, JSON.stringify(apps)); } catch (e) {}
      this.setState({ apps, ...done }, () => this.drawOrbits());
    }

    toggleTheme = () => {
      const theme = this.state.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(TKEY, theme); } catch (e) {}
      this.setState({ theme }, () => { this.applyTheme(); this.drawOrbits(); });
    };
    retry = () => {
      if (!this.es || this.es.readyState === EventSource.CLOSED) this.connectEvents();
      this.loadApps();
    };

    renderVals() {
      const { theme, apiDown, lastOk, d3Failed, apps } = this.state;
      const light = theme === 'light';
      const empty = !apps.some(a => a.orbits.length);
      return {
        monoControl: MONO_CONTROL, monoSmall: MONO_SMALL, monoEyebrow: MONO_EYEBROW,
        stop: stopEvent,
        rootRef: this.rootRef, skyRef: this.skyRef, twinkleRef: this.twinkleRef, rocksRef: this.rocksRef,
        orbitsRef: this.orbitsRef, fxRef: this.fxRef, veilRef: this.veilRef,
        isLight: light,
        themeLabel: light ? 'LIGHT' : 'DARK',
        trackStyle: swTrack(light),
        knobStyle: swKnob(light),
        toggleTheme: this.toggleTheme,
        apiDown,
        stormMsg: lastOk
          ? `A saúde das órbitas é da última checagem, às ${clockLabel(lastOk)} (${agoLabel(lastOk)}). Tentando reconectar…`
          : 'Nenhuma checagem foi concluída ainda. Tentando reconectar…',
        retry: this.retry,
        d3Failed,
        isEmpty: empty && !d3Failed,
        emptyMsg: apiDown && !apps.length
          ? 'Não foi possível carregar as aplicações. Tentando reconectar…'
          : 'Nenhuma órbita ainda. Use o botão + para lançar a primeira aplicação.',
        ...this.formVals()
      };
    }
  });
}
