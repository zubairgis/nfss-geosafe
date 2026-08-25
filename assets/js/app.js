/*
  NFSS GeoSafe loader.
  The original validated application is preserved as app-original.js.
  live-fix.js is loaded immediately afterwards, before DOMContentLoaded,
  so the existing dashboard uses the corrected live backend transport.
*/
document.write(
  '<script src="assets/js/app-original.js?v=20260825-1"><\/script>' +
  '<script src="assets/js/live-fix.js?v=20260825-1"><\/script>'
);
