"use strict";

/* ==================================================================
   NFSS GEOSAFE — REGISTERED VOLUNTEER REPORT LINK
   Public form link only. No volunteer identity or mobile number is
   stored in GitHub or exposed by this script.
================================================================== */

window.NFSS_VOLUNTEER_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeaqhcWUT95txqXpNxAHtrVM8DahSl34HRGLtJnpZXIMiQdMg/viewform";

(function installVolunteerReportLinks() {

  function makeVolunteerLink(label, className) {
    const link = document.createElement("a");
    link.href = window.NFSS_VOLUNTEER_FORM_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = className;
    link.textContent = label;
    link.setAttribute(
      "aria-label",
      "Open registered volunteer field observation form"
    );
    link.title =
      "Registered volunteer reporting form — contact details remain private";
    return link;
  }

  function install() {

    /* --------------------------------------------------------------
       HEADER
    -------------------------------------------------------------- */

    const headerReportButton =
      document.getElementById("openReportButton");

    if (
      headerReportButton &&
      !document.getElementById("volunteerHeaderButton")
    ) {
      const link = makeVolunteerLink(
        "Volunteer Report",
        "secondary-button report-button"
      );
      link.id = "volunteerHeaderButton";
      headerReportButton.insertAdjacentElement("afterend", link);
    }


    /* --------------------------------------------------------------
       HERO
    -------------------------------------------------------------- */

    const heroReportButton =
      document.getElementById("heroReportButton");

    if (
      heroReportButton &&
      !document.getElementById("volunteerHeroButton")
    ) {
      const link = makeVolunteerLink(
        "Registered Volunteer Report",
        "secondary-button"
      );
      link.id = "volunteerHeroButton";
      heroReportButton.insertAdjacentElement("afterend", link);
    }


    /* --------------------------------------------------------------
       REPORTS SECTION
    -------------------------------------------------------------- */

    const reportsAddButton =
      document.getElementById("reportsAddButton");

    if (
      reportsAddButton &&
      !document.getElementById("volunteerReportsButton")
    ) {
      const link = makeVolunteerLink(
        "+ Volunteer Observation",
        "secondary-button"
      );
      link.id = "volunteerReportsButton";
      link.style.marginLeft = "8px";
      reportsAddButton.insertAdjacentElement("afterend", link);
    }


    /* --------------------------------------------------------------
       SMALL PRIVACY NOTE BELOW HERO ACTIONS
    -------------------------------------------------------------- */

    const heroActions = document.querySelector(".hero-actions");

    if (
      heroActions &&
      !document.getElementById("volunteerPrivacyNote")
    ) {
      const note = document.createElement("div");
      note.id = "volunteerPrivacyNote";
      note.style.width = "100%";
      note.style.marginTop = "8px";
      note.style.fontSize = "0.82rem";
      note.style.opacity = "0.78";
      note.textContent =
        "Registered volunteer contact details are stored privately and are not displayed on the public dashboard.";
      heroActions.insertAdjacentElement("afterend", note);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }

  console.log("NFSS GeoSafe volunteer reporting link enabled.");

})();
