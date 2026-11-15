# SELENE technical primer

This document explains, without assuming a technical background, what SELENE computes, why each number matters for a lunar base, and why the project is built the way it is. Part 1 covers the basics. Part 2 goes through the implementation decisions (the decision IDs match `PLAN.md` section 3). Part 4 is a metric reference. Part 3 is a glossary.

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

One caveat that experts will ask about: **slope depends on the ruler**. Measured over 80 m the ground looks smoother than measured over 5 m, because small craters and boulders are averaged away. In the baseline scenario, slopes are measured over 80 m, and SELENE always states the ruler length it used.

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

The south polar cap from 80°S to the pole covers about 288,000 km². The overview grid has 14,444 cells of about 20 km² each. H3 cell sizes, once scaled to the Moon:

| H3 resolution | Cell area on the Moon | Cells in the cap |
|---|---|---|
| 5 | about 20 km² | 14,444 |
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

Asking Horizons for the sky as seen from each of the 14,444 cells would be thousands of slow requests. One request for the sub-solar and sub-Earth points gives the same information for every cell through geometry (1.4). The table for ten years, hour by hour, is under 2 MB. It is stored in the repository, so neither the pipeline nor the website depends on an external service while running, and both use exactly the same numbers.

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

* **Slopes** in the baseline are measured over 80 m (the pixel size of the elevation map used on the small development server). Real landing safety needs 5 to 20 m; the workstation run can provide 20 m.
* **Horizon directions** at 1° can miss very narrow distant peaks.
* **One year** of lighting is not the full 18.6-year cycle, so "dark all of 2027" is not identical to "permanently shadowed".
* **Best point** is the best of eight samples, not an exhaustive search of the cell.
* **Battery estimate** is a first-order sizing with editable assumptions.

---

## Part 4. Metric reference

### elev_m
Mean surface elevation of the cell relative to the lunar reference sphere ($R = 1737.4\text{ km}$), measured in metres ($\text{m}$).

**Formula.**
$$\text{elev\_m} = \frac{1}{N} \sum_{i=1}^N h_i$$
where $h_i = \text{DN}_i \times 0.5\text{ m}$ is the elevation of pixel $i$ relative to the reference sphere of radius $R = 1737.4\text{ km}$, and $N$ is the number of digital elevation model pixels within the cell.

**Why it matters.**
Elevated massifs and crater rims experience superior solar illumination and line of sight to Earth. Low-lying elevations in crater basins are colder and prone to prolonged shadow, but they can act as cryogenic traps for water ice. Elevation differences also govern the climb energy required for rovers travelling between habitats and resource extraction areas.

**Data source.**
LOLA digital elevation model (`ldem_75s_120m.img`) from the Lunar Reconnaissance Orbiter, ingested by the HYPERION module.

**Limits.**
Averaged across the cell from a 120 m per pixel raster, which smooths over local boulders, small craters, and steep micro-relief.

### sun_best_pct
Percentage of the scenario duration during which the Sun is visible above the horizon at the best sample point of the cell, measured in percent ($\%$).

**Formula.**
$$\text{sun\_best\_pct} = \frac{100}{N_t} \sum_{t=1}^{N_t} f_{\text{best}}(t)$$
where $f_{\text{best}}(t)$ is the lit fraction at the cell sample point with the highest overall illumination, computed with solar angular radius $\rho = 0.266^\circ$ and local terrain horizon elevation $H(A_\odot)$ at the Sun's azimuth $A_\odot$:
$$f = \operatorname{clamp}\!\left(\frac{\text{el}_\odot + \rho - H(A_\odot)}{2\rho},\, 0,\, 1\right)$$

**Why it matters.**
Continuous solar illumination provides reliable electrical power and moderates the extreme thermal conditions experienced by a lunar base. The Sun never rises more than about 1.5 degrees above the ideal horizon at the pole, so sunlight arrives almost horizontally and solar panels must be vertical or mast-mounted. Selecting a site with high illumination at its best point substantially reduces the battery mass needed to survive periods of darkness.

