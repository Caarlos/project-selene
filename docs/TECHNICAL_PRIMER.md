# SELENE technical primer

This document explains, without assuming a technical background, what SELENE computes, why each number matters for a lunar base, and why the project is built the way it is. Part 1 covers the basics. Part 2 goes through the implementation decisions (the IDs match `PLAN.md` §3 and `HUMAN_ACTION.md`). Part 3 is a glossary.

---

## Part 1. The basics

### 1.1 Why the south pole is special

On Earth, the axis is tilted 23.4°, which gives us seasons and a Sun that climbs high in the sky. The Moon's axis is tilted only **1.54°**. Standing at a lunar pole, you would see the Sun crawl around the horizon once a month, never rising more than about a degree and a half, and never setting far below it.

Two consequences follow, and they are the whole reason the south pole is the target of the Artemis programme:

* **Mountain tops and crater rims can be in sunlight almost all the time**, because a Sun that skims the horizon is hidden only when something taller stands in the way. These places give near-continuous solar power and mild, stable temperatures.
* **Crater floors can be in shadow permanently**, for billions of years, because the Sun never gets high enough to shine over the rim. These "permanently shadowed regions" are among the coldest places in the solar system, cold enough to trap water ice.

So the best lit places and the places with ice are close neighbours but never the same spot. Choosing a site means balancing them.

### 1.2 Everything depends on the local horizon

Because the Sun sits so low, whether a spot is lit depends almost entirely on the **shape of the skyline around it**. A hill 100 km away that rises half a degree above the horizon can block the Sun for days.

The same is true for talking to Earth. Seen from the south pole, the Earth also hangs near the horizon. It does not circle like the Sun; it wobbles slowly inside a small box in the sky (see 1.5), dipping below the skyline for days at a time.

So the central object in SELENE is the **horizon profile**: for a given spot, how many degrees the terrain rises above the horizontal in every compass direction, all the way around (360°). Once we have it, answering "is the Sun visible now?" or "is the Earth visible now?" is a simple comparison: is the body higher than the skyline in the direction where it currently stands?

### 1.3 How the horizon is computed

We start from an **elevation model**: a map made by the laser altimeter LOLA on NASA's Lunar Reconnaissance Orbiter, in which every pixel stores the height of the ground.

From a spot, we look out in one compass direction and walk along the ground in that direction, pixel by pixel, out to 150 km. At each step we ask: how high does this piece of ground appear from where I stand? The highest answer along the line is the skyline in that direction. Repeating it for 360 directions gives the horizon profile. This procedure is called **ray tracing**.

Two details matter:

* **The Moon is round and small.** Ground 100 km away has curved almost 3 km "down" out of view. The calculation follows the true sphere, so distant mountains are correctly lowered.
* **Far terrain counts.** A 5 km mountain can cast a shadow 130 km long when the Sun is this low. That is why the walk goes out to 150 km, and why the elevation map must extend well beyond the area we study.

This is the expensive part of the whole project (tens of billions of small steps). It is done once, offline, because the terrain does not change.

### 1.4 Where the Sun and Earth are: the ephemeris

An **ephemeris** is a timetable of where celestial bodies are. We do not compute orbits ourselves: NASA's Jet Propulsion Laboratory publishes them through a service called **Horizons**.

A convenient way to describe the Sun's position relative to the Moon is the **sub-solar point**: the place on the Moon where the Sun is exactly overhead at that moment. Likewise the **sub-Earth point** is where the Earth is overhead. From those two points, plain geometry gives the direction of the Sun and the Earth as seen from any other place on the Moon. So one small table (two points per hour) serves every location.

### 1.5 Libration: why the Earth moves in the lunar sky

The Moon always shows the same face to Earth, but not exactly. Its orbit is slightly oval and tilted, so from Earth we see it nod and rock a little. This is called **libration**. Seen from the Moon, the effect is that the Earth drifts by up to about ±7° in the sky over a month.

At the equator that is irrelevant. At the south pole, where the Earth sits at the horizon, ±7° is the difference between a clear radio link and no link at all. A calculation that ignores libration is useless here, which is why SELENE takes Earth's position from Horizons (which includes it) and not from a simplified formula.

### 1.6 The sky view factor and micrometeoroids

The Moon has no atmosphere, so small meteoroids and radiation arrive from every direction of the open sky. A site at the bottom of a bowl sees less sky than a site on a peak, so it is partly shielded by the terrain itself.

The **sky view factor** is the fraction of the sky hemisphere that is open, from 0 (completely enclosed) to 1 (flat open plain). We get it for free from the horizon profile. It creates a real trade-off: the best lit peaks are also the most exposed.

A point of geological honesty: on the Moon, natural caves (lava tubes) exist only in the dark volcanic plains at low and middle latitudes. The south pole is ancient cratered highland with no known lava tubes, so SELENE does not pretend they are an option there.

### 1.7 Ice and temperature

Water ice on an airless surface slowly evaporates into space unless it is very cold. Below about **110 K (−163 °C)** it is stable for geological time. NASA's Diviner instrument has mapped surface temperatures at the poles for years. SELENE marks the ground whose **highest ever recorded temperature** stays below 110 K.

