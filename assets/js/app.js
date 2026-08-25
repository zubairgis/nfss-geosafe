
"use strict";


/* ==================================================================
   NFSS GEOSAFE — STEP 9B FRONT END
================================================================== */


const PATHS = {

  boundary:
    "data/boundary.geojson",

  communities:
    "data/communities.geojson",

  clusters:
    "data/building_clusters.geojson",

  contextGrid:
    "data/operational_context_grid_500m.geojson",

  roads:
    "data/roads.geojson",

  waterways:
    "data/waterways.geojson",

  waterTransport:
    "data/water_transport.geojson",

  health:
    "data/health_facilities.geojson",

  schools:
    "data/schools.geojson",

  police:
    "data/police_context.geojson",

  reports:
    "data/demo_reports.geojson",

  actions:
    "data/demo_report_actions.json",

  categories:
    "config/report_categories.json",

  workflow:
    "config/workflow.json",

  config:
    "config/dashboard_config.json",

  provenance:
    "metadata/provenance.json",

  backendConfig:
    "config/backend.json"

};


const STATE = {

  data: {},

  map: null,

  layers: {},

  reportsLayer: null,

  contextGridLayer: null,

  contextGridLoaded: false,

  charts: {},

  workflowStatuses: [
    "Submitted",
    "Under Review",
    "Verified",
    "Assigned",
    "Resolved",
    "Closed"
  ],

  liveReports: [],

  backend: {
    config: null,
    connected: false,
    health: null
  },

  backendPollTimer: null,

  liveReportSignature: "",

  commandSessionKey: "",

  commandSelectedReportId: "",

  commandHistory: []

};


const LOCAL_REPORT_KEY =
  "nfss_geosafe_step9b_local_reports";

const STATUS_OVERRIDE_KEY =
  "nfss_geosafe_step9b_status_overrides";


/* ==================================================================
   HELPERS
================================================================== */


function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function numberFormat(
  value,
  digits = 0
) {

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return n.toLocaleString(
    undefined,
    {
      maximumFractionDigits: digits
    }
  );
}


function distanceFormat(value) {

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  if (n < 1000) {
    return `${numberFormat(n, 0)} m`;
  }

  return `${numberFormat(n / 1000, 2)} km`;
}


function slug(value) {

  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}