**Data source.**
Upstream EOS module, using horizon profiles from HYPERION (LOLA DEM) and solar ephemeris coordinates from NASA JPL Horizons.

**Limits.**
Evaluated at the best of eight sample points per cell (seven lattice points plus the highest summit pixel) rather than across a continuous search of the whole cell.

### sun_mean_pct
Average percentage of the scenario duration during which the Sun is visible across the seven regular lattice points of the cell, measured in percent ($\%$).

**Formula.**
$$\text{sun\_mean\_pct} = \frac{1}{7} \sum_{p=1}^7 \text{sun\_pct}(p)$$
where the sunlight percentage at lattice point $p$ is:
$$\text{sun\_pct}(p) = \frac{100}{N_t} \sum_{t=1}^{N_t} f_p(t)$$
with lit fraction $f_p(t) = \operatorname{clamp}\!\left(\frac{\text{el}_\odot + \rho - H_p(A_\odot)}{2\rho},\, 0,\, 1\right)$ and solar angular radius $\rho = 0.266^\circ$.

**Why it matters.**
This metric reveals whether an entire cell enjoys broad, dependable illumination or merely contains an isolated sunlit pinnacle. Comparing the mean percentage with the best point helps mission architects avoid landing on sharp ridges where adjacent workspaces lie in shadow.

**Data source.**
Upstream EOS module, combining HYPERION horizons from the LOLA DEM with NASA JPL Horizons ephemerides.

**Limits.**
Averaged over seven discrete lattice points and available only in the precomputed baseline scenario (baseline only, not recomputed in the browser for custom dates).

### dark_max_h_best
Duration of the longest continuous period without direct sunlight at the best sample point of the cell, measured in hours ($\text{h}$).

**Formula.**
$$\text{dark\_max\_h\_best} = \max_{k} \Delta t_k$$
where $\Delta t_k$ is the duration in hours of the $k$-th continuous sequence of hourly time steps where lit fraction $f = 0$ at the best sample point.

**Why it matters.**
The longest continuous dark period determines the storage capacity and total mass of batteries required for night survival. Minimising continuous darkness protects sensitive habitat electronics and mechanical seals from deep cryogenic cooling.

**Data source.**
Upstream EOS module, using HYPERION horizons from the LOLA DEM and NASA JPL Horizons ephemerides.

**Limits.**
Any period of darkness that touches the start or end of the analysed date range is treated as bounded by that range, which can truncate the measured run.

### dark_max_h_mean
Average duration of the longest continuous dark period across the seven regular lattice points of the cell, measured in hours ($\text{h}$).

**Formula.**
$$\text{dark\_max\_h\_mean} = \frac{1}{7} \sum_{p=1}^7 \text{dark\_max\_h}(p)$$
where $\text{dark\_max\_h}(p)$ is the longest continuous run of hourly steps with lit fraction $f = 0$ at lattice point $p$.

**Why it matters.**
This indicates the duration of sustained darkness across the wider operating area surrounding a base. A low mean darkness duration confirms that surface rovers and nearby work sites will not be trapped in extended cold and darkness during seasonal dips.

**Data source.**
Upstream EOS module, using HYPERION horizons from the LOLA DEM and NASA JPL Horizons ephemerides.

**Limits.**
Computed only for the precomputed baseline scenario and subject to boundary truncation if a dark period touches the start or end of the baseline year.

### earth_best_pct
Percentage of the scenario duration during which Earth is visible above the terrain horizon at the best sample point of the cell, measured in percent ($\%$).

