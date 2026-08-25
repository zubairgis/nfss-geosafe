/*
  NFSS GeoSafe loader.
  The original validated application is preserved as app-original.js.
  live-fix.js keeps the working CORS live-report connection.
  map-alert.js adds blinking map alerts for Unverified observations.
  volunteer-link.js adds the registered volunteer Google Form link.
*/
document.write(
  '<script src="assets/js/app-original.js?v=20260825-4"><\/script>' +
  '<script src="assets/js/live-fix.js?v=20260825-4"><\/script>' +
  '<script src="assets/js/map-alert.js?v=20260825-4"><\/script>' +
  '<script src="assets/js/volunteer-link.js?v=20260825-4"><\/script>'
);