async function getJSON(path) {

  const response = await fetch(
    path,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {

    throw new Error(
      `Failed to load ${path}: ${response.status}`
    );
  }

  return response.json();
}


function getLocalReports() {

  try {

    return JSON.parse(
      localStorage.getItem(
        LOCAL_REPORT_KEY
      ) || "[]"
    );

  } catch {

    return [];
  }
}


function saveLocalReports(reports) {

  localStorage.setItem(
    LOCAL_REPORT_KEY,
    JSON.stringify(reports)
  );
}


function getStatusOverrides() {

  try {

    return JSON.parse(
      localStorage.getItem(
        STATUS_OVERRIDE_KEY
      ) || "{}"
    );

  } catch {

    return {};
  }
}


function saveStatusOverrides(data) {

  localStorage.setItem(
    STATUS_OVERRIDE_KEY,
    JSON.stringify(data)
  );
}


function statusClass(status) {

  return (
    "status-" +
    slug(status)
  );
}


function makeStatusBadge(status) {

  return `
    <span class="status-badge ${statusClass(status)}">
      ${escapeHtml(status)}
    </span>
  `;
}


function allReportFeatures() {

  const base =
    STATE.data.reports?.features || [];


  const live =
    STATE.liveReports || [];


  const overrides =
    getStatusOverrides();


  return [
    ...base,
    ...live
  ].map(
    feature => {

      const copy =
        structuredClone(
          feature
        );


      const p =
        copy.properties;


      /*
        Local workflow overrides apply ONLY to static demonstration
        records.

        Live backend records must retain the central status supplied
        by the server.
      */

      if (
        !p.is_live_backend &&
        overrides[
          p.report_id
        ]
      ) {

        p.status =
          overrides[
            p.report_id
          ];


        p.verification_status =
          [
            "Verified",
            "Assigned",
            "Resolved",
            "Closed"
          ].includes(
            p.status
          )
            ? "Verified"
            : (
                p.status ===
                "Under Review"
                  ? "Pending review"
                  : "Unverified"
              );
      }


      return copy;
    }
  );
}


function layerPopup(
  title,
  rows,
  demo = false
) {

  const body = rows
    .filter(row => row[1] !== undefined)
    .map(
      row => `
        <div class="inspect-row">
          <span>${escapeHtml(row[0])}</span>
          <strong>${escapeHtml(row[1])}</strong>
        </div>
      `
    )
    .join("");


  return `
    ${demo
      ? '<div class="popup-demo">SYNTHETIC DEMONSTRATION</div>'
      : ""
    }

    <div class="popup-title">
      ${escapeHtml(title)}
    </div>

    ${body}
  `;
}


function setInspector(
  title,
  rows,
  note = ""
) {

  const content =
    document.getElementById(
      "inspectorContent"
    );

  content.innerHTML = `

    <h3>
      ${escapeHtml(title)}
    </h3>

    ${rows.map(
      row => `
        <div class="inspect-row">
          <span>${escapeHtml(row[0])}</span>
          <strong>${escapeHtml(row[1])}</strong>
        </div>
      `
    ).join("")}

    ${note
      ? `<div class="context-warning">${escapeHtml(note)}</div>`
      : ""
    }
  `;
}


function uniqueSorted(values) {

  return [
    ...new Set(
      values
        .filter(Boolean)
    )
  ].sort();
}


function populateSelect(
  select,
  values,
  firstLabel = null
) {

  const existingFirst =
    select.querySelector("option");

  select.innerHTML = "";

  if (firstLabel !== null) {

    const option =
      document.createElement("option");

    option.value = "ALL";
    option.textContent =
      firstLabel;

    select.appendChild(option);

  } else if (existingFirst) {

    select.appendChild(
      existingFirst
    );
  }


  for (const value of values) {

    const option =
      document.createElement("option");

    option.value = value;
    option.textContent = value;

    select.appendChild(option);
  }
}




/* NFSS STEP 9C2 LIVE BACKEND FUNCTIONS */


/* ==================================================================
   JSONP

   Apps Script ContentService is consumed with JSONP for GET requests.
   This avoids browser CORS restrictions on a static GitHub dashboard.
================================================================== */


function jsonpRequest(
  baseUrl,
  parameters = {},
  timeoutMs = 15000
) {

  return new Promise(
    (resolve, reject) => {

      const callbackName =
        "__nfssGeoSafe_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2);


      const query =
        new URLSearchParams();


      for (
        const [key, value] of
        Object.entries(
          parameters
        )
      ) {

        if (
          value !== undefined &&
          value !== null
        ) {

          query.set(
            key,
            String(value)
          );
        }
      }


      query.set(
        "callback",
        callbackName
      );


      const script =
        document.createElement(
          "script"
        );


      let finished =
        false;


      const cleanup = () => {

        if (finished) {
          return;
        }


        finished =
          true;


        clearTimeout(
          timer
        );


        try {
          delete window[
            callbackName
          ];
        } catch (_) {}


        script.remove();
      };


      window[
        callbackName
      ] = data => {

        cleanup();

        resolve(
          data
        );
      };


      script.onerror = () => {

        cleanup();

        reject(
          new Error(
            "Could not reach NFSS GeoSafe backend."
          )
        );
      };


      const timer =
        window.setTimeout(
          () => {

            cleanup();

            reject(
              new Error(
                "NFSS GeoSafe backend request timed out."
              )
            );
          },
          timeoutMs
        );


      script.src =
        baseUrl +
        "?" +
        query.toString();


      document.head.appendChild(
        script
      );
    }
  );
}


/* ==================================================================
   BACKEND STATUS BADGE
================================================================== */


function setBackendStatus(
  state,
  message
) {

  const badge =
    document.getElementById(
      "backendStatusBadge"
    );


  if (!badge) {
    return;
  }


  badge.classList.remove(
    "backend-connecting",
    "backend-connected",
    "backend-error"
  );


  if (
    state ===
    "connected"
  ) {

    badge.classList.add(
      "backend-connected"
    );

    badge.textContent =
      "● Central backend connected";

  } else if (
    state ===
    "error"
  ) {

    badge.classList.add(
      "backend-error"
    );

    badge.textContent =
      "● Central backend unavailable";

  } else {

    badge.classList.add(
      "backend-connecting"
    );

    badge.textContent =
      message ||
      "● Connecting to central backend…";
  }
}


/* ==================================================================
   COMMUNITY CONTEXT LOOKUP
================================================================== */


function backendCommunityContext(
  report
) {

  const communities =
    STATE.data.communities?.features ||
    [];


  let feature = null;


  if (
    report.community_id
  ) {

    feature =
      communities.find(
        item =>
          item.properties.community_id ===
          report.community_id
      );
  }


  if (
    !feature &&
    report.community_name
  ) {

    const target =
      String(
        report.community_name
      )
      .trim()
      .toLowerCase();


    feature =
      communities.find(
        item =>
          String(
            item.properties.name ||
            ""
          )
          .trim()
          .toLowerCase() ===
          target
      );
  }


  return feature
    ? feature.properties
    : {};
}


/* ==================================================================
   NORMALISE ONE CENTRAL REPORT -> GEOJSON FEATURE
================================================================== */


function normaliseBackendReport(
  report
) {

  const lat =
    Number(
      report.latitude
    );


  const lng =
    Number(
      report.longitude
    );


  const community =
    backendCommunityContext(
      report
    );


  return {

    type:
      "Feature",

    geometry: {

      type:
        "Point",

      coordinates: [
        lng,
        lat
      ]
    },

    properties: {

      report_id:
        report.report_id,

      is_demo:
        true,

      is_live_backend:
        true,

      report_category:
        report.report_category,

      description:
        report.description,

      submitted_at:
        report.submitted_at,

      status:
        report.status ||
        "Submitted",

      verification_status:
        report.verification_status ||
        "Unverified",

      evidence_attached_demo:
        Boolean(
          report.evidence_attached
        ),

      community_id:
        report.community_id || null,

      community_name:
        report.community_name ||
        community.name ||
        "Not specified",

      population_context_1km:
        community.population_1km ??
        null,

      buildings_context_1km:
        community.buildings_1km ??
        null,

      distance_any_road_m:
        community.distance_any_road_m ??
        null,

      nearest_road_group:
        community.nearest_road_group ??
        null,

      distance_waterway_m:
        community.distance_waterway_m ??
        null,

      nearest_waterway_type:
        community.nearest_waterway_type ??
        null,

      source_type:
        report.source_type ||
        "Central NFSS GeoSafe backend submission",

      public_disclaimer:
        report.public_disclaimer ||
        "SUBMITTED OBSERVATION — NOT YET VERIFIED"

    }
  };
}


/* ==================================================================
   CENTRAL REPORT SIGNATURE

   Used to redraw the dashboard only when the central registry changes.
================================================================== */


function centralReportSignature(
  reports
) {

  return JSON.stringify(
    reports
      .map(
        report => [
          report.report_id,
          report.status,
          report.verification_status,
          report.submitted_at
        ]
      )
      .sort(
        (a, b) =>
          String(a[0])
            .localeCompare(
              String(b[0])
            )
      )
  );
}


/* ==================================================================
   LOAD CENTRAL REPORTS
================================================================== */


async function loadCentralReports(
  refreshDashboard = true
) {

  if (
    !STATE.backend.config?.enabled
  ) {

    return [];
  }


  const url =
    STATE.backend.config
      .web_app_url;


  const response =
    await jsonpRequest(
      url,
      {
        action:
          "reports"
      }
    );


  if (
    !response ||
    response.success !== true ||
    !Array.isArray(
      response.reports
    )
  ) {

    throw new Error(
      response?.error ||
      "Invalid reports response from central backend."
    );
  }


  const signature =
    centralReportSignature(
      response.reports
    );


  const changed =
    signature !==
    STATE.liveReportSignature;


  STATE.liveReportSignature =
    signature;


  STATE.liveReports =
    response.reports
      .filter(
        report =>
          Number.isFinite(
            Number(
              report.latitude
            )
          )
          &&
          Number.isFinite(
            Number(
              report.longitude
            )
          )
      )
      .map(
        normaliseBackendReport
      );


  STATE.backend.connected =
    true;


  setBackendStatus(
    "connected"
  );


  if (
    refreshDashboard &&
    changed &&
    STATE.map
  ) {

    refreshReportComponents();
  }


  return response.reports;
}


/* ==================================================================
   INITIALIZE CENTRAL BACKEND
================================================================== */


async function initializeLiveBackend() {

  try {

    setBackendStatus(
      "connecting"
    );


    const config =
      await getJSON(
        PATHS.backendConfig
      );


    STATE.backend.config =
      config;


    if (
      !config.enabled
    ) {

      setBackendStatus(
        "error"
      );

      return;
    }


    const health =
      await jsonpRequest(
        config.web_app_url,
        {
          action:
            "health"
        }
      );


    if (
      !health ||
      health.success !== true
    ) {

      throw new Error(
        health?.error ||
        "Backend health check failed."
      );
    }


    STATE.backend.health =
      health;


    STATE.backend.connected =
      true;


    setBackendStatus(
      "connected"
    );


    /*
      Load reports before map/table construction so live records
      are available immediately at startup.
    */

    await loadCentralReports(
      false
    );


    console.log(
      "NFSS GeoSafe central backend connected.",
      health
    );


  } catch (error) {

    console.error(
      "NFSS backend connection error:",
      error
    );


    STATE.backend.connected =
      false;


    setBackendStatus(
      "error"
    );
  }
}


/* ==================================================================
   BACKGROUND POLLING

   Default = every 12 seconds.
================================================================== */


function startBackendPolling() {

  if (
    STATE.backendPollTimer
  ) {

    clearInterval(
      STATE.backendPollTimer
    );
  }


  if (
    !STATE.backend.config?.enabled
  ) {

    return;
  }


  const seconds =
    Math.max(
      5,
      Number(
        STATE.backend.config.poll_seconds ||
        12
      )
    );


  STATE.backendPollTimer =
    window.setInterval(

      async () => {

        try {

          await loadCentralReports(
            true
          );

        } catch (error) {

          console.warn(
            "Backend polling failed:",
            error
          );


          STATE.backend.connected =
            false;


          setBackendStatus(
            "error"
          );
        }

      },

      seconds *
      1000

    );
}


/* ==================================================================
   WAIT
================================================================== */


function sleepMs(ms) {

  return new Promise(
    resolve =>
      window.setTimeout(
        resolve,
        ms
      )
  );
}


/* ==================================================================
   FIND NEWLY SUBMITTED REPORT

   POST response cannot reliably be read cross-origin from Apps Script,
   so after POST we query the central registry using JSONP and identify
   the newly inserted matching record.
================================================================== */


function findMatchingSubmittedReport(
  reports,
  submission
) {

  const matches =
    reports.filter(
      report => {

        const sameCategory =
          report.report_category ===
          submission.category;


        const sameDescription =
          String(
            report.description ||
            ""
          ) ===
          submission.description;


        const sameLat =
          Math.abs(
            Number(
              report.latitude
            )
            -
            submission.latitude
          )
          <
          0.0000015;


        const sameLng =
          Math.abs(
            Number(
              report.longitude
            )
            -
            submission.longitude
          )
          <
          0.0000015;


        return (
          sameCategory &&
          sameDescription &&
          sameLat &&
          sameLng
        );
      }
    );


  if (
    matches.length === 0
  ) {

    return null;
  }


  return matches[
    matches.length - 1
  ];
}




/* ==================================================================
   LOAD DATA
================================================================== */


async function loadCoreData() {

  const [
    boundary,
    communities,
    clusters,
    roads,
    waterways,
    waterTransport,
    health,
    schools,
    police,
    reports,
    actions,
    categories,
    workflow,
    config,
    provenance
  ] = await Promise.all([

    getJSON(PATHS.boundary),
    getJSON(PATHS.communities),
    getJSON(PATHS.clusters),
    getJSON(PATHS.roads),
    getJSON(PATHS.waterways),
    getJSON(PATHS.waterTransport),
    getJSON(PATHS.health),
    getJSON(PATHS.schools),
    getJSON(PATHS.police),
    getJSON(PATHS.reports),
    getJSON(PATHS.actions),
    getJSON(PATHS.categories),
    getJSON(PATHS.workflow),
    getJSON(PATHS.config),
    getJSON(PATHS.provenance)

  ]);


  STATE.data = {

    boundary,
    communities,
    clusters,
    roads,
    waterways,
    waterTransport,
    health,
    schools,
    police,
    reports,
    actions,
    categories,
    workflow,
    config,
    provenance

  };


  if (
    Array.isArray(
      workflow.statuses
    )
  ) {

    STATE.workflowStatuses =
      workflow.statuses;
  }
}


/* ==================================================================
   MAP
================================================================== */


function initializeMap() {

  const map =
    L.map(
      "map",
      {
        preferCanvas: true
      }
    );


  STATE.map = map;


  const baseLight =
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          "&copy; OpenStreetMap contributors"
      }
    );


  baseLight.addTo(map);


  const boundaryLayer =
    L.geoJSON(
      STATE.data.boundary,
      {
        style: {
          color: "#09263f",
          weight: 3,
          fillColor: "#0b5c9e",
          fillOpacity: 0.025
        },

        onEachFeature: (
          feature,
          layer
        ) => {

          layer.bindPopup(
            layerPopup(
              "Sagbama LGA",
              [
                [
                  "Area",
                  `${numberFormat(
                    feature.properties.area_km2,
                    2
                  )} km²`
                ],
                [
                  "Source",
                  feature.properties.source_class
                ]
              ]
            )
          );
        }
      }
    );


  boundaryLayer.addTo(map);


  map.fitBounds(
    boundaryLayer.getBounds(),
    {
      padding: [20, 20]
    }
  );


  STATE.layers.boundary =
    boundaryLayer;


  STATE.layers.communities =
    L.geoJSON(
      STATE.data.communities,
      {

        pointToLayer: (
          feature,
          latlng
        ) => L.circleMarker(
          latlng,
          {
            radius: 5,
            weight: 1.2,
            color: "#0b5c9e",
            fillColor: "#ffffff",
            fillOpacity: 1
          }
        ),

        onEachFeature: (
          feature,
          layer
        ) => {

          const p =
            feature.properties;

          layer.bindPopup(
            layerPopup(
              p.name,
              [
                [
                  "Population within 1 km",
                  numberFormat(
                    p.population_1km
                  )
                ],
                [
                  "Buildings within 1 km",
                  numberFormat(
                    p.buildings_1km
                  )
                ],
                [
                  "Distance to mapped road",
                  distanceFormat(
                    p.distance_any_road_m
                  )
                ],
                [
                  "Distance to waterway",
                  distanceFormat(
                    p.distance_waterway_m
                  )
                ]
              ]
            )
          );


          layer.on(
            "click",
            () => showCommunityInspector(
              p
            )
          );
        }
      }
    );


  STATE.layers.clusters =
    L.geoJSON(
      STATE.data.clusters,
      {
        style: feature => {

          const pop =
            Number(
              feature.properties.population_2025
            );

          let opacity = 0.15;

          if (pop > 5000) {
            opacity = 0.48;
          } else if (pop > 2000) {
            opacity = 0.35;
          } else if (pop > 500) {
            opacity = 0.25;
          }

          return {
            color: "#087ac1",
            weight: 1,
            fillColor: "#087ac1",
            fillOpacity: opacity
          };
        },

        onEachFeature: (
          feature,
          layer
        ) => {

          const p =
            feature.properties;

          layer.bindPopup(
            layerPopup(
              `Building Cluster ${p.cluster_id}`,
              [
                [
                  "Population",
                  numberFormat(
                    p.population_2025
                  )
                ],
                [
                  "Buildings",
                  numberFormat(
                    p.building_count
                  )
                ],
                [
                  "Building density",
                  `${numberFormat(
                    p.building_density_km2,
                    1
                  )} / km²`
                ],
                [
                  "Nearest mapped road",
                  distanceFormat(
                    p.distance_any_road_m
                  )
                ],
                [
                  "Nearest waterway",
                  distanceFormat(
                    p.distance_waterway_m
                  )
                ]
              ]
            )
          );


          layer.on(
            "click",
            () => setInspector(
              `Building Cluster ${p.cluster_id}`,
              [
                [
                  "Population context",
                  numberFormat(
                    p.population_2025
                  )
                ],
                [
                  "Buildings",
                  numberFormat(
                    p.building_count
                  )
                ],
                [
                  "Population density",
                  `${numberFormat(
                    p.population_density_km2,
                    1
                  )} / km²`
                ],
                [
                  "Road distance",
                  distanceFormat(
                    p.distance_any_road_m
                  )
                ],
                [
                  "Waterway distance",
                  distanceFormat(
                    p.distance_waterway_m
                  )
                ]
              ],
              p.interpretation_note
            )
          );
        }
      }
    );


  STATE.layers.roads =
    L.geoJSON(
      STATE.data.roads,
      {
        style: feature => {

          const group =
            feature.properties.road_group;

          if (group === "major") {
            return {
              color: "#cc5c2d",
              weight: 3
            };
          }

          if (group === "track_path") {
            return {
              color: "#987a58",
              weight: 1.2,
              dashArray: "4 4"
            };
          }

          return {
            color: "#5c6872",
            weight: 1.5
          };
        },

        onEachFeature: (
          feature,
          layer
        ) => {

          const p =
            feature.properties;

          layer.bindPopup(
            layerPopup(
              p.name || "Mapped road / track",
              [
                [
                  "Group",
                  p.road_group
                ],
                [
                  "Highway",
                  p.highway
                ],
                [
                  "Length",
                  `${numberFormat(
                    p.length_km,
                    2
                  )} km`
                ]
              ]
            )
          );
        }
      }
    );


  STATE.layers.waterways =
    L.geoJSON(
      STATE.data.waterways,
      {
        style: {
          color: "#2d91c9",
          weight: 2
        },

        onEachFeature: (
          feature,
          layer
        ) => {

          const p =
            feature.properties;

          layer.bindPopup(
            layerPopup(
              p.name || "Mapped waterway",
              [
                [
                  "Type",
                  p.waterway_type
                ],
                [
                  "Length",
                  `${numberFormat(
                    p.length_km,
                    2
                  )} km`
                ],
                [
                  "Source",
                  p.source_class
                ]
              ]
            )
          );
        }
      }
    );


  STATE.layers.waterTransport =
    pointLayer(
      STATE.data.waterTransport,
      "#25a8c8",
      "Water transport"
    );


  STATE.layers.health =
    pointLayer(
      STATE.data.health,
      "#b73c3c",
      "Health facility",
      feature => feature.properties.name
    );


  STATE.layers.schools =
    pointLayer(
      STATE.data.schools,
      "#8258b5",
      "School",
      feature => feature.properties.name
    );


  STATE.layers.police =
    pointLayer(
      STATE.data.police,
      "#212a33",
      "Police context",
      feature => feature.properties.name,
      7
    );


  STATE.layers.communities.addTo(
    map
  );

  STATE.layers.roads.addTo(
    map
  );

  STATE.layers.waterways.addTo(
    map
  );


  renderReportsLayer();


  L.control.layers(
    {},
    {
      "Communities":
        STATE.layers.communities,

      "Building clusters":
        STATE.layers.clusters,

      "Roads & tracks":
        STATE.layers.roads,

      "Waterways":
        STATE.layers.waterways,

      "Water transport":
        STATE.layers.waterTransport,

      "Health facilities":
        STATE.layers.health,

      "Schools":
        STATE.layers.schools,

      "Police context":
        STATE.layers.police,

      "Reports":
        STATE.reportsLayer
    },
    {
      collapsed: false
    }
  ).addTo(
    map
  );


  document
    .getElementById(
      "resetMapButton"
    )
    .addEventListener(
      "click",
      () => {

        map.fitBounds(
          boundaryLayer.getBounds(),
          {
            padding: [20, 20]
          }
        );
      }
    );
}