**Formula.**
$$\text{earth\_best\_pct} = \frac{100}{N_t} \sum_{t=1}^{N_t} v_{\oplus,\text{best}}(t)$$
where Earth visibility $v_{\oplus,\text{best}}(t)$ equals $1$ when the centre of Earth has an elevation exceeding the terrain horizon profile, and $0$ otherwise:
$$v_\oplus(t) = \begin{cases} 1 & \text{if } \text{el}_\oplus(t) > H(A_\oplus(t)) + \text{mask} \\ 0 & \text{otherwise} \end{cases}$$
with default $\text{mask} = 0^\circ$.

**Why it matters.**
Direct line of sight to Earth enables direct-to-Earth communication for crew audio, telemetry, and scientific data without requiring an orbital relay satellite. Because the Moon undergoes an apparent wobble called libration of about $\pm 7^\circ$, Earth hovers near the polar horizon and swings behind nearby hills. A high percentage of visibility guarantees consistent mission control oversight and reduces operational latency.

**Data source.**
Upstream HERMES module, using horizon profiles from HYPERION and Earth direction vectors from NASA JPL Horizons.

**Limits.**
Earth is treated as an infinitesimal point at its centre; ground stations on Earth can sit up to about $1^\circ$ away from this centre as seen from the Moon.

### earth_mean_pct
Average percentage of the scenario duration during which Earth is visible above the horizon across the seven regular lattice points of the cell, measured in percent ($\%$).

**Formula.**
$$\text{earth\_mean\_pct} = \frac{1}{7} \sum_{p=1}^7 \text{earth\_pct}(p)$$
where $\text{earth\_pct}(p) = \frac{100}{N_t} \sum_{t=1}^{N_t} v_{\oplus,p}(t)$ with $v_{\oplus,p}(t) = 1$ when $\text{el}_\oplus(t) > H_p(A_\oplus(t))$.

**Why it matters.**
This metric indicates whether direct radio communications can be maintained across the broader local area as astronauts and rovers move away from the main habitat. A sharp drop between best and mean Earth visibility signals that departing the summit will cause immediate signal loss. Robust regional coverage provides greater flexibility when planning scientific exploration traverses.

**Data source.**
Upstream HERMES module, using HYPERION horizons from the LOLA DEM and NASA JPL Horizons ephemerides.

**Limits.**
Available only in the precomputed baseline scenario and simplified by treating Earth as a central geometric point.

### earth_outage_max_h_best
Duration of the longest continuous communication outage to Earth at the best sample point of the cell, measured in hours ($\text{h}$).

**Formula.**
$$\text{earth\_outage\_max\_h\_best} = \max_{k} \Delta t_{\text{outage},k}$$
where $\Delta t_{\text{outage},k}$ is the duration in hours of the $k$-th continuous run of hourly steps during which Earth is not visible ($v_{\oplus,\text{best}}(t) = 0$).

**Why it matters.**
Extended communication blackouts cut off real-time contact with Earth, forcing astronauts and autonomous systems to operate independently. Crewed safety protocols place stringent limits on allowable blackout durations before secondary satellite relays become mandatory. Minimising maximum outage hours reduces mission risk and improves emergency responsiveness.

**Data source.**
Upstream HERMES module, using HYPERION horizons and NASA JPL Horizons ephemeris data.

**Limits.**
Outages extending beyond the start or end of the analysed date window are treated as bounded by the scenario boundary and may be truncated.

### svf
Sky view factor, representing the fraction of the overhead sky hemisphere that is unobstructed by local terrain, measured as a dimensionless ratio between 0 and 1.

**Formula.**
$$\text{SVF} = \frac{1}{N_A}\sum_{A} \cos^2 H^{+}(A)$$
where $N_A = 360$ azimuth directions ($1^\circ$ steps), $H(A)$ is the terrain horizon elevation angle in degrees, and $H^{+}(A) = \max(H(A),\, 0^\circ)$, averaged across the cell lattice points.

**Why it matters.**
The sky view factor measures natural topographic shielding against micrometeoroid bombardment and cosmic radiation, because surrounding crater walls intercept incoming space particles. Conversely, an unobstructed sky with an SVF close to 1 provides open lines of sight for power harvesting and radio links. Planners must balance this trade-off, because enclosed crater floors provide shelter but sacrifice sunlight, whereas exposed peaks leave habitats vulnerable to space hazards.

