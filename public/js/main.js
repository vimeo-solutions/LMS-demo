// main.js — site-wide vanilla JS
// Keep this file small. Page-specific JS should live alongside that page's files.

(function () {
  'use strict';

  // ── Mobile nav toggle ───────────────────────────────────────
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Close nav when a link is clicked
    links.addEventListener('click', (e) => {
      if (e.target.closest('.nav__link')) {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ── Active nav link highlight ───────────────────────────────
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav__link').forEach((link) => {
    const href = link.getAttribute('href');
    if (href !== '/' && currentPath.startsWith(href)) {
      link.style.color = 'var(--color-accent)';
    }
  });

  // ── Code block copy button ──────────────────────────────────
  document.querySelectorAll('.code-block__copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pre  = btn.closest('.code-block').querySelector('.code-block__code');
      const text = pre ? pre.textContent : '';
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 1800);
      });
    });
  });

})();