function pointLayer(
  geojson,
  color,
  label,
  titleFn = null,
  radius = 5
) {

  return L.geoJSON(
    geojson,
    {

      pointToLayer: (
        feature,
        latlng
      ) => L.circleMarker(
        latlng,
        {
          radius,
          weight: 1.2,
          color,
          fillColor: color,
          fillOpacity: 0.82
        }
      ),

      onEachFeature: (
        feature,
        layer
      ) => {

        const p =
          feature.properties;

        const title =
          titleFn
            ? titleFn(feature)
            : label;


        layer.bindPopup(
          layerPopup(
            title || label,
            [
              [
                "Layer",
                label
              ],
              [
                "Source",
                p.source_class
              ],
              [
                "Status",
                p.authority_status
              ]
            ]
          )
        );


        layer.on(
          "click",
          () => setInspector(
            title || label,
            [
              [
                "Feature type",
                label
              ],
              [
                "Source",
                p.source_class
              ],
              [
                "Authority status",
                p.authority_status
              ]
            ],
            p.interpretation_note || ""
          )
        );
      }
    }
  );
}


function reportColor(status) {

  const lookup = {

    "Submitted":
      "#c99a19",

    "Under Review":
      "#d4791f",

    "Verified":
      "#087ac1",

    "Assigned":
      "#7255a8",

    "Resolved":
      "#177a57",

    "Closed":
      "#0d5a42"

  };


  return lookup[status] || "#6d7881";
}


function filteredReports() {

  const reports =
    allReportFeatures();


  const status =
    document.getElementById(
      "mapStatusFilter"
    )?.value || "ALL";


  const category =
    document.getElementById(
      "mapCategoryFilter"
    )?.value || "ALL";


  return reports.filter(
    feature => {

      const p =
        feature.properties;

      return (
        (
          status === "ALL" ||
          p.status === status
        )
        &&
        (
          category === "ALL" ||
          p.report_category === category
        )
      );
    }
  );
}