**Data source.**
Upstream HYPERION module, computed by ray tracing over the LOLA elevation model (`ldem_75s_120m.img`).

**Limits.**
Computed along 360 azimuth directions out to 150 km for an observer 2 m above the ground, without resolving sub-pixel boulders or local overhangs.

### slope_mean_deg
Mean surface slope of the terrain pixels within the cell, measured in degrees ($^\circ$).

**Formula.**
$$\text{slope} = \operatorname{atan}|\nabla h|$$
$$\text{slope\_mean\_deg} = \frac{1}{N_{\text{pix}}} \sum_{i=1}^{N_{\text{pix}}} \text{slope}_i$$
where per-pixel slope is computed from the Horn $3 \times 3$ elevation gradient over the digital elevation model.

**Why it matters.**
Mean slope determines the overall feasibility of rover traversal and the mechanical effort required to move equipment across the surface. Gentle terrain reduces the likelihood of vehicle rollover, track slippage, and excessive motor strain. Low average slopes also simplify civil engineering tasks such as assembling habitat modules and laying down landing pads.

**Data source.**
Upstream ARGUS module, computed from the LOLA elevation model (`ldem_80s_80m.jp2` in the baseline run).

**Limits.**
Slope depends on the ruler over which it is measured; in the baseline scenario, slopes are measured over an 80 m baseline.

### slope_p95_deg
Ninety-fifth percentile of surface slopes within the cell, representing the incline exceeded by only the steepest five percent of pixels, measured in degrees ($^\circ$).

**Formula.**
$$\text{slope\_p95\_deg} = P_{95}(\{\text{slope}_i\}_{i=1}^{N_{\text{pix}}})$$
where $\text{slope}_i = \operatorname{atan}|\nabla h_i|$ is the per-pixel slope calculated using the Horn $3 \times 3$ gradient.

**Why it matters.**
While average slope indicates overall gradient, the 95th percentile highlights extreme terrain hazards such as crater scarps, fault steps, and steep rim slopes. Spacecraft landing gear cannot tolerate landing on steep inclines without risking structural collapse or tip-over. A low 95th-percentile slope confirms that hazardous, impassable escarpments are scarce within the cell.

**Data source.**
Upstream ARGUS module, computed from the LOLA elevation model (`ldem_80s_80m.jp2`).

**Limits.**
Measured over the 80 m pixel baseline of the elevation model, meaning metre-scale boulders, small crater benches, and local rilles are not captured.

### safe_frac
Fraction of the cell area where surface slope is equal to or less than the safe landing threshold of 10 degrees, measured as a dimensionless ratio between 0 and 1.

**Formula.**
$$\text{safe\_frac} = \frac{1}{N_{\text{pix}}} \sum_{i=1}^{N_{\text{pix}}} \mathbf{1}(\text{slope}_i \le \theta_{\text{safe}})$$
where $\theta_{\text{safe}} = 10^\circ$ and $\mathbf{1}(\cdot)$ is the indicator function that evaluates to $1$ when the condition is satisfied and $0$ otherwise.

**Why it matters.**
Spacecraft cannot target a single point with pinpoint perfection, landing instead within an uncertainty ellipse spanning hundreds of metres. A high safe-slope fraction ensures that a lander touching down anywhere within that ellipse has a high probability of finding stable, gentle ground. Low safe fractions warn mission planners of rugged terrain where an off-target touchdown could prove catastrophic.

**Data source.**
Upstream ARGUS module, calculated from LOLA elevation data (`ldem_80s_80m.jp2`).

**Limits.**
Evaluated with a fixed default threshold of $10^\circ$ over an 80 m baseline, omitting fine-scale slopes below the resolution of the raster.

