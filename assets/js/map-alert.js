"use strict";

/* ==================================================================
   NFSS GEOSAFE — UNVERIFIED MAP ALERT MARKERS
   Loaded after app-original.js and live-fix.js.
   Keeps the validated application intact and overrides only the
   report point rendering on the Leaflet map.
================================================================== */

window.NFSS_MAP_ALERT_VERSION = "2026-08-25-1";

(function installUnverifiedMapAlerts() {

  const styleId = "nfss-unverified-map-alert-style";

  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .nfss-unverified-icon-wrapper {
        background: transparent !important;
        border: none !important;
      }

      .nfss-alert-marker {
        position: relative;
        width: 30px;
        height: 38px;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        overflow: visible;
        cursor: pointer;
      }

      .nfss-alert-ping {
        position: absolute;
        top: 2px;
        left: 4px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(220, 38, 38, 0.30);
        animation: nfssAlertPulse 1.35s ease-out infinite;
        pointer-events: none;
      }

      .nfss-alert-core {
        position: absolute;
        top: 2px;
        left: 4px;
        width: 22px;
        height: 22px;
        box-sizing: border-box;
        border-radius: 50%;
        background: #dc2626;
        color: #ffffff;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.32);
        font: 800 14px/18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
        z-index: 3;
        pointer-events: none;
      }

      .nfss-alert-tip {
        position: absolute;
        top: 21px;
        left: 9px;
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 11px solid #dc2626;
        z-index: 2;
        pointer-events: none;
      }

      .nfss-alert-marker.is-demo .nfss-alert-core {
        background: #f59e0b;
      }

      .nfss-alert-marker.is-demo .nfss-alert-tip {
        border-top-color: #f59e0b;
      }

      .nfss-alert-marker.is-demo .nfss-alert-ping {
        background: rgba(245, 158, 11, 0.30);
      }

      @keyframes nfssAlertPulse {
        0% {
          transform: scale(0.72);
          opacity: 0.95;
        }
        70% {
          transform: scale(2.05);
          opacity: 0;
        }
        100% {
          transform: scale(2.05);
          opacity: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .nfss-alert-ping {
          animation: none;
          opacity: 0.35;
        }
      }
    `;
    document.head.appendChild(style);
  }

  window.isUnverifiedMapPoint = function isUnverifiedMapPoint(properties) {
    return String(properties?.verification_status || "")
      .trim()
      .toLowerCase() === "unverified";
  };

  window.buildUnverifiedAlertIcon = function buildUnverifiedAlertIcon(feature) {
    const markerClass = feature.properties.is_live_backend
      ? "is-live"
      : "is-demo";

    return L.divIcon({
      className: "nfss-unverified-icon-wrapper",
      html: `
        <div class="nfss-alert-marker ${markerClass}" title="Unverified observation">
          <span class="nfss-alert-ping"></span>
          <span class="nfss-alert-core">!</span>
          <span class="nfss-alert-tip"></span>
        </div>
      `,
      iconSize: [30, 38],
      iconAnchor: [15, 34],
      popupAnchor: [0, -30]
    });
  };

  window.buildReportPointLayer = function buildReportPointLayer(feature, latlng) {
    if (window.isUnverifiedMapPoint(feature.properties)) {
      return L.marker(latlng, {
        icon: window.buildUnverifiedAlertIcon(feature),
        zIndexOffset: 1200,
        keyboard: true,
        title: `Unverified observation: ${feature.properties.report_id || "Report"}`
      });
    }

    return L.circleMarker(latlng, {
      radius: feature.properties.is_live_backend ? 9 : 8,
      weight: feature.properties.is_live_backend ? 3 : 2,
      color: feature.properties.is_live_backend ? "#0b5c9e" : "#ffffff",
      fillColor: reportColor(feature.properties.status),
      fillOpacity: 0.95
    });
  };

  window.renderReportsLayer = function renderReportsLayerWithUnverifiedAlerts() {
    const features = filteredReports();

    const collection = {
      type: "FeatureCollection",
      features: features
    };

    const layerOptions = {
      pointToLayer: (feature, latlng) =>
        window.buildReportPointLayer(feature, latlng),

      onEachFeature: (feature, layer) => {
        const p = feature.properties;

        layer.bindPopup(
          layerPopup(
            p.report_id,
            [
              ["Category", p.report_category],
              ["Community", p.community_name],
              ["Status", p.status],
              ["Verification", p.verification_status],
              ["Submitted", p.submitted_at],
              [
                "Registry",
                p.is_live_backend
                  ? "Central live backend"
                  : "Static synthetic demonstration"
              ]
            ],
            true
          )
        );

        layer.on("click", () => showReportInspector(p));
      }
    };

    if (!STATE.reportsLayer) {
      STATE.reportsLayer = L.geoJSON(collection, layerOptions);
      STATE.reportsLayer.addTo(STATE.map);
      return;
    }

    STATE.reportsLayer.clearLayers();
    STATE.reportsLayer.options = layerOptions;
    STATE.reportsLayer.addData(collection);

    if (!STATE.map.hasLayer(STATE.reportsLayer)) {
      STATE.reportsLayer.addTo(STATE.map);
    }
  };

  console.log(
    "NFSS GeoSafe unverified map alert markers enabled.",
    window.NFSS_MAP_ALERT_VERSION
  );

})();
