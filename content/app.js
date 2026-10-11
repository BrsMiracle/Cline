// Small helpers: nav highlighting, itinerary switcher, image zoom, table search.
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.topnav a[href^="#"]'));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });

  function onScroll() {
    var y = window.scrollY + 120, best = 0;
    sections.forEach(function (s, i) { if (s && s.offsetTop <= y) best = i; });
    links.forEach(function (a, i) { a.classList.toggle('active', i === best); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // itinerary tabs
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

  // simple lightbox for card images
  var box = null;
  document.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('.acard img, .hero-img img') : null;
    if (!img) { if (box) { box.remove(); box = null; } return; }
    if (box) { box.remove(); }
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(8,20,26,.92);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out';
    var big = document.createElement('img');
    big.src = img.src;
    big.style.cssText = 'max-width:96vw;max-height:92vh;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5)';
    box.appendChild(big);
    document.body.appendChild(box);
  });
})();