### tri_m
Terrain Ruggedness Index, quantifying the mean absolute elevation difference between each surface pixel and its eight immediate neighbours, measured in metres ($\text{m}$).

**Formula.**
$$\text{TRI} = \frac{1}{8} \sum_{k=1}^8 |h_0 - h_k|$$
$$\text{tri\_m} = \frac{1}{N_{\text{pix}}} \sum_{i=1}^{N_{\text{pix}}} \text{TRI}_i$$
where $h_0$ is the central pixel elevation and $h_k$ represents the elevations of the eight neighbouring pixels.

**Why it matters.**
Ruggedness reflects fine-scale topographic unevenness that can disrupt rover navigation even when regional slopes appear gentle. High terrain ruggedness creates vibration and obstacle hazards for wheels and increases landing gear shock upon touchdown. Smoother ground with a low index value facilitates easier surface transport and habitat foundation preparation.

**Data source.**
Upstream ARGUS module, derived from the LOLA elevation model (`ldem_80s_80m.jp2`).

**Limits.**
Calculated on an 80 m grid; centimetre-scale to metre-scale surface rocks and small craters are below the detection limit of the underlying data.

### tmax_k
Annual maximum surface temperature of the cell, measured in kelvin ($\text{K}$).

**Formula.**
$$\text{tmax\_k} = \frac{1}{N_{\text{pix}}} \sum_{i=1}^{N_{\text{pix}}} T_{\max,i}$$
where $T_{\max,i}$ is the annual maximum surface temperature value of pixel $i$ from the Diviner Polar Resource Product.

**Why it matters.**
Maximum surface temperature is the fundamental threshold determining whether volatile water ice can remain stable on or near the lunar surface. Below roughly 110 K, water ice does not readily sublimate into space, creating long-lived cryogenic cold traps. Peak temperatures also define the upper thermal envelope that habitat thermal radiators and spacesuits must manage during daylight.

**Data source.**
Diviner Lunar Radiometer Experiment Polar Resource Product (`dlre_prp_south.zip`, Paige et al. 2010) on NASA's Lunar Reconnaissance Orbiter, processed by HESTIA.

**Limits.**
Derived from a multi-year thermal model at approximately 507 m resolution covering $\pm 304\text{ km}$ around the south pole, without resolving local micro-cold traps.

### tavg_k
Annual average surface temperature of the cell, measured in kelvin ($\text{K}$).

**Formula.**
$$\text{tavg\_k} = \frac{1}{N_{\text{pix}}} \sum_{i=1}^{N_{\text{pix}}} T_{\text{avg},i}$$
where $T_{\text{avg},i}$ is the annual average surface temperature of pixel $i$ from the Diviner Polar Resource Product.

**Why it matters.**
The annual average temperature indicates the baseline thermal state of the ground surrounding a lunar base. Sustained cold environments require continuous electrical heating to prevent lubricants from solidifying and electronics from cracking. Knowing the baseline temperature allows engineers to design appropriate insulation and thermal control loops for prolonged missions.

**Data source.**
Diviner Lunar Radiometer Experiment Polar Resource Product (Paige et al. 2010) processed by HESTIA.

**Limits.**
Based on the 507 m resolution Diviner thermal model covering $\pm 304\text{ km}$ around the south pole.

### thermal_amp_k
Thermal amplitude of the cell, representing the difference between annual maximum and annual average surface temperature, measured in kelvin ($\text{K}$).

**Formula.**
$$\text{thermal\_amp\_k} = \text{tmax\_k} - \text{tavg\_k}$$

**Why it matters.**
Large swings in temperature induce thermal expansion and contraction cycles that weaken structures, joints, and solar panels over time. A small thermal amplitude indicates a more stable thermal environment that reduces stress on mechanical seals and electronic packages. Minimising thermal extremes prolongs the operating life of sensitive surface scientific instruments and habitats.

**Data source.**
Upstream HESTIA module, calculated from Diviner Polar Resource Product temperature bands.