function renderReportsLayer() {

  const features =
    filteredReports();


  const collection = {

    type:
      "FeatureCollection",

    features:
      features

  };


  const layerOptions = {

    pointToLayer: (
      feature,
      latlng
    ) => L.circleMarker(
      latlng,
      {
        radius:
          feature.properties.is_live_backend
            ? 9
            : 8,

        weight:
          feature.properties.is_live_backend
            ? 3
            : 2,

        color:
          feature.properties.is_live_backend
            ? "#0b5c9e"
            : "#ffffff",

        fillColor:
          reportColor(
            feature.properties.status
          ),

        fillOpacity:
          0.95
      }
    ),


    onEachFeature: (
      feature,
      layer
    ) => {

      const p =
        feature.properties;


      layer.bindPopup(
        layerPopup(
          p.report_id,
          [
            [
              "Category",
              p.report_category
            ],
            [
              "Community",
              p.community_name
            ],
            [
              "Status",
              p.status
            ],
            [
              "Verification",
              p.verification_status
            ],
            [
              "Submitted",
              p.submitted_at
            ],
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


      layer.on(
        "click",
        () => showReportInspector(
          p
        )
      );
    }
  };


  /*
    Initial construction.
  */

  if (
    !STATE.reportsLayer
  ) {

    STATE.reportsLayer =
      L.geoJSON(
        collection,
        layerOptions
      );


    STATE.reportsLayer.addTo(
      STATE.map
    );


    return;
  }


  /*
    Refresh existing layer without replacing the Leaflet layer object.
  */

  STATE.reportsLayer.clearLayers();


  STATE.reportsLayer.addData(
    collection
  );


  if (
    !STATE.map.hasLayer(
      STATE.reportsLayer
    )
  ) {

    STATE.reportsLayer.addTo(
      STATE.map
    );
  }
}

async function ensureContextGrid() {

  if (
    STATE.contextGridLoaded
  ) {

    return;
  }


  const checkbox =
    document.getElementById(
      "contextGridToggle"
    );


  checkbox.disabled = true;


  try {

    const data =
      await getJSON(
        PATHS.contextGrid
      );


    STATE.data.contextGrid =
      data;


    STATE.contextGridLayer =
      L.geoJSON(
        data,
        {

          style: feature => {

            const p =
              feature.properties;

            const concentration =
              p.building_concentration;

            const opacityLookup = {

              "Very high": 0.48,
              "High": 0.37,
              "Moderate": 0.26,
              "Low": 0.16,
              "Very low": 0.10,
              "No detected buildings": 0.035

            };


            return {

              color: "#3f6b8c",
              weight: 0.35,

              fillColor:
                "#0b73b9",

              fillOpacity:
                opacityLookup[
                  concentration
                ] ?? 0.08
            };
          },

          onEachFeature: (
            feature,
            layer
          ) => {

            const p =
              feature.properties;

            layer.bindPopup(
              layerPopup(
                p.grid_id,
                [
                  [
                    "Population",
                    numberFormat(
                      p.population_2025
                    )
                  ],
                  [
                    "Buildings",
                    numberFormat(
                      p.building_count
                    )
                  ],
                  [
                    "Building concentration",
                    p.building_concentration
                  ],
                  [
                    "Tree cover",
                    `${numberFormat(
                      p.tree_cover_pct,
                      1
                    )}%`
                  ],
                  [
                    "Water cover",
                    `${numberFormat(
                      p.permanent_water_pct,
                      1
                    )}%`
                  ],
                  [
                    "Wetland",
                    `${numberFormat(
                      p.herbaceous_wetland_pct,
                      1
                    )}%`
                  ],
                  [
                    "Mean DSM",
                    `${numberFormat(
                      p.dsm_mean_m_egm2008,
                      1
                    )} m`
                  ]
                ]
              )
            );


            layer.on(
              "click",
              () => setInspector(
                `Operational Grid ${p.grid_id}`,
                [
                  [
                    "Population",
                    numberFormat(
                      p.population_2025
                    )
                  ],
                  [
                    "Population density",
                    `${numberFormat(
                      p.population_density_km2,
                      1
                    )} / km²`
                  ],
                  [
                    "Buildings",
                    numberFormat(
                      p.building_count
                    )
                  ],
                  [
                    "Tree cover",
                    `${numberFormat(
                      p.tree_cover_pct,
                      1
                    )}%`
                  ],
                  [
                    "Permanent water",
                    `${numberFormat(
                      p.permanent_water_pct,
                      1
                    )}%`
                  ],
                  [
                    "Wetland",
                    `${numberFormat(
                      p.herbaceous_wetland_pct,
                      1
                    )}%`
                  ],
                  [
                    "Historical water occurrence",
                    `${numberFormat(
                      p.historical_water_occurrence_pct,
                      1
                    )}%`
                  ],
                  [
                    "DSM",
                    `${numberFormat(
                      p.dsm_mean_m_egm2008,
                      1
                    )} m`
                  ]
                ],
                p.interpretation_note
              )
            );
          }
        }
      );


    STATE.contextGridLoaded =
      true;


    if (checkbox.checked) {

      STATE.contextGridLayer.addTo(
        STATE.map
      );
    }


    updateEnvironmentalAnalytics();


  } catch (error) {

    checkbox.checked = false;

    alert(
      "Could not load operational context grid.\n" +
      error.message
    );

  } finally {

    checkbox.disabled = false;
  }
}


/* ==================================================================
   INSPECTORS
================================================================== */


function showCommunityInspector(p) {

  setInspector(
    p.name,
    [
      [
        "Population within 500 m",
        numberFormat(
          p.population_500m
        )
      ],
      [
        "Population within 1 km",
        numberFormat(
          p.population_1km
        )
      ],
      [
        "Buildings within 500 m",
        numberFormat(
          p.buildings_500m
        )
      ],
      [
        "Buildings within 1 km",
        numberFormat(
          p.buildings_1km
        )
      ],
      [
        "Nearest mapped road",
        distanceFormat(
          p.distance_any_road_m
        )
      ],
      [
        "Road group",
        p.nearest_road_group
      ],
      [
        "Nearest waterway",
        distanceFormat(
          p.distance_waterway_m
        )
      ],
      [
        "Waterway type",
        p.nearest_waterway_type
      ],
      [
        "Waterway name",
        p.nearest_waterway_name
      ],
      [
        "Water transport",
        distanceFormat(
          p.distance_water_transport_m
        )
      ]
    ],
    p.interpretation_note
  );
}


function showReportInspector(p) {

  setInspector(
    p.report_id,
    [
      [
        "Category",
        p.report_category
      ],
      [
        "Community",
        p.community_name
      ],
      [
        "Status",
        p.status
      ],
      [
        "Verification",
        p.verification_status
      ],
      [
        "Submitted",
        p.submitted_at
      ],
      [
        "Population context 1 km",
        numberFormat(
          p.population_context_1km
        )
      ],
      [
        "Buildings context 1 km",
        numberFormat(
          p.buildings_context_1km
        )
      ],
      [
        "Mapped road distance",
        distanceFormat(
          p.distance_any_road_m
        )
      ],
      [
        "Mapped waterway distance",
        distanceFormat(
          p.distance_waterway_m
        )
      ]
    ],
    p.public_disclaimer ||
    "Demonstration record"
  );
}


/* ==================================================================
   COMMUNITY INTELLIGENCE
================================================================== */


function initializeCommunities() {

  const communities =
    [...STATE.data.communities.features]
      .sort(
        (a, b) =>
          String(
            a.properties.name
          ).localeCompare(
            String(
              b.properties.name
            )
          )
      );


  const select =
    document.getElementById(
      "communitySelect"
    );


  const formSelect =
    document.getElementById(
      "formCommunity"
    );


  for (const feature of communities) {

    const p =
      feature.properties;


    for (const target of [
      select,
      formSelect
    ]) {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        p.community_id;

      option.textContent =
        p.name;

      target.appendChild(
        option
      );
    }
  }


  select.addEventListener(
    "change",
    () => {

      const id =
        select.value;


      const feature =
        communities.find(
          x =>
            x.properties.community_id ===
            id
        );


      if (!feature) {

        document.getElementById(
          "communityProfile"
        ).innerHTML =
          "Select a community to inspect its spatial context.";

        return;
      }


      renderCommunityProfile(
        feature
      );


      const [lng, lat] =
        feature.geometry.coordinates;


      STATE.map.setView(
        [lat, lng],
        14
      );
    }
  );
}


function renderCommunityProfile(feature) {

  const p =
    feature.properties;


  const panel =
    document.getElementById(
      "communityProfile"
    );


  panel.classList.remove(
    "empty-state"
  );


  panel.innerHTML = `

    <div class="eyebrow">
      Community operational context
    </div>

    <h3>
      ${escapeHtml(p.name)}
    </h3>

    <div class="profile-grid">

      ${profileStat(
        "Population · 500 m",
        numberFormat(
          p.population_500m
        )
      )}

      ${profileStat(
        "Population · 1 km",
        numberFormat(
          p.population_1km
        )
      )}

      ${profileStat(
        "Buildings · 500 m",
        numberFormat(
          p.buildings_500m
        )
      )}

      ${profileStat(
        "Buildings · 1 km",
        numberFormat(
          p.buildings_1km
        )
      )}

      ${profileStat(
        "Mapped road distance",
        distanceFormat(
          p.distance_any_road_m
        )
      )}

      ${profileStat(
        "Road group",
        p.nearest_road_group
      )}

      ${profileStat(
        "Waterway distance",
        distanceFormat(
          p.distance_waterway_m
        )
      )}

      ${profileStat(
        "Water transport distance",
        distanceFormat(
          p.distance_water_transport_m
        )
      )}

    </div>

    <div class="context-warning">
      ${escapeHtml(
        p.interpretation_note
      )}
    </div>
  `;
}


function profileStat(
  label,
  value
) {

  return `
    <div class="profile-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}


/* ==================================================================
   REPORT FILTERS / TABLE
================================================================== */


function initializeReportFilters() {

  const statuses =
    STATE.workflowStatuses;


  const categories =
    uniqueSorted(
      allReportFeatures().map(
        f =>
          f.properties.report_category
      )
    );


  populateSelect(
    document.getElementById(
      "mapStatusFilter"
    ),
    statuses,
    "All statuses"
  );


  populateSelect(
    document.getElementById(
      "reportStatusFilter"
    ),
    statuses,
    "All statuses"
  );


  populateSelect(
    document.getElementById(
      "mapCategoryFilter"
    ),
    categories,
    "All categories"
  );


  populateSelect(
    document.getElementById(
      "reportCategoryFilter"
    ),
    categories,
    "All categories"
  );


  document.getElementById(
    "mapStatusFilter"
  ).addEventListener(
    "change",
    renderReportsLayer
  );


  document.getElementById(
    "mapCategoryFilter"
  ).addEventListener(
    "change",
    renderReportsLayer
  );


  for (const id of [
    "reportStatusFilter",
    "reportCategoryFilter",
    "reportSearch"
  ]) {

    document.getElementById(
      id
    ).addEventListener(
      "input",
      renderReportsTable
    );

    document.getElementById(
      id
    ).addEventListener(
      "change",
      renderReportsTable
    );
  }
}


function filteredTableReports() {

  const status =
    document.getElementById(
      "reportStatusFilter"
    ).value;


  const category =
    document.getElementById(
      "reportCategoryFilter"
    ).value;


  const search =
    document.getElementById(
      "reportSearch"
    ).value
      .trim()
      .toLowerCase();


  return allReportFeatures()
    .filter(
      feature => {

        const p =
          feature.properties;

        const searchable =
          [
            p.report_id,
            p.community_name,
            p.report_category
          ]
          .join(" ")
          .toLowerCase();


        return (
          (
            status === "ALL" ||
            p.status === status
          )
          &&
          (
            category === "ALL" ||
            p.report_category === category
          )
          &&
          (
            !search ||
            searchable.includes(search)
          )
        );
      }
    )
    .sort(
      (a, b) =>
        String(
          b.properties.submitted_at
        ).localeCompare(
          String(
            a.properties.submitted_at
          )
        )
    );
}


function renderReportsTable() {

  const tbody =
    document.getElementById(
      "reportsTableBody"
    );


  const features =
    filteredTableReports();


  tbody.innerHTML =
    features.map(
      feature => {

        const p =
          feature.properties;


        const currentIndex =
          STATE.workflowStatuses.indexOf(
            p.status
          );


        const canAdvance =
          !p.is_live_backend &&
          currentIndex >= 0 &&
          currentIndex <
          STATE.workflowStatuses.length - 1;


        return `

          <tr>

            <td>
              <strong>
                ${escapeHtml(p.report_id)}
              </strong>

              <br>

              <small>
                ${p.is_live_backend
                  ? '<span class="backend-live-label">CENTRAL LIVE REPORT</span>'
                  : (
                      p.is_demo
                        ? "Synthetic demonstration"
                        : "Demonstration"
                    )
                }
              </small>
            </td>

            <td>
              ${escapeHtml(
                p.report_category
              )}
            </td>

            <td>
              ${escapeHtml(
                p.community_name || "—"
              )}
            </td>

            <td>
              ${makeStatusBadge(
                p.status
              )}
            </td>

            <td>
              ${escapeHtml(
                p.verification_status
              )}
            </td>

            <td>
              ${escapeHtml(
                p.submitted_at
              )}
            </td>

            <td>

              ${canAdvance
                ? `
                  <button
                    class="table-action"
                    onclick="advanceReport(
                      '${escapeHtml(
                        p.report_id
                      )}'
                    )"
                  >
                    Advance status
                  </button>
                `
                : (
                  p.is_live_backend
                    ? `
                        <button
                          class="table-action"
                          onclick="openCommandReport(
                            '${escapeHtml(
                              p.report_id
                            )}'
                          )"
                        >
                          Command Console
                        </button>
                      `
                    : "Complete"
                )
              }

            </td>

          </tr>
        `;
      }
    )
    .join("");
}


/* ==================================================================
   STATUS WORKFLOW
================================================================== */


window.advanceReport =
function advanceReport(reportId) {

  const report =
    allReportFeatures()
      .find(
        f =>
          f.properties.report_id ===
          reportId
      );


  if (!report) {
    return;
  }


  const current =
    report.properties.status;


  const index =
    STATE.workflowStatuses.indexOf(
      current
    );


  if (
    index < 0 ||
    index >=
      STATE.workflowStatuses.length - 1
  ) {

    return;
  }


  const next =
    STATE.workflowStatuses[
      index + 1
    ];


  const overrides =
    getStatusOverrides();


  overrides[reportId] =
    next;


  saveStatusOverrides(
    overrides
  );


  refreshReportComponents();


  alert(
    `${reportId}\n\nStatus advanced:\n${current} → ${next}\n\n` +
    "This Step 9B change is browser-local only."
  );
};


function renderWorkflowCards() {

  const reports =
    allReportFeatures();


  const counts = {};


  for (
    const status of
    STATE.workflowStatuses
  ) {

    counts[status] =
      reports.filter(
        feature =>
          feature.properties.status ===
          status
      ).length;
  }


  const container =
    document.getElementById(
      "workflowCards"
    );


  container.innerHTML =
    STATE.workflowStatuses.map(
      (status, index) => `

        <article class="workflow-card">

          <div class="eyebrow">
            ${String(
              index + 1
            ).padStart(
              2,
              "0"
            )}
          </div>

          <strong>
            ${escapeHtml(status)}
          </strong>

          <span class="workflow-number">
            ${numberFormat(
              counts[status]
            )}
          </span>

        </article>
      `
    )
    .join("");
}


/* ==================================================================
   KPIs
================================================================== */


function updateKpis() {

  const gridPopulation =
    STATE.data.clusters.features
      .reduce(
        (sum, f) =>
          sum +
          Number(
            f.properties.population_2025 || 0
          ),
        0
      );


  const clusterShare =
    STATE.data.clusters.features
      .reduce(
        (sum, f) =>
          sum +
          Number(
            f.properties.population_share_pct || 0
          ),
        0
      );


  const exactPopulation =
    clusterShare > 0
      ? gridPopulation /
        (
          clusterShare /
          100
        )
      : 175075.739;


  const buildings =
    STATE.data.clusters.features
      .reduce(
        (sum, f) =>
          sum +
          Number(
            f.properties.building_count || 0
          ),
        0
      );


  const reports =
    allReportFeatures();


  const unverified =
    reports.filter(
      f =>
        [
          "Submitted",
          "Under Review"
        ].includes(
          f.properties.status
        )
    ).length;


  const resolved =
    reports.filter(
      f =>
        [
          "Resolved",
          "Closed"
        ].includes(
          f.properties.status
        )
    ).length;


  document.getElementById(
    "kpiPopulation"
  ).textContent =
    numberFormat(
      exactPopulation
    );


  document.getElementById(
    "kpiBuildings"
  ).textContent =
    "17,848";


  document.getElementById(
    "kpiCommunities"
  ).textContent =
    numberFormat(
      STATE.data.communities.features.length
    );


  document.getElementById(
    "kpiReports"
  ).textContent =
    numberFormat(
      reports.length
    );


  document.getElementById(
    "kpiUnverified"
  ).textContent =
    numberFormat(
      unverified
    );


  document.getElementById(
    "kpiResolved"
  ).textContent =
    numberFormat(
      resolved
    );
}


/* ==================================================================
   CHARTS
================================================================== */


function destroyChart(name) {

  if (
    STATE.charts[name]
  ) {

    STATE.charts[name].destroy();

    STATE.charts[name] = null;
  }
}


function renderReportCharts() {

  const reports =
    allReportFeatures();


  const statusCounts =
    STATE.workflowStatuses.map(
      status =>
        reports.filter(
          f =>
            f.properties.status ===
            status
        ).length
    );


  destroyChart(
    "status"
  );


  STATE.charts.status =
    new Chart(
      document.getElementById(
        "statusChart"
      ),
      {

        type: "bar",

        data: {

          labels:
            STATE.workflowStatuses,

          datasets: [
            {
              label:
                "Reports",

              data:
                statusCounts
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: false
            }
          },

          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0
              }
            }
          }
        }
      }
    );


  const categories =
    uniqueSorted(
      reports.map(
        f =>
          f.properties.report_category
      )
    );


  const categoryCounts =
    categories.map(
      category =>
        reports.filter(
          f =>
            f.properties.report_category ===
            category
        ).length
    );


  destroyChart(
    "category"
  );


  STATE.charts.category =
    new Chart(
      document.getElementById(
        "categoryChart"
      ),
      {

        type: "bar",

        data: {

          labels:
            categories,

          datasets: [
            {
              label:
                "Reports",

              data:
                categoryCounts
            }
          ]
        },

        options: {

          indexAxis: "y",

          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: false
            }
          },

          scales: {
            x: {
              beginAtZero: true,
              ticks: {
                precision: 0
              }
            }
          }
        }
      }
    );
}


function renderPopulationChart() {

  const categories = {};

  for (
    const feature of
    STATE.data.clusters.features
  ) {

    const p =
      feature.properties;

    const rank =
      p.cluster_rank;


    /*
      Cluster layer does not carry concentration_class,
      therefore this chart uses ranked cluster population
      groups for the current dashboard if the 500m grid has
      not yet been loaded.
    */

    let label;

    if (rank <= 10) {
      label = "Top 10 clusters";
    } else if (rank <= 25) {
      label = "Ranks 11–25";
    } else {
      label = "Ranks 26–54";
    }


    categories[label] =
      (
        categories[label] || 0
      )
      +
      Number(
        p.population_2025 || 0
      );
  }


  destroyChart(
    "population"
  );


  STATE.charts.population =
    new Chart(
      document.getElementById(
        "populationConcentrationChart"
      ),
      {

        type: "doughnut",

        data: {

          labels:
            Object.keys(
              categories
            ),

          datasets: [
            {
              data:
                Object.values(
                  categories
                )
            }
          ]
        },

        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      }
    );
}


function updateEnvironmentalAnalytics() {

  if (
    !STATE.data.contextGrid
  ) {
    return;
  }


  let weightedTree =
    0;

  let weightedWater =
    0;

  let areaTotal =
    0;


  const concentration = {};


  for (
    const feature of
    STATE.data.contextGrid.features
  ) {

    const p =
      feature.properties;

    const area =
      Number(
        p.area_km2 || 0
      );


    areaTotal +=
      area;


    weightedTree +=
      Number(
        p.tree_cover_pct || 0
      )
      *
      area;


    weightedWater +=
      (
        Number(
          p.permanent_water_pct || 0
        )
        +
        Number(
          p.herbaceous_wetland_pct || 0
        )
      )
      *
      area;


    const label =
      p.building_concentration ||
      "Unknown";


    concentration[label] =
      (
        concentration[label] || 0
      )
      +
      Number(
        p.population_2025 || 0
      );
  }


  const meanTree =
    areaTotal > 0
      ? weightedTree /
        areaTotal
      : 0;


  const meanWater =
    areaTotal > 0
      ? weightedWater /
        areaTotal
      : 0;


  document.getElementById(
    "treeContextValue"
  ).textContent =
    `${numberFormat(
      meanTree,
      1
    )}%`;


  document.getElementById(
    "waterContextValue"
  ).textContent =
    `${numberFormat(
      meanWater,
      1
    )}%`;


  destroyChart(
    "population"
  );


  STATE.charts.population =
    new Chart(
      document.getElementById(
        "populationConcentrationChart"
      ),
      {

        type: "bar",

        data: {

          labels:
            Object.keys(
              concentration
            ),

          datasets: [
            {
              label:
                "Population",

              data:
                Object.values(
                  concentration
                )
            }
          ]
        },

        options: {

          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: false
            }
          },

          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      }
    );


  destroyChart(
    "environment"
  );


  STATE.charts.environment =
    new Chart(
      document.getElementById(
        "environmentChart"
      ),
      {

        type: "bar",

        data: {

          labels: [
            "Tree cover",
            "Water + wetland"
          ],

          datasets: [
            {
              label:
                "Area-weighted contextual %",
              data: [
                meanTree,
                meanWater
              ]
            }
          ]
        },

        options: {

          responsive: true,
          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: false
            }
          },

          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      }
    );
}


/* ==================================================================
   PROVENANCE
================================================================== */


function renderProvenance() {

  const p =
    STATE.data.provenance;


  const panel =
    document.getElementById(
      "provenancePanel"
    );


  panel.innerHTML = `

    <div class="eyebrow">
      Data provenance
    </div>

    <div class="provenance-grid">

      <article>

        <strong>
          Authoritative project sources
        </strong>

        <p>
          Boundary, health facilities and schools.
        </p>

      </article>


      <article>

        <strong>
          Open contextual sources
        </strong>

        <p>
          Roads, waterways, mapped settlements,
          water transport and OSM police context.
        </p>

      </article>


      <article>

        <strong>
          Derived / modelled context
        </strong>

        <p>
          Google Open Buildings, WorldPop,
          ESA WorldCover, JRC Global Surface Water
          and Copernicus DSM.
        </p>

      </article>

    </div>


    <div class="method-note">

      <strong>Public prototype limitations:</strong>

      ${escapeHtml(
        p.interpretation_limits?.reports ||
        "Demonstration reports are synthetic."
      )}

    </div>
  `;
}


/* ==================================================================
   MOBILE REPORT FORM
================================================================== */


function initializeReportModal() {

  const modal =
    document.getElementById(
      "reportModal"
    );


  const open = () => {

    modal.classList.add(
      "open"
    );

    modal.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.style.overflow =
      "hidden";
  };


  const close = () => {

    modal.classList.remove(
      "open"
    );

    modal.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.style.overflow =
      "";
  };


  for (
    const id of [
      "openReportButton",
      "heroReportButton",
      "reportsAddButton"
    ]
  ) {

    document.getElementById(
      id
    ).addEventListener(
      "click",
      open
    );
  }


  document.getElementById(
    "closeReportModal"
  ).addEventListener(
    "click",
    close
  );


  modal.querySelector(
    ".modal-backdrop"
  ).addEventListener(
    "click",
    close
  );


  const categorySelect =
    document.getElementById(
      "formCategory"
    );


  categorySelect.innerHTML =
    '<option value="">Select category…</option>';


  for (
    const item of
    STATE.data.categories.categories
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      item.label;

    option.textContent =
      item.label;

    categorySelect.appendChild(
      option
    );
  }


  document.getElementById(
    "useLocationButton"
  ).addEventListener(
    "click",
    useCurrentLocation
  );


  document.getElementById(
    "reportForm"
  ).addEventListener(
    "submit",
    submitLiveReport
  );
}


function useCurrentLocation() {

  const message =
    document.getElementById(
      "locationMessage"
    );


  if (
    !navigator.geolocation
  ) {

    message.textContent =
      "Geolocation is not available in this browser.";

    return;
  }


  message.textContent =
    "Obtaining location…";


  navigator.geolocation.getCurrentPosition(

    position => {

      document.getElementById(
        "formLatitude"
      ).value =
        position.coords.latitude.toFixed(
          6
        );


      document.getElementById(
        "formLongitude"
      ).value =
        position.coords.longitude.toFixed(
          6
        );


      message.textContent =
        `Location captured · accuracy approximately ${
          Math.round(
            position.coords.accuracy
          )
        } m`;
    },

    error => {

      message.textContent =
        `Location unavailable: ${
          error.message
        }`;
    },

    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    }
  );
}


function findCommunityById(id) {

  return STATE.data.communities.features
    .find(
      feature =>
        feature.properties.community_id ===
        id
    );
}


async function submitLiveReport(event) {

  event.preventDefault();


  const category =
    document.getElementById(
      "formCategory"
    ).value;


  const communityId =
    document.getElementById(
      "formCommunity"
    ).value;


  const description =
    document.getElementById(
      "formDescription"
    ).value
      .trim();


  const latitude =
    Number(
      document.getElementById(
        "formLatitude"
      ).value
    );


  const longitude =
    Number(
      document.getElementById(
        "formLongitude"
      ).value
    );


  if (
    !category ||
    !description ||
    !Number.isFinite(
      latitude
    ) ||
    !Number.isFinite(
      longitude
    )
  ) {

    alert(
      "Category, description and valid coordinates are required."
    );

    return;
  }


  if (
    !STATE.backend.config?.enabled ||
    !STATE.backend.config?.web_app_url
  ) {

    alert(
      "Central reporting backend is not configured."
    );

    return;
  }


  const community =
    findCommunityById(
      communityId
    );


  const communityProperties =
    community
      ? community.properties
      : {};


  const photoSelected =
    document.getElementById(
      "formPhoto"
    ).files.length > 0;


  const submitButton =
    event.target.querySelector(
      'button[type="submit"]'
    );


  const originalText =
    submitButton.textContent;


  submitButton.disabled =
    true;


  submitButton.textContent =
    "Submitting to central registry…";


  const success =
    document.getElementById(
      "submissionSuccess"
    );


  success.classList.remove(
    "hidden"
  );


  success.innerHTML = `

    <span class="submission-progress">
      Sending observation to the central NFSS GeoSafe registry…
    </span>
  `;


  const params =
    new URLSearchParams();


  params.set(
    "action",
    "submit_report"
  );


  params.set(
    "report_category",
    category
  );


  params.set(
    "description",
    description
  );


  params.set(
    "latitude",
    String(latitude)
  );


  params.set(
    "longitude",
    String(longitude)
  );


  params.set(
    "community_id",
    communityId || ""
  );


  params.set(
    "community_name",
    communityProperties.name || ""
  );


  params.set(
    "evidence_attached",
    photoSelected
      ? "true"
      : "false"
  );


  const submission = {

    category,
    description,
    latitude,
    longitude

  };


  try {

    /*
      Apps Script POST is sent as a simple cross-origin request.

      no-cors is intentional:
      the Apps Script ContentService response itself cannot always
      be read directly by a browser hosted on another origin.

      Confirmation is therefore obtained through the public JSONP
      reports endpoint immediately afterwards.
    */

    await fetch(
      STATE.backend.config
        .web_app_url,
      {

        method:
          "POST",

        mode:
          "no-cors",

        body:
          params

      }
    );


    let confirmed =
      null;


    let centralReports =
      [];


    /*
      Apps Script / Sheets may require a short moment before the newly
      written row appears through the GET endpoint.
    */

    for (
      let attempt = 1;
      attempt <= 8;
      attempt++
    ) {

      await sleepMs(
        attempt === 1
          ? 1300
          : 900
      );


      const response =
        await jsonpRequest(
          STATE.backend.config
            .web_app_url,
          {
            action:
              "reports"
          }
        );


      if (
        response?.success &&
        Array.isArray(
          response.reports
        )
      ) {

        centralReports =
          response.reports;


        confirmed =
          findMatchingSubmittedReport(
            centralReports,
            submission
          );


        if (confirmed) {
          break;
        }
      }
    }


    /*
      Synchronize full central registry after submission.
    */

    if (
      centralReports.length > 0
    ) {

      STATE.liveReportSignature =
        centralReportSignature(
          centralReports
        );


      STATE.liveReports =
        centralReports
          .filter(
            report =>
              Number.isFinite(
                Number(
                  report.latitude
                )
              )
              &&
              Number.isFinite(
                Number(
                  report.longitude
                )
              )
          )
          .map(
            normaliseBackendReport
          );


      STATE.backend.connected =
        true;


      setBackendStatus(
        "connected"
      );


      refreshReportComponents();
    }


    event.target.reset();


    if (confirmed) {

      success.innerHTML = `

        <strong>
          Observation received by central registry
        </strong>

        <br><br>

        Report ID:
        <strong>
          ${escapeHtml(
            confirmed.report_id
          )}
        </strong>

        <br>

        Status:
        <strong>
          SUBMITTED — UNVERIFIED
        </strong>

        <br><br>

        This record is now stored centrally and can appear on
        other NFSS GeoSafe dashboards during the next automatic
        synchronization cycle.
      `;


      const feature =
        STATE.liveReports.find(
          item =>
            item.properties.report_id ===
            confirmed.report_id
        );


      if (feature) {

        const [
          lng,
          lat
        ] =
          feature.geometry.coordinates;


        STATE.map.setView(
          [
            lat,
            lng
          ],
          15
        );
      }


    } else {

      success.innerHTML = `

        <strong>
          Observation sent to central backend
        </strong>

        <br><br>

        Confirmation is still synchronizing.
        The dashboard will automatically check the central registry.

        <br><br>

        Expected initial status:
        <strong>
          SUBMITTED — UNVERIFIED
        </strong>
      `;


      /*
        Trigger another non-blocking synchronization.
      */

      window.setTimeout(
        () =>
          loadCentralReports(
            true
          )
          .catch(
            console.warn
          ),
        3000
      );
    }


  } catch (error) {

    console.error(
      "Live submission error:",
      error
    );


    success.innerHTML = `

      <strong>
        Submission could not be confirmed
      </strong>

      <br><br>

      ${escapeHtml(
        error.message
      )}

      <br><br>

      Please check the central backend connection and try again.
    `;


    setBackendStatus(
      "error"
    );


  } finally {

    submitButton.disabled =
      false;


    submitButton.textContent =
      originalText;
  }
}


/* ==================================================================
   REFRESH
================================================================== */


function refreshReportComponents() {

  renderReportsLayer();

  renderReportsTable();

  renderWorkflowCards();

  updateKpis();

  renderReportCharts();

  initializeReportFilterValues();


  /*
    Step 9D2:
    keep the authorized command console synchronized with central data.
  */

  if (
    document.getElementById(
      "commandReportSelect"
    )
  ) {

    refreshCommandConsoleAfterDataChange();
  }
}


function initializeReportFilterValues() {

  /*
    Preserve current filters while adding categories introduced
    through browser-local demo reports.
  */

  const categories =
    uniqueSorted(
      allReportFeatures().map(
        f =>
          f.properties.report_category
      )
    );


  for (
    const id of [
      "mapCategoryFilter",
      "reportCategoryFilter"
    ]
  ) {

    const select =
      document.getElementById(
        id
      );


    const current =
      select.value;


    populateSelect(
      select,
      categories,
      "All categories"
    );


    if (
      [
        "ALL",
        ...categories
      ].includes(
        current
      )
    ) {

      select.value =
        current;
    }
  }
}


/* ==================================================================
   CONTEXT GRID TOGGLE
================================================================== */


function initializeGridToggle() {

  const toggle =
    document.getElementById(
      "contextGridToggle"
    );


  toggle.addEventListener(
    "change",
    async () => {

      if (
        toggle.checked
      ) {

        await ensureContextGrid();


        if (
          STATE.contextGridLayer &&
          !STATE.map.hasLayer(
            STATE.contextGridLayer
          )
        ) {

          STATE.contextGridLayer.addTo(
            STATE.map
          );
        }

      } else if (
        STATE.contextGridLayer &&
        STATE.map.hasLayer(
          STATE.contextGridLayer
        )
      ) {

        STATE.map.removeLayer(
          STATE.contextGridLayer
        );
      }
    }
  );
}




/* NFSS STEP 9D2 COMMAND CONSOLE FUNCTIONS */


window.openCommandReport =
function openCommandReport(
  reportId
) {

  STATE.commandSelectedReportId =
    reportId;


  const select =
    document.getElementById(
      "commandReportSelect"
    );


  if (select) {

    select.value =
      reportId;
  }


  renderCommandReport();


  refreshCommandHistory();


  document.getElementById(
    "command-console"
  ).scrollIntoView(
    {
      behavior:
        "smooth"
    }
  );
};





/* ==================================================================
   CENTRAL LIVE REPORTS ONLY
================================================================== */


function centralLiveReports() {

  return allReportFeatures()
    .filter(
      feature =>
        feature.properties
          .is_live_backend === true
    )
    .sort(
      (a, b) =>
        String(
          b.properties.submitted_at
        )
        .localeCompare(
          String(
            a.properties.submitted_at
          )
        )
    );
}


/* ==================================================================
   GET SELECTED COMMAND REPORT
================================================================== */


function selectedCommandReport() {

  const id =
    STATE.commandSelectedReportId;


  if (!id) {

    return null;
  }


  return centralLiveReports()
    .find(
      feature =>
        feature.properties.report_id ===
        id
    ) || null;
}


/* ==================================================================
   INITIALIZE COMMAND CONSOLE
================================================================== */


function initializeCommandConsole() {

  const select =
    document.getElementById(
      "commandReportSelect"
    );


  if (!select) {
    return;
  }


  select.addEventListener(
    "change",
    async () => {

      STATE.commandSelectedReportId =
        select.value;


      renderCommandReport();


      await refreshCommandHistory();

    }
  );


  document.getElementById(
    "clearCommandKeyButton"
  ).addEventListener(
    "click",
    () => {

      STATE.commandSessionKey =
        "";


      document.getElementById(
        "commandAdminKey"
      ).value =
        "";


      setCommandResult(
        "success",
        "Command key cleared from this browser session."
      );
    }
  );


  document.getElementById(
    "commandAdminKey"
  ).addEventListener(
    "input",
    event => {

      /*
        Session memory only.
        Never written to localStorage/sessionStorage.
      */

      STATE.commandSessionKey =
        event.target.value;
    }
  );


  document.getElementById(
    "refreshCommandHistoryButton"
  ).addEventListener(
    "click",
    refreshCommandHistory
  );


  refreshCommandReportSelector();
}


/* ==================================================================
   REPORT SELECTOR
================================================================== */


function refreshCommandReportSelector() {

  const select =
    document.getElementById(
      "commandReportSelect"
    );


  if (!select) {
    return;
  }


  const reports =
    centralLiveReports();


  const current =
    STATE.commandSelectedReportId ||
    select.value;


  select.innerHTML =
    '<option value="">Select report…</option>';


  for (
    const feature of
    reports
  ) {

    const p =
      feature.properties;


    const option =
      document.createElement(
        "option"
      );


    option.value =
      p.report_id;


    option.textContent =
      `${p.report_id} · ${p.status} · ${p.community_name || "Unknown community"}`;


    select.appendChild(
      option
    );
  }


  document.getElementById(
    "commandReportCount"
  ).textContent =
    `${reports.length} central live report${
      reports.length === 1
        ? ""
        : "s"
    } available`;


  if (
    current &&
    reports.some(
      item =>
        item.properties.report_id ===
        current
    )
  ) {

    select.value =
      current;


    STATE.commandSelectedReportId =
      current;

  } else {

    STATE.commandSelectedReportId =
      "";

  }


  renderCommandReport();
}


/* ==================================================================
   REPORT PROFILE
================================================================== */


function renderCommandReport() {

  const feature =
    selectedCommandReport();


  const title =
    document.getElementById(
      "commandReportTitle"
    );


  const profile =
    document.getElementById(
      "commandReportProfile"
    );


  const context =
    document.getElementById(
      "commandSpatialContext"
    );


  const statusArea =
    document.getElementById(
      "commandCurrentStatus"
    );


  if (
    !title ||
    !profile ||
    !context ||
    !statusArea
  ) {

    return;
  }


  if (!feature) {

    title.textContent =
      "Select a central live report";


    statusArea.innerHTML =
      "";


    profile.className =
      "command-empty-state";


    profile.innerHTML =
      "Select a centrally submitted report to begin review.";


    context.innerHTML = `

      <div class="command-empty-state">
        No report selected.
      </div>
    `;


    renderCommandActions(
      null
    );


    return;
  }


  const p =
    feature.properties;


  title.textContent =
    p.report_id;


  statusArea.innerHTML = `

    ${makeStatusBadge(
      p.status
    )}

    <div style="
      margin-top:6px;
      font-size:.72rem;
      color:#687581;
    ">
      ${escapeHtml(
        p.verification_status
      )}
    </div>
  `;


  profile.className =
    "";


  profile.innerHTML = `

    <div class="command-report-grid">

      ${commandStat(
        "Category",
        p.report_category
      )}

      ${commandStat(
        "Community",
        p.community_name ||
        "Not specified"
      )}

      ${commandStat(
        "Submitted",
        p.submitted_at
      )}

      ${commandStat(
        "Verification",
        p.verification_status
      )}

      ${commandStat(
        "Decision outcome",
        p.decision_outcome ||
        "Not yet decided"
      )}

      ${commandStat(
        "Assigned unit",
        p.assigned_unit ||
        "Not assigned"
      )}

      ${commandStat(
        "Evidence indicator",
        p.evidence_attached_demo
          ? "Evidence indicated"
          : "No uploaded evidence"
      )}

      ${commandStat(
        "Source",
        "Central live backend"
      )}

    </div>


    <div class="command-description">

      <strong>
        Reporter observation
      </strong>

      <br><br>

      ${escapeHtml(
        p.description ||
        "No description supplied."
      )}

    </div>
  `;


  context.innerHTML = `

    ${commandContextItem(
      "Latitude",
      numberFormat(
        feature.geometry.coordinates[1],
        6
      )
    )}

    ${commandContextItem(
      "Longitude",
      numberFormat(
        feature.geometry.coordinates[0],
        6
      )
    )}

    ${commandContextItem(
      "Population within 1 km",
      numberFormat(
        p.population_context_1km
      )
    )}

    ${commandContextItem(
      "Buildings within 1 km",
      numberFormat(
        p.buildings_context_1km
      )
    )}

    ${commandContextItem(
      "Nearest mapped road",
      distanceFormat(
        p.distance_any_road_m
      )
    )}

    ${commandContextItem(
      "Road group",
      p.nearest_road_group ||
      "—"
    )}

    ${commandContextItem(
      "Nearest mapped waterway",
      distanceFormat(
        p.distance_waterway_m
      )
    )}

    ${commandContextItem(
      "Waterway type",
      p.nearest_waterway_type ||
      "—"
    )}
  `;


  renderCommandActions(
    p
  );
}


/* ==================================================================
   PROFILE HELPERS
================================================================== */


function commandStat(
  label,
  value
) {

  return `

    <div class="command-report-stat">

      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(
          value === undefined ||
          value === null ||
          value === ""
            ? "—"
            : value
        )}
      </strong>

    </div>
  `;
}


function commandContextItem(
  label,
  value
) {

  return `

    <div class="command-context-item">

      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(
          value === undefined ||
          value === null ||
          value === ""
            ? "—"
            : value
        )}
      </strong>

    </div>
  `;
}


/* ==================================================================
   ALLOWED COMMANDS BY STATUS
================================================================== */


function allowedCommandsForStatus(
  status
) {

  const lookup = {

    "Submitted": [

      {
        command:
          "start_review",

        label:
          "Start Review",

        style:
          "primary",

        noteRequired:
          false
      },

      {
        command:
          "duplicate",

        label:
          "Close as Duplicate",

        style:
          "neutral",

        noteRequired:
          true
      }

    ],


    "Under Review": [

      {
        command:
          "verify",

        label:
          "Verify Report",

        style:
          "success",

        noteRequired:
          true
      },

      {
        command:
          "unable_to_verify",

        label:
          "Unable to Verify",

        style:
          "warning",

        noteRequired:
          true
      },

      {
        command:
          "reject",

        label:
          "Reject Report",

        style:
          "danger",

        noteRequired:
          true
      },

      {
        command:
          "duplicate",

        label:
          "Close as Duplicate",

        style:
          "neutral",

        noteRequired:
          true
      }

    ],


    "Verified": [

      {
        command:
          "assign",

        label:
          "Assign for Action",

        style:
          "primary",

        noteRequired:
          false,

        assignmentRequired:
          true
      }

    ],


    "Assigned": [

      {
        command:
          "resolve",

        label:
          "Record Resolution",

        style:
          "success",

        noteRequired:
          true
      }

    ],


    "Resolved": [

      {
        command:
          "close",

        label:
          "Close Report",

        style:
          "success",

        noteRequired:
          true
      }

    ],


    "Closed": []

  };


  return lookup[
    status
  ] || [];
}


/* ==================================================================
   RENDER ACTION BUTTONS
================================================================== */


function renderCommandActions(p) {

  const container =
    document.getElementById(
      "commandActionButtons"
    );


  const explanation =
    document.getElementById(
      "commandActionExplanation"
    );


  const assignment =
    document.getElementById(
      "commandAssignmentFields"
    );


  if (
    !container ||
    !explanation ||
    !assignment
  ) {

    return;
  }


  assignment.classList.add(
    "hidden"
  );


  if (!p) {

    container.innerHTML =
      "";


    explanation.textContent =
      "Select a report to display the actions permitted from its current workflow status.";


    return;
  }


  const actions =
    allowedCommandsForStatus(
      p.status
    );


  if (
    actions.length === 0
  ) {

    container.innerHTML = `

      <div class="command-workflow-terminal">

        No further command action is available.
        This report is closed.

      </div>
    `;


    explanation.textContent =
      "The report has reached a terminal workflow state.";


    return;
  }


  explanation.innerHTML = `

    Current state:

    <strong>
      ${escapeHtml(
        p.status
      )}
    </strong>

    · Only valid transitions from this state are shown below.
  `;


  if (
    actions.some(
      action =>
        action.assignmentRequired
    )
  ) {

    assignment.classList.remove(
      "hidden"
    );
  }


  container.innerHTML =
    actions.map(
      action => `

        <button
          type="button"
          class="
            command-action-button
            command-action-${action.style}
          "
          data-command="${escapeHtml(
            action.command
          )}"
        >
          ${escapeHtml(
            action.label
          )}
        </button>
      `
    )
    .join("");


  container
    .querySelectorAll(
      "[data-command]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            executeCommandAction(
              button.dataset.command
            )
        );
      }
    );
}


/* ==================================================================
   EXPECTED RESULT BY COMMAND
================================================================== */


function expectedCommandResult(
  command
) {

  const lookup = {

    start_review: {

      status:
        "Under Review",

      verification:
        "Pending review"

    },

    verify: {

      status:
        "Verified",

      verification:
        "Verified"

    },

    assign: {

      status:
        "Assigned",

      verification:
        "Verified"

    },

    resolve: {

      status:
        "Resolved",

      verification:
        "Verified"

    },

    close: {

      status:
        "Closed",

      verification:
        "Verified"

    },

    unable_to_verify: {

      status:
        "Closed",

      verification:
        "Unable to Verify"

    },

    reject: {

      status:
        "Closed",

      verification:
        "Not Verified"

    },

    duplicate: {

      status:
        "Closed",

      verification:
        "Not Verified"

    }

  };


  return lookup[
    command
  ] || null;
}


/* ==================================================================
   EXECUTE COMMAND
================================================================== */


async function executeCommandAction(
  command
) {

  const feature =
    selectedCommandReport();


  if (!feature) {

    setCommandResult(
      "error",
      "Select a central live report first."
    );

    return;
  }


  const p =
    feature.properties;


  const adminKey =
    String(
      document.getElementById(
        "commandAdminKey"
      ).value ||
      STATE.commandSessionKey ||
      ""
    )
    .trim();


  const actorName =
    document.getElementById(
      "commandActorName"
    ).value
      .trim();


  const actorRole =
    document.getElementById(
      "commandActorRole"
    ).value;


  const note =
    document.getElementById(
      "commandNote"
    ).value
      .trim();


  const assignedUnit =
    document.getElementById(
      "commandAssignedUnit"
    ).value
      .trim();


  const assignedOfficer =
    document.getElementById(
      "commandAssignedOfficer"
    ).value
      .trim();


  if (!adminKey) {

    setCommandResult(
      "error",
      "Enter the private NFSS command key."
    );

    return;
  }


  if (!actorName) {

    setCommandResult(
      "error",
      "Enter the authorized officer name."
    );

    return;
  }


  const allowed =
    allowedCommandsForStatus(
      p.status
    );


  const definition =
    allowed.find(
      item =>
        item.command ===
        command
    );


  if (!definition) {

    setCommandResult(
      "error",
      `Command '${command}' is not permitted from ${p.status}.`
    );

    return;
  }


  if (
    definition.noteRequired &&
    !note
  ) {

    setCommandResult(
      "error",
      "This command requires an operational or review note."
    );

    return;
  }


  if (
    definition.assignmentRequired &&
    !assignedUnit
  ) {

    setCommandResult(
      "error",
      "Enter the NFSS unit receiving this assignment."
    );

    return;
  }


  const confirmationText =
    commandConfirmationText(
      command,
      p.report_id
    );


  if (
    !window.confirm(
      confirmationText
    )
  ) {

    return;
  }


  STATE.commandSessionKey =
    adminKey;


  setCommandResult(
    "progress",
    "Sending authorized command to the central NFSS GeoSafe registry…"
  );


  disableCommandButtons(
    true
  );


  const params =
    new URLSearchParams();


  params.set(
    "action",
    "command_update_report"
  );


  params.set(
    "admin_key",
    adminKey
  );


  params.set(
    "report_id",
    p.report_id
  );


  params.set(
    "command",
    command
  );


  params.set(
    "actor_name",
    actorName
  );


  params.set(
    "actor_role",
    actorRole
  );


  params.set(
    "note",
    note
  );


  params.set(
    "assigned_unit",
    assignedUnit
  );


  params.set(
    "assigned_officer",
    assignedOfficer
  );


  const previousStatus =
    p.status;


  const expected =
    expectedCommandResult(
      command
    );


  try {

    /*
      Same safe cross-origin pattern used by Step 9C:
      POST command, then confirm centrally with JSONP GET.
    */

    await fetch(
      STATE.backend.config
        .web_app_url,
      {

        method:
          "POST",

        mode:
          "no-cors",

        body:
          params

      }
    );


    let confirmed =
      null;


    for (
      let attempt = 1;
      attempt <= 10;
      attempt++
    ) {

      await sleepMs(
        attempt === 1
          ? 1200
          : 900
      );


      const response =
        await jsonpRequest(
          STATE.backend.config
            .web_app_url,
          {

            action:
              "report",

            id:
              p.report_id

          }
        );


      if (
        response?.success &&
        response.report
      ) {

        const central =
          response.report;


        if (
          central.status ===
          expected.status
          &&
          central.status !==
          previousStatus
        ) {

          confirmed =
            central;

          break;
        }
      }
    }


    if (!confirmed) {

      throw new Error(
        "The command was not confirmed by the central registry. Check the command key, current report status and required fields."
      );
    }


    /*
      Synchronise all reports.
    */

    await loadCentralReports(
      true
    );


    refreshCommandReportSelector();


    STATE.commandSelectedReportId =
      p.report_id;


    document.getElementById(
      "commandReportSelect"
    ).value =
      p.report_id;


    renderCommandReport();


    await refreshCommandHistory();


    document.getElementById(
      "commandNote"
    ).value =
      "";


    if (
      command ===
      "assign"
    ) {

      document.getElementById(
        "commandAssignedUnit"
      ).value =
        "";


      document.getElementById(
        "commandAssignedOfficer"
      ).value =
        "";
    }


    setCommandResult(
      "success",
      `${p.report_id}: ${previousStatus} → ${confirmed.status}. Central command action confirmed.`
    );


  } catch (error) {

    console.error(
      "NFSS command action failed:",
      error
    );


    setCommandResult(
      "error",
      error.message
    );


  } finally {

    disableCommandButtons(
      false
    );
  }
}


/* ==================================================================
   COMMAND CONFIRMATION TEXT
================================================================== */


function commandConfirmationText(
  command,
  reportId
) {

  const labels = {

    start_review:
      "START REVIEW",

    verify:
      "VERIFY THIS REPORT",

    assign:
      "ASSIGN THIS REPORT",

    resolve:
      "RECORD THIS REPORT AS RESOLVED",

    close:
      "CLOSE THIS REPORT",

    unable_to_verify:
      "CLOSE AS UNABLE TO VERIFY",

    reject:
      "REJECT AND CLOSE THIS REPORT",

    duplicate:
      "CLOSE THIS REPORT AS DUPLICATE"

  };


  return (
    `${labels[command] || command}\n\n` +
    `Report: ${reportId}\n\n` +
    "This action will be written to the central NFSS GeoSafe audit history."
  );
}


/* ==================================================================
   COMMAND RESULT
================================================================== */


function setCommandResult(
  type,
  message
) {

  const element =
    document.getElementById(
      "commandResult"
    );


  if (!element) {
    return;
  }


  element.classList.remove(
    "hidden",
    "command-result-success",
    "command-result-error",
    "command-result-progress"
  );


  element.classList.add(
    `command-result-${type}`
  );


  element.textContent =
    message;
}


/* ==================================================================
   DISABLE COMMAND BUTTONS
================================================================== */


function disableCommandButtons(
  disabled
) {

  document
    .querySelectorAll(
      "#commandActionButtons button"
    )
    .forEach(
      button => {

        button.disabled =
          disabled;
      }
    );
}


/* ==================================================================
   PUBLIC ACTION HISTORY
================================================================== */


async function refreshCommandHistory() {

  const timeline =
    document.getElementById(
      "commandTimeline"
    );


  if (!timeline) {
    return;
  }


  const reportId =
    STATE.commandSelectedReportId;


  if (!reportId) {

    timeline.innerHTML = `

      <div class="command-empty-state">
        Select a report to view its audit history.
      </div>
    `;

    return;
  }


  timeline.innerHTML = `

    <div class="command-empty-state">
      Loading central action history…
    </div>
  `;


  try {

    const response =
      await jsonpRequest(
        STATE.backend.config
          .web_app_url,
        {

          action:
            "public_actions",

          id:
            reportId

        }
      );


    if (
      !response?.success ||
      !Array.isArray(
        response.actions
      )
    ) {

      throw new Error(
        response?.error ||
        "Could not retrieve action history."
      );
    }


    STATE.commandHistory =
      response.actions;


    renderCommandTimeline(
      response.actions
    );


  } catch (error) {

    timeline.innerHTML = `

      <div class="command-result command-result-error">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;
  }
}


