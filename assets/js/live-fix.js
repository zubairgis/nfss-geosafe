"use strict";

/* NFSS GeoSafe live-backend compatibility fix — 2026-08-25 */
window.NFSS_LIVE_FIX_VERSION = "2026-08-25-1";

window.jsonpRequest = function jsonpRequestFixed(
  baseUrl,
  parameters = {},
  timeoutMs = 20000
) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "nfssGeoSafeCb" +
      Date.now() +
      Math.floor(Math.random() * 1000000000);

    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    }

    query.set("callback", callbackName);
    query.set("_ts", String(Date.now()));

    const script = document.createElement("script");
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      try {
        delete window[callbackName];
      } catch (_) {
        window[callbackName] = undefined;
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    window[callbackName] = data => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach NFSS GeoSafe central backend."));
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("NFSS GeoSafe central backend request timed out."));
    }, timeoutMs);

    const separator = baseUrl.includes("?") ? "&" : "?";
    script.src = baseUrl + separator + query.toString();
    script.async = true;
    document.head.appendChild(script);
  });
};

window.initializeLiveBackend = async function initializeLiveBackendFixed() {
  try {
    setBackendStatus("connecting");

    const response = await fetch(
      PATHS.backendConfig + "?v=" + Date.now(),
      { cache: "no-store" }
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
      Load the actual report registry first. This removes the old health-check
      gate and makes report availability the authoritative connection test.
    */
    await loadCentralReports(false);

    STATE.backend.health = {
      success: true,
      backend_version: config.backend_version || "live",
      message: "Central report registry reachable"
    };

    STATE.backend.connected = true;
    setBackendStatus("connected");

    console.log(
      "NFSS GeoSafe central registry connected via live compatibility fix.",
      { reports: STATE.liveReports.length }
    );
  } catch (error) {
    console.error("NFSS live backend connection error:", error);
    STATE.backend.connected = false;
    setBackendStatus("error");
  }
};