**Limits.**
The Diviner data product provides maximum and average temperatures but no minimum, so this amplitude reflects maximum above average and serves as a lower bound on the full peak-to-peak temperature swing.

### psr_frac
Fraction of the cell area classified as permanently shadowed region, measured as a dimensionless ratio between 0 and 1.

**Formula.**
$$\text{psr\_frac} = \frac{1}{N_{\text{pix}}} \sum_{i=1}^{N_{\text{pix}}} \mathbf{1}(\text{pixel } i \in \text{PSR})$$
where a pixel belongs to a permanently shadowed region when its digital number in the LOLA PSR product equals $20000$.

**Why it matters.**
Permanently shadowed regions have remained sheltered from direct solar radiation for billions of years, making them prime candidates for ancient volatile ice deposits. However, operating inside permanent shadow presents severe challenges, including the absence of solar illumination and extreme cryogenic temperatures. Tracking the shadow fraction allows mission designers to assess whether a site offers nearby extraction opportunities while keeping the base on sunlit ground.

**Data source.**
LOLA Permanently Shadowed Regions dataset (`LPSR_75S_120M_201608.TIF`, NASA GSFC / LRO) processed by HESTIA.

**Limits.**
Derived from a 120 m per pixel binary classification raster based on multi-year illumination simulations, without capturing sub-pixel topography or light scattering.

### ice_index
Water-ice thermal stability index, defined as the fraction of cell pixels with annual maximum surface temperature below 110 kelvin, measured as a dimensionless ratio between 0 and 1.

**Formula.**
$$\text{ice\_index} = \frac{1}{N_{\text{pix}}} \sum_{i=1}^{N_{\text{pix}}} \mathbf{1}(T_{\max,i} < 110\text{ K})$$
where $T_{\max,i}$ is the modelled annual maximum surface temperature of pixel $i$.

**Why it matters.**
Water ice exposed to the vacuum of space will rapidly sublimate unless temperatures stay below approximately 110 K over geological timeframes. This index highlights locations that satisfy the thermodynamic requirements for ice preservation, identifying candidate areas for resource prospecting. It acts as an environmental indicator of where ice could survive rather than a direct confirmation of water presence.

**Data source.**
Upstream HESTIA module, computed from the Diviner Polar Resource Product (`dlre_prp_south.zip`).

**Limits.**
This is an index of thermal stability rather than a physical detection of ice; volatiles may be absent if they were never delivered or were removed by space weathering.

### kpi_sun
Normalised key performance indicator for solar illumination, measured as a dimensionless score between 0 and 1.

**Formula.**
$$\text{kpi\_sun} = \operatorname{clamp}\!\left(\frac{\text{sun\_best\_pct}}{100},\, 0,\, 1\right)$$

**Why it matters.**
This indicator standardises illumination into a uniform grading scale that can be weighted against other landing priorities. High values identify sites capable of sustaining solar-powered base operations with minimal reliance on backup storage.

**Data source.**
ASTRAEA browser MCDA engine, computed from the EOS `sun_best_pct` metric.

**Limits.**
By default based on the best point of the cell, the most favourable installation site rather than the average across the area. The application lets the user switch `kpi_sun` and `kpi_comms` to the cell mean (`sun_mean_pct`, `earth_mean_pct`) for the baseline scenario.

### kpi_comms
Normalised key performance indicator for direct-to-Earth communication visibility, measured as a dimensionless score between 0 and 1.

**Formula.**
$$\text{kpi\_comms} = \operatorname{clamp}\!\left(\frac{\text{earth\_best\_pct}}{100},\, 0,\, 1\right)$$

**Why it matters.**
Reliable direct radio links to Earth are vital for crew safety, mission coordination, and constant telemetry streaming. Normalising Earth visibility into a zero-to-one score lets planners balance communication needs directly against resource access and landing terrain. A high communications score reduces dependence on complex orbital relay constellations.

