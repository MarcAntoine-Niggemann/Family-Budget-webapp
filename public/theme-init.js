(function () {
  try {
    var saved = localStorage.getItem('fbv_theme');
    var pref = (saved === 'light' || saved === 'dark' || saved === 'system') ? saved : 'system';
    var isDark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = isDark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0f172a' : '#f8fafc');
  } catch (e) {}
})();