/* ==================================================================
   TIMELINE
================================================================== */


function renderCommandTimeline(
  actions
) {

  const timeline =
    document.getElementById(
      "commandTimeline"
    );


  if (!timeline) {
    return;
  }


  if (
    !actions ||
    actions.length === 0
  ) {

    timeline.innerHTML = `

      <div class="command-empty-state">
        No action history is available.
      </div>
    `;

    return;
  }


  timeline.innerHTML =
    actions.map(
      action => {

        /*
          Step 9C's original Submitted event predates Step 9D
          transition columns, so gracefully infer its first state.
        */

        const toStatus =
          action.to_status ||
          (
            action.action ===
            "Submitted"
              ? "Submitted"
              : ""
          );


        const transition =
          (
            action.from_status ||
            toStatus
          )
          ? `

              <div class="command-timeline-transition">

                ${
                  action.from_status
                    ? `${escapeHtml(action.from_status)} → `
                    : ""
                }

                <strong>
                  ${escapeHtml(
                    toStatus ||
                    action.action
                  )}
                </strong>

              </div>
            `
          : "";


        return `

          <div class="command-timeline-item">

            <div class="command-timeline-action">

              ${escapeHtml(
                action.action
              )}

            </div>


            <div class="command-timeline-meta">

              Sequence
              ${escapeHtml(
                action.action_sequence
              )}

              ·

              ${escapeHtml(
                action.action_at ||
                "Timestamp unavailable"
              )}

              ·

              ${escapeHtml(
                action.actor_role ||
                "System"
              )}

            </div>


            ${transition}


            ${
              action.verification_status
                ? `

                    <div class="command-timeline-meta">

                      Verification:
                      ${escapeHtml(
                        action.verification_status
                      )}

                    </div>
                  `
                : ""
            }


            ${
              action.decision_outcome
                ? `

                    <div class="command-timeline-meta">

                      Outcome:
                      ${escapeHtml(
                        action.decision_outcome
                      )}

                    </div>
                  `
                : ""
            }

          </div>
        `;
      }
    )
    .join("");
}


