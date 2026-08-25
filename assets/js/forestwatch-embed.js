"use strict";

/* ==================================================================
   NFSS GEOSAFE — EMBEDDED NFSS FORESTWATCH
   Embeds the public Google Earth Engine ForestWatch App inside the
   Operational Map section without modifying the validated core app.
================================================================== */

window.NFSS_FORESTWATCH_URL =
  "https://zubair-1300.projects.earthengine.app/view/nfl";

(function installForestWatchEmbed() {

  function addStyles() {
    if (document.getElementById("nfssForestWatchEmbedStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "nfssForestWatchEmbedStyles";
    style.textContent = `
      .nfss-forestwatch-block {
        margin-top: 42px;
        border: 1px solid var(--line, #dce4ea);
        border-radius: 16px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 12px 34px rgba(9, 38, 63, 0.10);
      }

      .nfss-forestwatch-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        padding: 20px 22px;
        background: linear-gradient(135deg, #f4fbf7, #eef7fc);
        border-bottom: 1px solid var(--line, #dce4ea);
      }

      .nfss-forestwatch-title-wrap {
        min-width: 0;
      }

      .nfss-forestwatch-eyebrow {
        color: #177a57;
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }

      .nfss-forestwatch-header h3 {
        margin: 0 0 6px 0;
        color: #09263f;
        font-size: 1.25rem;
      }

      .nfss-forestwatch-header p {
        margin: 0;
        max-width: 850px;
        color: #5d6b76;
        font-size: 0.9rem;
        line-height: 1.55;
      }

      .nfss-forestwatch-open {
        flex-shrink: 0;
        white-space: nowrap;
      }

      .nfss-forestwatch-frame-wrap {
        position: relative;
        width: 100%;
        background: #eef2f4;
      }

      .nfss-forestwatch-frame {
        display: block;
        width: 100%;
        height: 760px;
        border: 0;
        background: #ffffff;
      }

      .nfss-forestwatch-note {
        padding: 10px 18px 13px;
        border-top: 1px solid var(--line, #dce4ea);
        color: #687581;
        font-size: 0.78rem;
        line-height: 1.45;
        background: #ffffff;
      }

      .nfss-forestwatch-note strong {
        color: #8b0000;
      }

      @media (max-width: 900px) {
        .nfss-forestwatch-header {
          flex-direction: column;
          align-items: stretch;
        }

        .nfss-forestwatch-open {
          width: 100%;
        }

        .nfss-forestwatch-frame {
          height: 680px;
        }
      }

      @media (max-width: 600px) {
        .nfss-forestwatch-block {
          margin-top: 28px;
          border-radius: 12px;
        }

        .nfss-forestwatch-header {
          padding: 16px;
        }

        .nfss-forestwatch-frame {
          height: 620px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function addNavLink() {
    const nav = document.getElementById("mainNav");

    if (!nav || document.getElementById("forestWatchNavLink")) {
      return;
    }

    const operationalLink = Array.from(nav.querySelectorAll("a"))
      .find(link => link.getAttribute("href") === "#operational-map");

    const link = document.createElement("a");
    link.id = "forestWatchNavLink";
    link.href = "#forestwatch";
    link.textContent = "ForestWatch";

    if (operationalLink) {
      operationalLink.insertAdjacentElement("afterend", link);
    } else {
      nav.appendChild(link);
    }
  }

  function install() {
    addStyles();
    addNavLink();

    const operationalSection = document.getElementById("operational-map");

    if (!operationalSection || document.getElementById("forestwatch")) {
      return;
    }

    const block = document.createElement("div");
    block.id = "forestwatch";
    block.className = "nfss-forestwatch-block";

    block.innerHTML = `
      <div class="nfss-forestwatch-header">
        <div class="nfss-forestwatch-title-wrap">
          <div class="nfss-forestwatch-eyebrow">
            Satellite forest surveillance
          </div>
          <h3>NFSS ForestWatch — Sentinel-1 Forest Change Detection</h3>
          <p>
            Compare two dates to identify candidate forest disturbance within
            mapped forest using Sentinel-1 radar evidence. Detected changes are
            surveillance alerts and require human or field verification.
          </p>
        </div>

        <a
          class="secondary-button nfss-forestwatch-open"
          href="${window.NFSS_FORESTWATCH_URL}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Full ForestWatch ↗
        </a>
      </div>

      <div class="nfss-forestwatch-frame-wrap">
        <iframe
          class="nfss-forestwatch-frame"
          src="${window.NFSS_FORESTWATCH_URL}"
          title="NFSS ForestWatch Sentinel-1 Forest Change Detection App"
          loading="lazy"
          allow="geolocation; fullscreen"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      </div>

      <div class="nfss-forestwatch-note">
        <strong>Operational interpretation:</strong>
        satellite change alerts are signals for investigation and should not be
        treated as confirmed illegal logging, deforestation or another forest
        offence until verified.
      </div>
    `;

    operationalSection.appendChild(block);

    console.log("NFSS GeoSafe ForestWatch embed enabled.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }

})();
