"use strict";

/* ==================================================================
   NFSS GEOSAFE — LEAFLET SATELLITE BASEMAP
   Adds Esri World Imagery as an optional basemap while preserving the
   existing OpenStreetMap default and every operational overlay.
================================================================== */

window.NFSS_SATELLITE_LAYER_VERSION = "2026-08-25-1";

(function installSatelliteBasemap() {

  const MAX_ATTEMPTS = 120;
  const RETRY_MS = 250;
  let attempts = 0;

  function findStreetBasemap(map) {
    let streetLayer = null;

    map.eachLayer(layer => {
      if (
        !streetLayer &&
        layer instanceof L.TileLayer &&
        typeof layer._url === "string" &&
        layer._url.includes("openstreetmap.org")
      ) {
        streetLayer = layer;
      }
    });

    return streetLayer;
  }

  function install() {
    attempts += 1;

    if (
      typeof L === "undefined" ||
      typeof STATE === "undefined" ||
      !STATE.map
    ) {
      if (attempts < MAX_ATTEMPTS) {
        window.setTimeout(install, RETRY_MS);
      }
      return;
    }

    const map = STATE.map;

    if (map.__nfssSatelliteBasemapInstalled) {
      return;
    }

    const streetLayer = findStreetBasemap(map);

    if (!streetLayer) {
      if (attempts < MAX_ATTEMPTS) {
        window.setTimeout(install, RETRY_MS);
      }
      return;
    }

    const satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution:
          "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
      }
    );

    const basemapControl = L.control.layers(
      {
        "Street Map": streetLayer,
        "Satellite": satelliteLayer
      },
      null,
      {
        position: "topleft",
        collapsed: window.matchMedia("(max-width: 900px)").matches
      }
    );

    basemapControl.addTo(map);

    map.__nfssSatelliteBasemapInstalled = true;
    map.__nfssStreetBasemap = streetLayer;
    map.__nfssSatelliteBasemap = satelliteLayer;
    map.__nfssBasemapControl = basemapControl;

    map.on("baselayerchange", event => {
      console.log("NFSS GeoSafe basemap changed:", event.name);
    });

    console.log(
      "NFSS GeoSafe satellite basemap enabled.",
      window.NFSS_SATELLITE_LAYER_VERSION
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }

})();
