// Small helpers: nav highlighting, itinerary switcher, image zoom, table search.
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.topnav a[href^="#"]'));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });

  // ---- reading progress + back to top -------------------------------------
  var bar = document.createElement('div');
  bar.id = 'progress';
  document.body.appendChild(bar);

  var top = document.createElement('button');
  top.id = 'toTop';
  top.setAttribute('aria-label', '回到顶部');
  top.innerHTML = '↑';
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.body.appendChild(top);

  function onScroll() {
    // nav highlight
    var y = window.scrollY + 120, best = 0;
    sections.forEach(function (s, i) { if (s && s.offsetTop <= y) best = i; });
    links.forEach(function (a, i) { a.classList.toggle('active', i === best); });

    // progress
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
    top.classList.toggle('on', window.scrollY > 700);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  // ---- reveal on scroll ---------------------------------------------------
  var targets = document.querySelectorAll(
    'section > .card, section > .grid, section > .tw, section > .note, section > .day, section > .sec-head'
  );
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    targets.forEach(function (t, i) {
      t.classList.add('reveal');
      t.style.transitionDelay = Math.min(i % 6, 5) * 40 + 'ms';
      io.observe(t);
    });
  }

  // ---- itinerary tabs -----------------------------------------------------
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var btns = group.querySelectorAll('[data-tab]');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-tab');
        btns.forEach(function (b) { b.classList.toggle('active', b === btn); });
        group.querySelectorAll('[data-panel]').forEach(function (p) {
          p.style.display = p.getAttribute('data-panel') === id ? '' : 'none';
        });
      });
    });
  });

  // ---- lightbox -----------------------------------------------------------
  var box = null;
  document.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('.acard img, .hero-img img, .hero-gallery img') : null;
    if (!img) { if (box) { box.remove(); box = null; } return; }
    if (box) { box.remove(); }
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(6,24,30,.93);display:flex;' +
      'align-items:center;justify-content:center;padding:24px;cursor:zoom-out;backdrop-filter:blur(3px)';
    var big = document.createElement('img');
    big.src = img.src;
    big.style.cssText = 'max-width:96vw;max-height:92vh;border-radius:12px;' +
      'box-shadow:0 24px 70px rgba(0,0,0,.6)';
    box.appendChild(big);
    document.body.appendChild(box);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && box) { box.remove(); box = null; }
  });
})();