**Data source.**
ASTRAEA browser MCDA engine, computed from the HERMES `earth_best_pct` metric.

**Limits.**
Evaluates line of sight from the best point of the cell to the centre of Earth; Earth ground station availability across the Deep Space Network is tracked separately.

### kpi_terrain
Normalised key performance indicator for landing slope safety, measured as a dimensionless score between 0 and 1.

**Formula.**
$$\text{kpi\_terrain} = \operatorname{clamp}(\text{safe\_frac},\, 0,\, 1)$$

**Why it matters.**
Landing a spacecraft safely requires level ground free of severe slopes that could cause the vehicle to slide or tip. Standardising safe slope area into a key performance indicator allows the multi-criteria engine to penalise hazardous, rugged terrain. High terrain scores ensure that landing dispersion ellipses contain ample safe ground for landing gear touchdown.

**Data source.**
ASTRAEA browser MCDA engine, computed from the ARGUS `safe_frac` metric.

**Limits.**
Inherits the 10-degree safety threshold and 80 m measurement baseline of the underlying digital elevation model.

### kpi_ice
Normalised key performance indicator for proximity to surface water ice, measured as a dimensionless score between 0 and 1.

**Formula.**
$$\text{kpi\_ice} = \operatorname{clamp}\!\left(1 - \frac{d_{\text{ice}}}{d_{\text{scale}}},\, 0,\, 1\right)$$
where $d_{\text{scale}} = 30\text{ km}$ (`KPI_ANCHORS.iceDistanceScale_km`) and $d_{\text{ice}}$ is the surface distance in kilometres to the nearest cell with $\text{ice\_index} \ge 0.2$ (`KPI_ANCHORS.iceIndexMin`), with $d_{\text{ice}} = 0$ if the cell itself qualifies; if no cell qualifies, the value is $0$.

**Why it matters.**
Water ice is a precious local resource for generating drinking water, breathable oxygen, and liquid rocket propellant. Habitats cannot reside directly inside cryogenic crater hollows without sacrificing solar power, so they must be built within practical driving distance of ice deposits. This indicator quantifies how readily surface rovers can access ice while the base stays on illuminated ground.

**Data source.**
ASTRAEA browser MCDA engine, combining HESTIA `ice_index` values with great-circle surface distance calculations ($R = 1737.4\text{ km}$).

**Limits.**
Measures distance along a spherical great circle without accounting for topographic obstacles, cliff drop-offs, or impassable craters between the cells.

### kpi_protection
Normalised key performance indicator for natural topographic shielding against space radiation and micrometeoroids, measured as a dimensionless score between 0 and 1.

**Formula.**
$$\text{kpi\_protection} = \operatorname{clamp}\!\left(\frac{1 - \text{svf}}{s_{\text{scale}}},\, 0,\, 1\right)$$
where $s_{\text{scale}} = 0.25$ (`KPI_ANCHORS.shieldingScale`) and $\text{svf}$ is the sky view factor.

**Why it matters.**
The lunar surface lacks an atmosphere and global magnetic field, exposing inhabitants to galactic cosmic rays and micrometeoroid showers. Natural crater walls intercept particles arriving from low elevation angles, offering passive shielding that reduces required habitat wall mass. Scoring topographic protection enables planners to reward naturally sheltered sites during long-term base evaluation.

**Data source.**
ASTRAEA browser MCDA engine, computed from the HYPERION `svf` metric.

**Limits.**
Only open-sky blocking by surrounding elevation is considered; lava tubes do not exist in the south polar highlands and are not included in the model.

### score
Composite multi-criteria score reflecting the weighted suitability of a cell across all available criteria, measured as a dimensionless value between 0 and 1.