This tells us where ice *could survive*, not where ice *is*. That is why the number is called an **ice stability index** and not a probability.

### 1.8 Slope and roughness

Landers need gentle ground: typically slopes under about 10° over the lander's footprint. SELENE measures, for each area, the average slope, the slope exceeded by only the steepest 5% of the ground, the fraction of the area that is under 10°, and a roughness index.

One caveat that experts will ask about: **slope depends on the ruler**. Measured over 120 m the ground looks smoother than measured over 5 m, because small craters and boulders are averaged away. SELENE always states the ruler length it used.

### 1.9 The hexagonal grid

To compare places we divide the region into cells. SELENE uses **H3**, a system that tiles a sphere with hexagons at several nested sizes. Hexagons are a good choice because every neighbour is at the same distance, which keeps distance and neighbourhood calculations simple and fair.

H3 was designed for the Earth, but it is only geometry on a sphere: we reuse it for the Moon and shrink every length and area to the Moon's size (the Moon's radius is 27% of Earth's).

### 1.10 Combining criteria: MCDA

**Multi-criteria decision analysis** is a formal name for a weighted average. Each cell gets five grades between 0 and 1 (sunlight, link to Earth, safe terrain, access to ice, shielding). The user says how much each one matters by moving sliders, and the score is the weighted average. **Hard filters** work differently: they exclude a cell outright (for example, "too steep to land") whatever its other grades.

There is no single correct weighting, which is the point: a short crewed sortie, an ice-prospecting rover and a permanent base want different things. The mission presets encode those three points of view.

### 1.11 Talking to Earth: two halves of one link

A radio link needs both ends to see each other:

* **Lunar half:** is the Earth above the local skyline at the site? This depends strongly on the site.
* **Earth half:** is the Moon above the horizon at a ground station? NASA's Deep Space Network has three stations (Madrid, Goldstone, Canberra) spaced around the globe precisely so that at least one almost always sees the Moon. This does not depend on the lunar site at all.

So the ground half is nearly always satisfied and is the same for every site; the lunar half is what distinguishes sites. SELENE shows both, but only the lunar half enters the score.

---

## Part 2. Implementation decisions and why

### D-01 Hexagon sizes: resolution 5 overview, resolution 7 detail

The south polar cap from 80°S to the pole covers about 288,000 km². H3 cell sizes, once scaled to the Moon:

| H3 resolution | Cell area on the Moon | Cells in the cap |
|---|---|---|
| 5 | 18.8 km² | about 15,000 |
| 6 | 2.7 km² | about 107,000 |
| 7 | 0.38 km² | about 750,000 |
| 8 | 0.055 km² | about 5.3 million |

The first plan assumed resolutions 7 and 8 for the whole cap, using Earth-sized cell counts by mistake. That would have meant files of hundreds of megabytes. Resolution 5 gives a responsive overview; resolution 7 is used only on small named patches (Shackleton, Malapert, Cabeus) that load when the user zooms in. Any other patch can be produced by running the pipeline with a region argument.

### D-02 Listing the cells around a pole

Map libraries often fail exactly at a pole, where all longitudes meet. Instead of asking the library to "fill" the polar cap, SELENE starts at the cell containing the pole and grows outward ring by ring, keeping the cells whose centre is south of 80°S. Simple and immune to the pole problem.

### D-03 Several measurement points per cell

A resolution-5 cell is about 5 km across. Inside it there may be a sunlit ridge and a dark hollow. A single measurement at the centre would be a lottery. SELENE measures at eight points per cell (seven spread evenly, plus the highest point of the cell, since summits are the best lit) and reports two values:

* the **mean**, describing the cell as a whole;
* the **best point**, describing the spot you would actually choose inside it.

The score uses the best point for sunlight and Earth link, because a mission lands on a spot, not on an average.

### D-04 Horizon quality: 360 directions, 150 km, true sphere

The first plan used 72 directions (every 5°) and a 50–60 km range. With a Sun that never exceeds 1.5°, errors of a tenth of a degree change the answer, and a distant peak a few kilometres wide fits entirely between two directions 5° apart. SELENE uses 1° steps and a 150 km range. On the workstation it can be run at 0.5°. The elevation map must therefore reach about 150 km beyond the study area; any cell where a ray runs off the map is flagged.

### D-05 The Sun is a disc

From the Moon the Sun is a disc about half a degree wide. Since the Sun skims the skyline, it spends long periods half hidden. Treating it as a point would turn those periods into all-or-nothing. SELENE counts the visible fraction of the disc.

### D-06 One ephemeris table for everything

Asking Horizons for the sky as seen from each of 15,000 cells would be thousands of slow requests. One request for the sub-solar and sub-Earth points gives the same information for every cell through geometry (1.4). The table for ten years, hour by hour, is under 2 MB. It is stored in the repository, so neither the pipeline nor the website depends on an external service while running, and both use exactly the same numbers.

### D-07 A full year as baseline

