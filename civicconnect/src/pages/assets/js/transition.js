// Shared page transition: slides the form content out, navigates, slides the new one in.
(function () {
  const view = document.querySelector('.view');
  if (!view) return;

  // Entering: come in from the direction we were navigating
  if (sessionStorage.getItem('navDir') === 'back') view.classList.add('enter-back');
  sessionStorage.removeItem('navDir');

  // Restore state if the page is shown from the back/forward cache
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) view.classList.remove('leaving', 'to-back');
  });

  document.querySelectorAll('a[data-nav]').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (link.getAttribute('aria-current') === 'page') return;

      const back = link.dataset.nav === 'back';
      sessionStorage.setItem('navDir', link.dataset.nav);
      view.classList.add('leaving');
      if (back) view.classList.add('to-back');

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => { window.location.href = link.href; }, reduce ? 0 : 200);
    });
  });

  // Show/hide password
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Confirm-password check (registration page only)
  const pw = document.getElementById('reg-password');
  const confirm = document.getElementById('confirm-password');
  if (pw && confirm) {
    const check = () => confirm.setCustomValidity(pw.value === confirm.value ? '' : 'Passwords do not match');
    pw.addEventListener('input', check);
    confirm.addEventListener('input', check);
  }
})();