**Formula.**
$$\text{Score}_i = \frac{\sum_k w_k \,\text{KPI}_{i,k}}{\sum_k w_k}$$
where $w_k \ge 0$ is the user-assigned weight for criterion $k \in \{\text{sun}, \text{comms}, \text{terrain}, \text{ice}, \text{protection}\}$; any KPI with missing inputs is excluded from both sums, and if the sum of available weights equals zero, all cells receive a neutral score of $0.5$.

**Why it matters.**
Lunar base selection involves irreconcilable physical trade-offs, such as choosing between sunlit peaks and volatile-rich crater floors. The composite score combines disparate environmental factors into an integrated assessment tailored to specific exploration goals. By varying weight sliders, planners can immediately visualise how trade-offs alter the ideal landing site for different mission architectures.

**Data source.**
ASTRAEA browser MCDA engine, combining the five normalised KPIs with user weights or mission presets.

**Limits.**
Uses a linear additive weighting model that does not account for complex non-linear interdependencies between criteria or operational thresholds outside active filters.

### battery_estimate
First-order estimate of the battery storage mass and energy required to sustain a survival power load across the longest continuous darkness period, measured in kilograms ($\text{kg}$) and kilowatt-hours ($\text{kWh}$).

**Formula.**
$$E = P \cdot t$$
$$m = \frac{E \cdot 1000}{e \cdot \text{DoD}} = \frac{P \cdot t \cdot 1000}{e \cdot \text{DoD}}$$
where $E$ is the required energy in kilowatt-hours ($\text{kWh}$), $m$ is battery mass in kilograms ($\text{kg}$), $P$ is the survival electrical load in kilowatts ($\text{kW}$, default $1\text{ kW}$), $t = \text{dark\_max\_h\_best}$ is the longest dark period in hours ($\text{h}$), $e$ is specific energy in watt-hours per kilogram ($\text{Wh/kg}$, default $200\text{ Wh/kg}$), and $\text{DoD}$ is the usable depth of discharge (default $0.8$).

**Why it matters.**
Batteries represent a major share of spacecraft landed mass and can quickly exceed payload capacity if shadow durations are prolonged. Calculating the battery mass needed for a given site gives engineers an immediate operational metric for comparing candidate locations. It allows mission planners to verify whether local dark periods can be realistically survived using electrochemical storage.

**Data source.**
ARTEMIS operations module, reading $t$ from EOS `dark_max_h_best` with user-adjustable electrical parameters.

**Limits.**
First-order estimate only; cell capacity loss from extreme cold, battery ageing, structural casing packaging, and thermal control heaters are not modelled.

### base_to_ice
Traverse assessment from a selected base location to the nearest ice-bearing cell, comprising great-circle surface distance in kilometres ($\text{km}$) and steepest mean slope along the straight traverse line in degrees ($^\circ$).

**Formula.**
Surface distance $d$ on the lunar sphere of radius $R = 1737.4\text{ km}$:
$$d = R \arccos\big(\sin \phi_1 \sin \phi_2 + \cos \phi_1 \cos \phi_2 \cos(\lambda_2 - \lambda_1)\big)$$
Steepest mean slope along the traverse:
$$\theta_{\max} = \max_{j \in \text{crossed}} \text{slope\_mean\_deg}_j$$
where crossed cells are identified by sampling the straight line in polar stereographic projection space between cell centres at approximately $1\text{ km}$ intervals ($\text{step\_m} = 1000$).

**Why it matters.**
Establishing a base on a sunlit ridge requires sending robotic rovers or human crews into neighbouring cold traps to extract water ice. Traverse distance dictates trip time, communication link margins, and the electrical energy needed for round-trip transport. Measuring the steepest intervening slope reveals whether a vehicle must overcome steep crater scarps that could cause wheel slip or rollover.

**Data source.**
ARTEMIS operations module, reading HESTIA `ice_index` locations and ARGUS `slope_mean_deg` values across scenario cells.

**Limits.**
Evaluates terrain along a straight line in polar stereographic projection space rather than computing a true least-cost traverse path that navigates around steep obstacles.

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
