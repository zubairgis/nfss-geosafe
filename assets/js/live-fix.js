"use strict";

/* NFSS GeoSafe live-backend compatibility fix — 2026-08-25 */
window.NFSS_LIVE_FIX_VERSION = "2026-08-25-2";

/*
  Diagnostic result on the deployed GitHub Pages site:
  - Apps Script JSONP <script> execution is blocked in this browser/network path.
  - Direct cross-origin fetch to the same Apps Script endpoint succeeds (HTTP 200).

  Keep the existing application API name jsonpRequest() so no other dashboard
  code has to change, but implement it with ordinary CORS fetch instead.
*/
window.jsonpRequest = async function jsonpRequestViaFetch(
  baseUrl,
  parameters = {},
  timeoutMs = 20000
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }

  /* Never send a JSONP callback when using fetch. */
  query.delete("callback");
  query.set("_ts", String(Date.now()));

  const separator = baseUrl.includes("?") ? "&" : "?";
  const requestUrl = baseUrl + separator + query.toString();

  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `NFSS GeoSafe backend returned HTTP ${response.status}.`
      );
    }

    const data = await response.json();
    return data;

  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("NFSS GeoSafe backend request timed out.");
    }
    throw error;

  } finally {
    window.clearTimeout(timer);
  }
};

window.initializeLiveBackend = async function initializeLiveBackendFixed() {
  try {
    setBackendStatus("connecting");

    const response = await fetch(
      PATHS.backendConfig + "?v=" + Date.now(),
      {
        cache: "no-store",
        credentials: "same-origin"
      }
    );

    if (!response.ok) {
      throw new Error("Could not load central backend configuration.");
    }

    const config = await response.json();
    STATE.backend.config = config;

    if (!config.enabled) {
      STATE.backend.connected = false;
      setBackendStatus("error");
      return;
    }

    /*
      Use the report registry itself as the connection test. The diagnostic page
      proved direct CORS fetch works from this GitHub Pages origin.
    */
    const reports = await loadCentralReports(false);

    STATE.backend.health = {
      success: true,
      backend_version: config.backend_version || "live",
      transport: "cors_fetch",
      message: "Central report registry reachable"
    };

    STATE.backend.connected = true;
    setBackendStatus("connected");

    console.log(
      "NFSS GeoSafe central registry connected via CORS fetch.",
      { reports: Array.isArray(reports) ? reports.length : STATE.liveReports.length }
    );

  } catch (error) {
    console.error("NFSS live backend connection error:", error);
    STATE.backend.connected = false;
    setBackendStatus("error");
  }
};
