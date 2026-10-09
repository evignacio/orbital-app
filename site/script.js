// Orbital — comportamento da página de apresentação: menu no celular,
// botões de copiar, céu estrelado e aparição das seções ao rolar.
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Menu no celular
  const menuBtn = document.querySelector('.menu-btn');
  const nav = document.getElementById('nav');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  // Copiar comandos: copia o texto do bloco sem o prompt "$ ".
  document.querySelectorAll('.copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.closest('.term').querySelector('pre code');
      const text = Array.from(code.childNodes)
        .filter(n => !(n.nodeType === 1 && n.classList.contains('p')))
        .map(n => n.textContent).join('').trim();
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copiado';
        btn.classList.add('done');
      } catch (e) {
        btn.textContent = 'Copie manualmente';
      }
      setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('done'); }, 1800);
    });
  });

  // Seções aparecem ao entrar na tela.
  const reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    reveals.forEach(el => io.observe(el));
  }

  // Céu estrelado do topo, com estrelas piscando devagar.
  const canvas = document.getElementById('stars');
  const ctx = canvas.getContext('2d');
  let stars = [];
  let raf = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(width * height / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.2 + .3,
      base: Math.random() * .5 + .15,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * .0015 + .0005
    }));
    draw(0);
  }

  function draw(t) {
    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    for (const s of stars) {
      const a = reduceMotion ? s.base : s.base + Math.sin(t * s.speed + s.phase) * .2;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(t) {
    draw(t);
    raf = requestAnimationFrame(loop);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!reduceMotion) {
    // Só anima enquanto o topo está visível.
    new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf);
      if (entry.isIntersecting) raf = requestAnimationFrame(loop);
    }).observe(canvas);
  }
})();
