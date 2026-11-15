# SELENE Outreach Guide: Navigating the Lunar South Pole

## 1. Why the Lunar South Pole?

Humanity is preparing to establish a permanent presence on the Moon. Unlike the brief exploratory visits of the twentieth century, building an enduring outpost requires accessible power, survivable thermal environments, local resources, and dependable communications with Earth. Every one of these requirements points space agencies toward a unique geographical environment: the lunar south pole (80°S to 90°S).

The fundamental character of the lunar poles is dictated by celestial geometry. The Earth rotates on an axis tilted by 23.4 degrees relative to the plane of its orbit around the Sun, producing our familiar seasons and causing the Sun to climb high into the summer sky. The Moon, by contrast, has an axial tilt of only 1.54 degrees. Standing at the lunar south pole, an observer would never see the Sun climb high overhead. Instead, the Sun appears to circle continuously around the horizon once every lunar day (roughly 29.5 Earth days), never rising more than approximately 1.5 degrees above the horizontal plane and never sinking far below it.

Because sunlight strikes the polar landscape at this extreme grazing angle, the local topography determines everything:

* **Peaks of Prolonged Light:** High mountain ridges, elevated crater rims, and plateaus catch the grazing sunlight as it skims across the landscape. While no single location on the Moon receives truly uninterrupted sunlight year-round, elevated features can stay illuminated for the vast majority of the year. These locations provide near-continuous solar energy for photovoltaic arrays and avoid the punishing 14-day lunar nights experienced at the equator, offering relatively mild and stable surface temperatures.
* **Craters of Perpetual Darkness:** Deep crater basins, shadowed valleys, and depressions cast permanent shadows. Because the Sun never climbs more than 1.5 degrees above the horizon, its rays cannot reach over the tall rims of deep polar craters. Many of these hollows—known as Permanently Shadowed Regions (PSRs)—have remained completely devoid of direct sunlight for billions of years.
* **Cold Traps and Water Ice:** Without an atmosphere to circulate heat or sunlight to warm the surface, these permanently shadowed crater floors are among the coldest places in the entire solar system. In regions where maximum surface temperatures remain below 110 Kelvin (-163 degrees Celsius), volatile compounds cannot easily sublimate into space. Water ice deposited by cometary impacts and solar wind interactions over geological epochs can remain stable on or just below the surface for billions of years. Water ice is the cornerstone of in-situ resource utilization (ISRU): it can be purified for human life support, split into oxygen for breathing, and processed into liquid hydrogen and oxygen propellant to refuel spacecraft.

This creates the defining paradox of lunar site selection: the best places to harvest solar power and the places where water ice is trapped are close neighbors, yet they never occupy the same spot. Mountain rims offer light but lack accessible ice; crater floors hold ice but dwell in freezing, powerless darkness. Choosing a landing or base site is the art of balancing these physical realities.

---

## 2. The Mission Story: Apollo Then, Artemis Now

The exploration of the Moon is divided into two distinct historical chapters, each shaped by its technological era and operational goals.

### The Apollo Era (1969–1972)

During the Apollo program, NASA achieved humanity's first crewed landings on another world. Between Apollo 11 in July 1969 and Apollo 17 in December 1972, twelve astronauts walked on the lunar surface. 

