# NFSS GeoSafe — Sagbama Demonstration Dataset

This directory contains sanitized web-ready data for the NFSS GeoSafe proof-of-concept dashboard.

## Purpose

Demonstrate how community observations can be transformed into traceable, spatially contextualized and verifiable operational information for forest and rural security planning.

## Main layers

- `boundary.geojson` — Sagbama demonstration boundary
- `communities.geojson` — 40 mapped community locations
- `building_clusters.geojson` — 54 derived building clusters
- `operational_context_grid_500m.geojson` — population, buildings, tree/water/wetland, historical surface-water and DSM context
- `roads.geojson` — mapped roads and tracks
- `waterways.geojson` — mapped waterways
- `water_transport.geojson` — mapped jetty/ferry/pier reference points
- `health_facilities.geojson` — authoritative project facilities
- `schools.geojson` — authoritative project schools
- `police_context.geojson` — OSM contextual police locations
- `demo_reports.geojson` — SYNTHETIC demonstration reports only
- `demo_report_actions.json` — synthetic evidence/status history

## Evidence workflow

`Submitted -> Under Review -> Verified -> Assigned -> Resolved -> Closed`

A submitted community report must never be interpreted as a verified crime before institutional review.

## Important limitations

- Demo incident records are synthetic.
- OSM police/security data are contextual and incomplete.
- WorldCover tree cover is not a legal forest-estate boundary.
- JRC metrics represent historical surface-water behaviour, not current flood status.
- WorldPop is modelled population rather than household census enumeration.
- Building clusters are analytical concentration areas, not official settlements.
- No reporter personal information is included in the public demo package.

## Publication

This Step 9A package is preparation only. Nothing is automatically uploaded or published to GitHub by the processing script.

