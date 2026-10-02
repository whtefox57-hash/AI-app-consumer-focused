# Bundled map sources

Country coastlines and modern reference boundaries: Natural Earth, 1:50 million,
public domain. Downloaded 2026-10-02 from the Natural Earth vector repository:
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson
https://www.naturalearthdata.com/about/terms-of-use/

The local file retains country names and geometry with a 0.035° line-simplification tolerance and coordinates rounded to three
decimal places. SHA-256 of the bundled compact file:
cdcc5f483088cc4416048fb405d4f3ae6f53b61edf5d174777ed14d0f7da0c4e

Satellite background: NASA Blue Marble Next Generation, May 2004, static global
composite with topography/bathymetry, obtained from NASA WorldWind:
https://github.com/NASAWorldWind/WebWorldWind/blob/develop/images/BMNG_world.topo.bathy.200405.3.2048x1024.jpg
https://earthobservatory.nasa.gov/features/BlueMarble
NASA imagery is generally available for public use; NASA is credited in the map.
No endorsement is implied. This image is historical imagery, not a live feed.
SHA-256: 7405c39a220bc37519474eba54625a0d1a02b6ad954895147c103a1bc8dd61fb

Boundaries in this small-scale reference map do not imply any position on disputed
territories. Historical events are individually source-linked. The history view
uses modern reference boundaries; it does not claim to reproduce historical borders,
front lines, military units, or troop movements.

## Source and coordinate ledger

The product view is a place-exploration map, not a measured thematic layer or a
navigation instrument. Coordinates are WGS84 decimal longitude/latitude,
equirectangular projection with longitude -180° at the left edge, 0° at the
center, +180° at the right, and latitude +90° at the top. The NASA raster uses the
same global frame. Geometry, labels, and hit targets share one projection helper.
London, New York, Sydney, the origin, and the poles are tested alignment anchors.
Geometry is bounded at the antimeridian; there is no repeated-world wrap.

Borders and coastlines scale in map space; strokes, location badges, and cluster
counts remain screen stable. Nearby points cluster, then separate with zoom.
Country tints and contour accents are decorative reference styling and encode no
political allegiance, measurement, movement, or historical territorial claim.

These bundled layers have no live update cadence, credentials, provider requests,
usage units, or per-view rate limits. The download hashes above pin the supplied
assets. A failed local asset load shows an error instead of substituting a false
map. Ordinary HTTP caching may retain public geography and imagery; private saved
places are stored only in the supplied private account/preview settings adapter.
The curated historical event date is its start date; already begun events remain
visible when viewing later dates. The curated collection is intentionally small
and does not claim comprehensive coverage.

Live aircraft, shipping, news, weather, wildfire, and friend-location feeds remain
disconnected, with provider-required or sharing-off labels. There are no decorative
moving aircraft or ships that could be mistaken for observed data. Historical
events have visible dates and source links, and casualty prose distinguishes
casualties from people killed. The product never reads the user's device location.
Saved coordinates are rounded to 0.1° (roughly city-level, varying with latitude).
Mobile maps own their pan/pinch gestures; zoom buttons, search, reset, and keyboard
movement provide alternatives. Portrait mode uses compact panels and a bottom
detail sheet rather than requiring landscape orientation.