Polar lighting has seasons: over about 347 days the Sun's maximum height changes from +1.5° to −1.5°. A site that is brilliant in "summer" may be dark for weeks in "winter". One or two months would flatter or punish sites unfairly, and would cut the measurement of the longest dark period short. Once the horizons exist, a year costs seconds of extra computing.

### D-08 Custom dates computed in the browser

The original plan switched off sunlight and Earth-link analysis when the user picked other dates, on the assumption that it needed heavy offline processing. That assumption was wrong: the heavy part is the horizon (1.3), which does not depend on dates and is already delivered with the site. Comparing the Sun and Earth against stored horizons is light enough for a browser: a few seconds for a year over all cells.

So nothing is switched off. The honest limitation is stated on screen: custom-date results use each cell's best-point horizon; the offline pipeline gives the full set (including per-cell means).

### D-09 DSN visibility shown once, not per cell

As explained in 1.11, the ground-station half of the link is the same for every lunar site. Storing it per cell would add data without information. It is shown as one timeline of the three stations, and combined with the selected cell's Earth-visibility window.

### D-10 A flat polar map instead of a globe (for now)

A globe looks attractive, but the globe mode of the chosen graphics library is experimental, and poles are where such tools are weakest. For a region that is a disc around the pole, a flat **polar stereographic** map (the pole in the centre, as in the NASA data itself) shows everything without distortion problems and is certain to work. The globe becomes valuable when SELENE covers the whole Moon, so it is planned with that deferred feature. A verification spike is testing both.

### D-11 The website draws hexagons itself

A hexagon's outline is fully determined by its H3 code, so the site computes outlines rather than downloading them. Files get much smaller and two software libraries become unnecessary.

### D-12 Raw numbers travel; grades are computed on screen

The pipeline delivers physical quantities with units (percent of time lit, hours of darkness, degrees of slope). The 0-to-1 grades are computed in the browser from fixed, published reference values. That way a grade means the same thing in every scenario, changing a reference value needs no recomputation, and every number shown can be traced back to a physical measurement.

### D-13 Synthetic terrain for testing

To develop and test without downloading NASA data, the pipeline can run on an artificial landscape (a sphere with a crater and a ridge) whose correct answers are known from geometry. It is the same code that processes the real data, so a passing test means something. Any scenario built this way is permanently labelled "synthetic" on screen.

### D-14 Renamed and removed indicators

* "Ice probability" became "ice stability index" (1.7).
* "Regolith cover viability" was removed: there is no map of soil depth at the pole to base it on.
* The antenna-size estimate is postponed: it needs a proper radio link budget.

### D-15 The rest of the Moon

Extending SELENE to any region (with the Apollo landing sites as a historical comparison, and lava-tube skylights in the volcanic plains) needs different elevation and temperature maps and the globe view. It is postponed, and the code is written so that the region is a parameter and not an assumption.

### What limits the accuracy of v1

* **Slopes** are measured over the pixel size of the elevation map used on the small development server (on the order of 100 m). Real landing safety needs 5–20 m; the workstation run can provide 20 m.
* **Horizon directions** at 1° can miss very narrow distant peaks.
* **One year** of lighting is not the full 18.6-year cycle, so "dark all of 2027" is not identical to "permanently shadowed".
* **Best point** is the best of eight samples, not an exhaustive search of the cell.
* **Battery estimate** is a first-order sizing with editable assumptions.

---

## Part 3. Glossary

| Term | Meaning |
|---|---|
| Azimuth | Compass direction, in degrees clockwise from north. |
| Elevation (angle) | Height of something above the horizontal, in degrees. |
| DEM | Digital elevation model: a map of ground heights. |
| LOLA | Laser altimeter on the Lunar Reconnaissance Orbiter; source of the DEM. |
| Diviner | Thermal instrument on the same orbiter; source of temperatures. |
| LRO | Lunar Reconnaissance Orbiter, NASA spacecraft orbiting the Moon since 2009. |
| Ephemeris | Timetable of positions of celestial bodies. |
| JPL Horizons | NASA service that provides ephemerides. |
| Sub-solar / sub-Earth point | The place on the Moon where the Sun / the Earth is directly overhead. |
| Libration | The apparent rocking of the Moon, which makes the Earth move in the lunar sky. |
| Selenographic coordinates | Latitude and longitude on the Moon. |
| Polar stereographic | Flat map projection centred on a pole. |
| PSR | Permanently shadowed region. |
| Sky view factor (SVF) | Fraction of the sky hemisphere not blocked by terrain. |
| TRI | Terrain ruggedness index: average height difference between a pixel and its neighbours. |
| H3 | Hexagonal grid system for a sphere, with nested resolutions. |
| MCDA | Multi-criteria decision analysis: weighted combination of criteria. |
| KPI | Key performance indicator: here, a 0-to-1 grade for one criterion. |
| DTE | Direct-to-Earth radio link, without a relay satellite. |
| DSN | NASA's Deep Space Network of ground stations. |
| ISRU | In-situ resource utilisation: using local materials such as ice or soil. |
| CLPS | Commercial Lunar Payload Services, NASA's programme of robotic landers. |
| Kelvin (K) | Temperature scale starting at absolute zero; 110 K = −163 °C. |