Apollo was an expeditionary campaign designed around short sorties. The lunar modules targeted equatorial and low-latitude equatorial plains, primarily within the lunar maria (the dark, relatively flat basaltic basins such as Apollo 11's landing site at Mare Tranquillitatis). Landing near the equator provided flat, predictable terrain with minimal slope hazards and simplified orbital mechanics for the command and lunar modules.

From an environmental standpoint, equatorial landings were timed to coincide with early lunar morning:
* The Sun stood high enough above the horizon to illuminate craters and boulders clearly, yet low enough to prevent immediate overheating.
* Communications were straightforward: Earth was stationed high in the sky directly overhead, providing an unblocked direct line of sight.
* However, equatorial stays were strictly temporary. Days are very hot and nights very cold. No water ice could survive in these equatorial conditions, and astronauts carried all their life support consumables, batteries, and oxygen from Earth.

### The Artemis Era (The Present and Future)

NASA's Artemis program represents a paradigm shift from short exploration to sustained presence. Named after the twin sister of Apollo, Artemis aims to return humans to the Moon and establish the foundational infrastructure for a permanent lunar base camp and sustainable exploration.

Artemis targets the lunar south pole. The strategic objective is no longer simply proving that humans can land and return; it is learning to live and work sustainably on an extraterrestrial surface using local resources:
* Landing crews near permanently shadowed craters allows robotic prospectors and human explorers to extract water ice for drinking water, oxygen generation, and rocket fuel production.
* Situating habitats on elevated rims allows solar power systems to run for months with only short battery-dependent dark periods, avoiding the need to survive two-week equatorial nights.
* Yet the operational risks are far greater. The south polar terrain is ancient, heavily cratered anorthositic highland rather than smooth volcanic mare. Slopes are steep, shadows stretch for over a hundred kilometers, and the Earth wobbles low along the jagged horizon.

### The Twin Legacy

In ancient Greek mythology, Apollo and Artemis are twin children of Zeus and Leto. Apollo is the god of light, knowledge, truth, and the arts, while Artemis is the goddess of the wild frontier, the hunt, and the Moon itself.

This twin relationship mirrors the trajectory of lunar exploration:
* The historic Apollo program established the foundational knowledge, orbital mechanics, and geological understanding of the Moon.
* The modern Artemis program ventures into the rugged, uncharted frontier of the lunar south pole to hunt for vital resources and establish a sustainable home.

Project SELENE bridges this legacy. By uniting the rigorous scientific baseline inherited from decades of lunar science with modern multi-criteria navigation tools, SELENE provides the navigational compass needed to plan the return to the Moon.

---

## 3. The SELENE Ecosystem: Myth and Mission

To navigate the complex trade-offs of the lunar south pole, Project SELENE (*Selenographic Exploration & Lunar Environment Navigation Engine*) separates heavy physical calculations from interactive site selection. A central coordinator (SELENE core) orchestrates eight specialized subordinate modules.

Each module is designated by an aerospace-style backronym paired with a Greco-Roman deity whose mythological identity mirrors its engineering responsibility. This naming system serves as an educational framework to make planetary science accessible to everyone.

### SELENE (Core Engine)
* **Backronym:** Selenographic Exploration & Lunar Environment Navigation Engine
* **The Myth:** Selene is the Greek goddess and personification of the Moon. Crowned with a crescent diadem, she drove her silver chariot across the nocturnal heavens, governing the night and embodying the lunar body in its entirety.
* **What It Does in Plain Words:** SELENE is the master orchestrator of the entire platform. It establishes the lunar coordinate framework, defines the hexagonal grid standard (H3) scaled to the lunar radius, manages data contracts between offline physics calculations and the web browser, and coordinates scenario state across all modules.
* **How the Myth Mirrors the Job:** Just as the goddess Selene represents the complete Moon and guides its celestial progress, the SELENE core presides over the whole lunar navigation engine, integrating every specialized subsystem into a unified planetary model.

### HYPERION
* **Backronym:** High-resolution Yield, Polar Elevation & Relief Indexing Observation Network
* **The Myth:** Hyperion was the Titan of heavenly light and watchfulness from above ("he who watches from the heights"). In Greek cosmology, he was the father of Selene (the Moon), Helios (the Sun), and Eos (the Dawn).
* **What It Does in Plain Words:** HYPERION is the foundational topographic engine. It ingests digital elevation models (DEMs) gathered by the Lunar Orbiter Laser Altimeter (LOLA) on NASA's Lunar Reconnaissance Orbiter (LRO). It partitions the south polar region (80°S to 90°S) into lunar-scaled hexagonal cells, selects eight strategic sample points per cell (seven lattice points plus the summit), and runs ray-tracing calculations across the curved lunar sphere out to 150 kilometers in 360 compass directions (1-degree increments) to construct complete horizon profiles. It also calculates the Sky View Factor (the fraction of the overhead sky hemisphere visible from the ground) and generates shaded relief hillshade maps.
* **How the Myth Mirrors the Job:** As the primordial observer surveying the world from the highest vantage point, Hyperion maps every ridge, crater rim, and mountain peak. His watchful eyes measure the horizon lines that dictate where shadows fall and where light can reach.

### EOS
* **Backronym:** Ephemeris & Orbital Sunlight Simulator
* **The Myth:** Eos is the winged goddess of the dawn and sister of Selene. Each morning, she rises from the edge of the world to scatter the mists of night and announce the coming of solar illumination.
* **What It Does in Plain Words:** EOS simulates solar illumination. It takes the hourly positions of the Sun from high-precision orbital ephemerides (NASA JPL Horizons) and tests them against the 360-degree local skyline of each hexagonal cell. Modeling the Sun as a realistic half-degree disc (angular radius of 0.266 degrees) rather than a simplified mathematical point, EOS calculates the percentage of time each spot is illuminated throughout the year and determines the duration of the longest continuous period of darkness (in hours).
* **How the Myth Mirrors the Job:** Just as Eos marks the exact boundary between darkness and daybreak, EOS determines when the Sun rises above the jagged polar crater rims, mapping the prolonged dawn of polar peaks and measuring the length of cold polar nights.

### HESTIA
* **Backronym:** Hydration, Environmental Stability & Thermal Ice Assessment
* **The Myth:** Hestia is the goddess of the hearth, domestic architecture, and sacred fire. She represents the warmth and security of the home, presiding over the foundational resources necessary to sustain civil life.
* **What It Does in Plain Words:** HESTIA assesses environmental habitability and water-ice stability. Using a thermal model based on Diviner measurements (the Diviner Polar Resource Product) on NASA's LRO, HESTIA tracks the annual maximum and average surface temperatures across the polar cap. Because surface water ice sublimates rapidly into space in a vacuum unless temperatures stay below approximately 110 Kelvin (-163 degrees Celsius), HESTIA calculates an Ice Stability Index based on ground that stays below this critical threshold, cross-referenced with permanently shadowed region (PSR) maps. The Ice Stability Index shows where ice could survive, not where ice has been found. It also measures thermal amplitude (the temperature swing between annual average and maximum).
* **How the Myth Mirrors the Job:** A hearth cannot exist without shelter and fuel, and a lunar base cannot endure without thermal safety and water. HESTIA identifies the frozen reservoirs and stable environments essential to turn a sterile, hostile crater into a viable human home.

### ARGUS
* **Backronym:** Azimuthal Roughness, Gradient & Unobstructed-landing Surveyor
* **The Myth:** Argus Panoptes was the legendary giant endowed with one hundred all-seeing eyes. Because only a few eyes slept at any one time, Argus maintained an unblinking, perimeter-wide surveillance over everything around him.
* **What It Does in Plain Words:** ARGUS inspects the terrain for landing hazards and measures natural protection. From high-resolution LOLA elevation models, it evaluates the average slope, the 95th-percentile slope (the steepness exceeded by only the worst 5% of ground), the Terrain Ruggedness Index (TRI), and the safe-landing fraction (the percentage of ground with slopes under 10 degrees). Furthermore, using the Sky View Factor derived by HYPERION, ARGUS assesses natural topographic shielding: sites nestled within crater bowls receive less exposure to isotropic micrometeoroid flux and cosmic radiation than exposed mountain peaks. ARGUS also maintains geological accuracy: recognizing that volcanic lava tubes do not exist in the south polar highlands, it evaluates shelter strictly through natural topographic shielding.
* **How the Myth Mirrors the Job:** Like the hundred-eyed sentinel scanning every direction at once, ARGUS scrutinizes every meter of the lunar surface, spotting boulder fields, cliff drop-offs, and landing hazards that could threaten a descending spacecraft.

### HERMES
* **Backronym:** Hexagonal Earth-Relay & Mission Ephemeris System
* **The Myth:** Hermes is the winged messenger of the gods, the patron of travelers, and the guide who crosses boundaries between disparate realms to carry vital tidings without fail.
* **What It Does in Plain Words:** HERMES models direct-to-Earth (DTE) radio communications. Because the Moon wobbles slightly in its orbit—a phenomenon known as libration—the Earth's position in the lunar sky drifts by up to about ±7 degrees over the course of a month. Standing at the south pole, where Earth hovers near the horizon, this wobble causes Earth to rise and dip behind distant mountains. HERMES combines JPL Horizons ephemerides with local horizon profiles to calculate the percentage of time a site has an unobstructed line of sight to Earth and the maximum length of communication blackouts. In the web interface, it pairs these lunar visibility windows with the visibility of the Moon from NASA's Deep Space Network (DSN) ground tracking stations in Madrid, Goldstone, and Canberra.
* **How the Myth Mirrors the Job:** Just as Hermes bridged Mount Olympus and the mortal world, HERMES guarantees that the communication link connecting lunar explorers with mission controllers on Earth remains unbroken.

### ASTRAEA
* **Backronym:** Adaptive Site-selection & Terrain Risk Analysis Exploration App
* **The Myth:** Astraea is the goddess of justice, precision, and celestial balance, traditionally depicted holding the scales to weigh competing claims with unyielding accuracy.
* **What It Does in Plain Words:** ASTRAEA is the interactive visualizer and decision engine running in the user's browser. It renders a flat polar stereographic map of the south pole displaying 14,444 hexagonal cells over shaded relief imagery. ASTRAEA hosts the Multi-Criteria Decision Analysis (MCDA) engine, allowing users to move real-time sliders that assign relative weights to sunlight, communications, terrain safety, ice proximity, and radiation shielding. It recolors the entire polar cap in under 100 milliseconds without contacting an external server, applies hard safety filters (such as maximum acceptable slope or maximum dark hours), and provides an interactive cell inspector complete with a 360-degree horizon chart plotting Sun and Earth tracks against local mountains.
* **How the Myth Mirrors the Job:** Astraea holds the scales of judgment. By balancing competing engineering desires—trading off illumination against ice proximity or slope safety against communications—ASTRAEA allows mission planners to find the precise equilibrium suited to their mission objectives.

### ARTEMIS
* **Backronym:** Adaptive Reconnaissance & Targeted Exploration Mission Integration System
* **The Myth:** Artemis is the goddess of the hunt, wild landscapes, and purposeful exploration. The namesake of NASA's return-to-the-Moon initiative, she embodies active, targeted operations across challenging frontiers.
* **What It Does in Plain Words:** ARTEMIS is the mission operations layer. It translates physical indicators into actionable mission planning. It provides one-click mission presets inspired by three mission types (Artemis IV crewed sortie, CLPS robotic ice prospector, and sustainable Base Camp). The preset weights are this project's own assumptions, not NASA requirements. For any selected location, ARTEMIS calculates the geodesic distance and steepest intervening slope to the nearest accessible water-ice deposit. It provides indicative battery storage sizing based on worst-case continuous darkness hours, manages custom launch date selection via browser-side background recalculations, and features an A/B comparator that lets planners pin up to three candidate sites side-by-side to review trade-offs directly.
* **How the Myth Mirrors the Job:** Where ASTRAEA provides the scales to weigh data, ARTEMIS directs the hunt. It focuses raw geographic data toward specific operational mission objectives, charting the path from touchdown to resource extraction.

### APOLLO
* **Backronym:** Accessible Platform for Open Lunar Learning & Outreach
* **The Myth:** Apollo is the god of light, music, truth, knowledge, and healing. Revered as the bringer of enlightenment and clarity, he was also the namesake of humanity's first lunar landing program.
* **What It Does in Plain Words:** APOLLO is the open knowledge, documentation, and validation platform. Built directly into the application and repository documentation, APOLLO ensures complete scientific transparency. It documents the mathematical formulas, physical assumptions, and NASA data products that underpin every number on screen. Every metric displayed in the cell inspector links directly to APOLLO's explanations. APOLLO also preserves scientific validation records, comparing SELENE's illumination outputs against published multi-year NASA visibility maps.
* **How the Myth Mirrors the Job:** Apollo brings illumination through truth and understanding. APOLLO dispels obscurity by making complex planetary science, orbital mechanics, and landing-site engineering completely open, verifiable, and understandable to the world.

---

## 4. The Mission Planner's Dilemma: Five Critical Trade-offs

Landing on the Moon is an exercise in managing competing constraints. There is no single "perfect" landing site at the lunar south pole; every potential location involves sharp physical trade-offs. A mission architect must weigh five fundamental tensions:

### 1. Light vs. Ice
The primary trade-off at the lunar south pole is the separation between power and resources. Solar arrays require elevated ridges and crater rims that catch grazing sunlight for most of the year. However, surface water ice can only survive where maximum temperatures never exceed 110 Kelvin (-163 degrees Celsius), which occurs exclusively on permanently shadowed crater floors and deep hollows that never see sunlight. 

A habitat situated directly inside a cold trap has immediate access to water ice, but it has no solar power, requires massive nuclear or battery systems, and subjects hardware to extreme cold. Conversely, a base on a sunlit rim enjoys continuous solar energy and mild temperatures, but must traverse kilometers of rugged, shadowed terrain to reach volatile deposits.

### 2. Safe Ground vs. Illumination and Line of Sight
Spacecraft landing systems require gentle, unobstructed slopes—typically less than 10 degrees across the lander footprint—to avoid tipping over, sliding, or damaging landing legs upon touchdown. 

Unfortunately, the highest, best-illuminated summits and ridges (such as the Shackleton crater rim or the Malapert massif) are rugged, narrow topographic features bounded by steep drop-offs. The safe, flat areas tend to sit in low-lying plains or wide crater floors, which are prone to prolonged darkness and obstructed skylines. Planners must balance the safety of the initial touchdown against the long-term utility of the landing site.

### 3. Direct Earth Link vs. Topography and Libration
Because the Moon is tidally locked to Earth, our planet hovers continuously in the lunar sky. However, the Moon's orbital eccentricity and inclination cause an apparent wobble called libration, swinging the Earth's position in the lunar sky across a range of approximately ±7 degrees over a monthly cycle.

At the south pole, Earth sits perpetually near the horizon. In this low-elevation geometry, any hill, boulder, or crater rim standing along the line of sight can cause a direct-to-Earth (DTE) communication blackout lasting for days. Elevated terrain offers uninterrupted line of sight to Earth, whereas lower valleys and craters suffer regular radio outages unless supported by expensive orbital relay satellites.

### 4. Natural Shielding vs. Sky Access
The Moon has no atmosphere and no global magnetic field. Its surface is constantly bombarded by solar wind, galactic cosmic rays, and an isotropic rain of high-velocity micrometeoroids. 

The degree of natural topographic protection a site receives is measured by the Sky View Factor (SVF)—the fraction of the overhead sky hemisphere that is open and unblocked by terrain. A base nestled deep inside a steep-walled crater bowl has a low Sky View Factor, meaning the surrounding walls physically intercept incoming micrometeoroids and horizontal radiation. However, that same enclosed skyline blocks solar illumination and cuts off communications with Earth. A base on an open summit enjoys a wide-open sky for power and communications (SVF near 1.0), but is fully exposed to space hazards from every direction.

### 5. Geological Reality vs. Engineering Solutions
On popular media and in discussions of equatorial lunar exploration, volcanic lava tubes are frequently cited as natural underground shelters against radiation, temperature extremes, and micrometeoroids. In mare regions like Marius Hills or Mare Tranquillitatis, collapsed skylights (lunar pits) provide potential entry points into subterranean basaltic caverns.

At the lunar south pole, however, this option does not exist. The south polar region consists of ancient, heavily battered anorthositic highlands shaped by billions of years of impact cratering, not volcanic basaltic eruptions. There are no mapped volcanic lava tubes at the south pole. Mission planners cannot rely on natural caves for shelter; protection must be engineered on the surface, either through natural crater-wall shielding (low SVF) or by piling lunar soil (regolith) over landing infrastructure and habitat modules.

### Resolving the Dilemma: Multi-Criteria Decision Analysis

Because no single location maximizes all five criteria, the "best" site depends entirely on the nature of the mission:

* **Short Crewed Sortie (Artemis IV):** Astronauts spend a few days on the surface. The mission cannot compromise on landing safety or direct communications with mission control. Weights are heavily tilted toward safe terrain slopes, direct Earth links, and adequate sunlight, with low priority placed on long-term shielding or immediate water ice access.
* **Robotic Resource Prospector (CLPS Rover):** An uncrewed rover sent to sample volatiles can take greater landing risks and requires far less radiation shielding. Its paramount objective is ice stability. The analysis weights ice proximity and low temperatures highest, accepting steeper terrain and shorter communication windows.
* **Permanent Base Camp:** A long-term habitat must sustain human life for years. It requires a balanced compromise: a well-lit peak with short darkness periods (minimizing battery storage mass), reasonable proximity to an ice-bearing crater via a traversable slope, consistent Earth visibility, and some natural topographic shielding.

By using Multi-Criteria Decision Analysis (MCDA), Project SELENE enables scientists, mission directors, and the public to interactively adjust these weights and observe how the optimal landing zones shift across the lunar landscape. SELENE turns the overwhelming complexity of planetary astrodynamics into a clear, transparent, and navigable map for the journey ahead.

---

## 5. Try it yourself: guided activities

These five guided activities demonstrate how to use SELENE to investigate the real engineering trade-offs of the lunar south pole. Each activity focuses on a specific question, guides you through the relevant application controls, and highlights the key physical patterns to notice.

### Activity 1: Hunting for sunlight on polar ridges
* **Question to investigate:** Which south polar landforms capture the greatest share of annual sunlight, and how does the Artemis IV preset balance illumination with terrain steepness?
* **Steps:**
  1. Open the application and find the colour metric selector in the main control panel.
  2. Select `sun_best_pct` to colour the hexagonal cells by their best-point annual sunlight percentage, and observe where the brightest yellow cells cluster around 89°S to 90°S.
  3. Change the colour metric to `slope_p95_deg` to examine slope hazards across those same illuminated summits.
  4. Click the "Artemis IV" mission preset button, which assigns 30 percent weight each to sunlight, communications, and terrain safety, and applies a hard filter capping the 95th-percentile slope at 10 degrees.
* **What to notice:**
  The best-illuminated summits along the Shackleton crater rim and the connecting ridge reach over 80 percent annual sunlight, but several of those peaks have steep 95th-percentile slopes. When the Artemis IV preset is active, cells with excessive slopes are greyed out by the hard filter, leaving safer adjacent plateaus highlighted for crewed landing.

### Activity 2: The prospector's dilemma with weight sliders
* **Question to investigate:** How do candidate landing locations change across the map when mission priorities shift from crew safety to water-ice prospecting?
* **Steps:**
  1. Set the colour metric to `ice_index` to identify cells containing cold traps with maximum temperatures below 110 kelvin.
  2. Click the "CLPS" mission preset button to load the weighting for an uncrewed prospecting rover (50 percent ice proximity, 20 percent terrain safety, 15 percent sunlight, 15 percent communications, and zero protection).
  3. Observe which areas receive the highest composite scores on the map.
  4. Move the "Terrain safety" slider up to 50 percent and reduce the "Ice proximity" slider down to 20 percent to test how risk tolerance alters site selection.
* **What to notice:**
  Under the CLPS preset, the top-ranking cells shift directly towards the edges of deep permanently shadowed craters such as Cabeus, Haworth, and Shoemaker, even where illumination is modest. As you increase the terrain safety weight, the top-scoring sites move outward onto flatter plains, illustrating the engineering tension between seeking ice and avoiding steep crater slopes.

### Activity 3: Comparing candidate sites for a permanent base
* **Question to investigate:** When comparing candidate locations for a permanent lunar base, how do trade-offs in continuous darkness, battery mass, and ice access compare side by side?
* **Steps:**
  1. Select the "Base Camp" mission preset, which applies balanced weights across all criteria and enables a hard filter capping continuous darkness at 150 hours.
  2. Click on a high-scoring cell on the Shackleton crater rim and click the "Pin" button in the inspector to add it to the comparison list.
  3. Select a second candidate cell on the Malapert massif (around 86°S) and pin it as well.
  4. Select a third cell on the floor of a nearby depression or plain, pin it, and open the A/B comparison table.
  5. Compare their values for `dark_max_h_best`, `battery_estimate` mass, and `base_to_ice` distance.
* **What to notice:**
  The Shackleton rim cell has short periods of darkness (under 60 hours), resulting in a modest battery mass estimate, but sits further from flat traversable ice access. The Malapert summit provides elevated terrain and steady communications, but involves longer dark periods and greater battery mass. The low-lying cell suffers from hundreds of hours of continuous darkness, causing its battery mass estimate to surge into thousands of kilograms.

### Activity 4: Exploring polar seasons with custom date ranges
* **Question to investigate:** How does the 347-day lunar seasonal illumination cycle affect solar power availability and continuous darkness between polar summer and polar winter?
* **Steps:**
  1. Select a cell on the Shackleton ridge and note its baseline annual sunlight and darkness metrics in the inspector using the default full-year 2027 scenario.
  2. Open the date selector and choose a 30-day summer window (use the "polar summer" preset; in 2027 the summer peaks in October and November, when the sub-solar latitude reaches its southern extreme).
  3. Allow the background worker to recompute sunlight metrics, and check the updated `sun_best_pct` and `dark_max_h_best` values in the inspector.
  4. Change the date range to a 30-day polar winter window about half a lunar year away (the "polar winter" preset; in 2027 the winter is deepest in April and May). The lunar seasonal cycle lasts about 347 days, so these months shift earlier every year.
  5. Inspect the horizon chart to observe how the Sun track dips relative to the local skyline during winter.
* **What to notice:**
  During polar summer, a well-placed ridge cell is lit for most of the month with only brief dips in light. In polar winter, the Sun track sinks behind the surrounding terrain, causing the sunlight percentage to plunge and continuous dark hours to spike. This demonstrates why missions cannot rely on short summer measurements when planning year-round surface infrastructure.

### Activity 5: The Earth link and ground tracking with the DSN panel
* **Question to investigate:** Why does a direct radio link to Earth experience periodic outages at the south pole, and how does NASA's Deep Space Network ensure that a receiving station is listening whenever Earth is visible?
* **Steps:**
  1. Set the colour metric to `earth_best_pct` and observe the difference between the lunar near side (longitudes facing Earth) and far side.
  2. Switch the colour metric to `earth_outage_max_h_best` to identify areas with long continuous radio blackouts.
  3. Select a cell near the boundary of the near side and far side, and inspect the 360-degree horizon chart to view the monthly libration loop of Earth dipping behind the local horizon.
  4. Open the Deep Space Network (DSN) panel to examine the visibility timeline across the three Earth ground stations (Madrid, Goldstone, and Canberra).
  5. Check the combined link availability, which verifies when Earth is above the local lunar skyline and at least one DSN station has the Moon elevated above 10 degrees.
* **What to notice:**
  Earth wobbles across a box of roughly $\pm 7^\circ$ in the lunar sky due to libration, causing low-elevation sites to lose direct contact for days at a time. Meanwhile, in the DSN panel, notice that Earth ground stations rotate beneath the Moon so that at least one station has the Moon in view almost 100 percent of the time. This proves that the critical bottleneck for polar communications is the lunar local terrain horizon rather than ground station availability on Earth.
