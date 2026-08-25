/*
  NFSS GeoSafe loader.
  The original validated application is preserved as app-original.js.
  live-fix.js keeps the working CORS live-report connection.
  map-alert.js adds blinking map alerts for Unverified observations.
*/
document.write(
  '<script src="assets/js/app-original.js?v=20260825-3"><\/script>' +
  '<script src="assets/js/live-fix.js?v=20260825-3"><\/script>' +
  '<script src="assets/js/map-alert.js?v=20260825-3"><\/script>'
);