/* ==================================================================
   SYNCHRONIZE COMMAND UI AFTER CENTRAL POLLING
================================================================== */


function refreshCommandConsoleAfterDataChange() {

  const selected =
    STATE.commandSelectedReportId;


  refreshCommandReportSelector();


  if (selected) {

    STATE.commandSelectedReportId =
      selected;


    const select =
      document.getElementById(
        "commandReportSelect"
      );


    if (
      select &&
      [...select.options].some(
        option =>
          option.value ===
          selected
      )
    ) {

      select.value =
        selected;


      renderCommandReport();

    }
  }
}




/* ==================================================================
   NAVIGATION
================================================================== */


function initializeNavigation() {

  const button =
    document.getElementById(
      "mobileMenuButton"
    );


  const nav =
    document.getElementById(
      "mainNav"
    );


  button.addEventListener(
    "click",
    () => {

      nav.classList.toggle(
        "open"
      );
    }
  );


  nav.querySelectorAll(
    "a"
  ).forEach(
    link => {

      link.addEventListener(
        "click",
        () => {

          nav.classList.remove(
            "open"
          );
        }
      );
    }
  );
}


/* ==================================================================
   STARTUP
================================================================== */


async function main() {

  try {

    await loadCoreData();


    await initializeLiveBackend();


    initializeNavigation();

    initializeMap();

    initializeCommunities();

    initializeReportFilters();

    initializeReportModal();

    initializeGridToggle();

    initializeCommandConsole();


    updateKpis();

    renderReportsTable();

    renderWorkflowCards();

    renderReportCharts();

    renderPopulationChart();

    renderProvenance();


    /*
      Load the grid after the primary dashboard is interactive,
      so the 3.8 MB GeoJSON does not block initial rendering.
    */

    window.setTimeout(
      ensureContextGrid,
      1200
    );


    startBackendPolling();


    console.log(
      "NFSS GeoSafe Step 9C2 live dashboard loaded successfully."
    );

  } catch (error) {

    console.error(
      error
    );


    document.body.innerHTML = `

      <div style="
        max-width: 900px;
        margin: 60px auto;
        padding: 30px;
        font-family: sans-serif;
      ">

        <h1>
          NFSS GeoSafe could not load
        </h1>

        <p>
          ${escapeHtml(
            error.message
          )}
        </p>

        <p>
          Serve the folder through a web server or GitHub Pages.
          Opening index.html directly with file:// may block GeoJSON
          fetch requests.
        </p>

      </div>
    `;
  }
}


document.addEventListener(
  "DOMContentLoaded",
  main
);
