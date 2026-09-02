I went through both categories and opened the Info tab for every model that looked like a genuine local-rule cellular/agent-based model, skipping System Dynamics-style feedback-loop models, pure network/link-based diffusion models, and generative (non-per-tick) models. Given how large these two categories are (roughly 50+ entries each once you count sub-folders like Evolution and Economics), I focused on the clearest, most representative rule-based candidates rather than every single title — happy to keep going through the rest if you want more.

**Biology**

Ants: each ant wanders randomly until it finds food, then carries it home while dropping pheromone; other ants sniff the gradient and follow it, reinforcing the trail. Very strong JS fit — it's just a grid with a diffusing scalar field and simple turtle steering, trivial in canvas/WebGL.

Termites: a termite wanders randomly, and if it bumps a wood chip it picks it up and drops it near the next chip it bumps into; piles emerge with no leader. Strong JS fit — patch-color-as-data-structure trick is easy to replicate with a typed array grid.

Fireflies: each firefly runs its own internal clock and flashes at the top of its cycle; seeing enough neighboring flashes resets its clock (via "delay" or "advance" strategies), producing emergent synchrony. Excellent JS fit — no spatial grid even required, just timers and neighbor checks, could run great as a lightweight canvas demo.

Flocking: birds locally apply alignment, separation, and cohesion (the classic Boids rules) affecting only heading, at constant speed. Excellent JS fit — this is literally the most common canvas/WebGL demo pattern already.

Wolf Sheep Predation: wolves and sheep wander randomly, lose energy each step, eat prey/grass to gain energy, reproduce probabilistically, and die at zero energy; grass regrows over time. Good JS fit, slightly more state per agent (energy, breed) but still simple local rules.

Rabbits Grass Weeds: rabbits wander and eat grass/weeds that sprout randomly on patches, gaining energy to reproduce or dying if energy runs low. Good fit, essentially a simpler Wolf-Sheep variant.

Heatbugs: agents move to the coolest/warmest adjacent empty patch depending on how far the local temperature is from their personal ideal, while patches diffuse and evaporate heat. Excellent fit — it was explicitly built as a cross-toolkit ABM benchmark, so it's almost designed to be ported to a new framework.

Rock Paper Scissors: patches hold one of three "species"; at stochastic (Poisson-timed) events pairs of neighbors fight (rock beats scissors, etc.), reproduce into blank neighbors, or swap places. Doable in JS, though the event-based/Poisson-scheduling formulation is a bit more unusual than a plain synchronous grid update.

Tumor: stem cells divide asymmetrically (renewing themselves while producing transitory cells) or occasionally symmetrically (metastasis); transitory cells divide while young then age, discolor, and die. Good fit — it's a small state-machine-per-cell CA.

Virus: people move randomly, get infected on contact with a fixed probability, recover/die/gain temporary immunity, and reproduce below a carrying capacity. Good fit, a very standard SIR-style ABM.

Disease Solo: a user-controlled agent plus AI "androids" that wander (optionally chasing/avoiding), spreading infection by co-location with a fixed per-tick probability. Good fit, simple and interactive — arguably nice for a browser demo since it already has a human-in-the-loop control scheme.

Fairy Circles: termite colonies send out termites that harvest grass roots and fight rival-colony termites, while grass patches grow roots and compete for diffusing soil moisture. Reasonable fit but more moving parts (colonies + grass + moisture diffusion), so more of a medium-complexity port.

Slime: each "cell" drops pheromone and sniffs three directions to climb the gradient once local concentration passes a threshold, aggregating into clusters via positive feedback. Excellent JS fit, essentially the same pattern as Ants.

Daisyworld: patches compute local temperature from absorbed sunlight (albedo) and diffusion from neighbors; open ground near a daisy has a temperature-dependent chance of sprouting a same-colored daisy, and daisies die at a max age. Excellent fit — this is a pure grid/patch cellular automaton, no turtles required, very easy to port.

BeeSmart Hive Finding: scout bees explore, inspect hive sites, and recruit others via waggle dances whose length/enthusiasm scales with site quality, until a quorum triggers a colony-wide "piping" cascade. Moderate-to-good fit — it's explicitly built as a bee state machine (discover → inspect → dance → revisit → pipe), which maps cleanly onto JS state objects, just more states than the simpler models.

Peppered Moths: moths reproduce with mutated coloration, and a selection pressure tied to background pollution level probabilistically removes poorly camouflaged moths. Good fit, simple birth/death/mutation loop.

Shepherds: shepherds wander randomly and, like termites with wood chips, pick up a sheep and drop it near another sheep, herding sheep into piles. Excellent fit — structurally identical to Termites, one of the easiest to port.

(Skipped as not fitting the "simple local rule" pattern: Blood Sugar Regulation and similar feedback-loop models, which read as System Dynamics; CRISPR Bacterium/Ecosystem LevelSpace and Slime Mold Network, which lean on NetLogo's LevelSpace/network-link machinery; and generative, non-per-tick models like Sunflower/Sunflower Emergent/Biomorphs.)

**Social Science**

Segregation (Schelling): each agent checks the percentage of same-color neighbors and relocates if it's below its personal tolerance threshold. Excellent JS fit — the canonical grid ABM, very easy to reimplement.

Rebellion (Epstein civil violence): agents carry a grievance score and estimate arrest risk from the local cops-to-rebel ratio; if grievance exceeds risk they turn "active," and nearby cops jail active agents for a random term. Good fit — more per-agent state than Segregation, but still all locally computed.

Sugarscape 2 Constant Growback: patches slowly regrow sugar up to a max; agents move to the best unoccupied visible cell, harvest it, and die if they run out of sugar from their fixed metabolism. Excellent fit, a classic benchmark ABM.

Wealth Distribution: a Sugarscape variant where people gather regrowing grain, eat it each tick based on personal metabolism, and die/reproduce with random (non-inherited) starting wealth — used to reproduce Pareto-style wealth inequality. Good fit, same mechanics as Sugarscape.

Ethnocentrism: agents carry color plus two cooperate/defect traits; adjacent agents play one-shot Prisoner's-Dilemma-style interactions affecting reproduction chance, with mutation on birth. Good fit — local pairwise interaction plus simple reproduction.

Party: guests belong to discrete "groups" (not spatial neighbors) and leave a group if its opposite-sex ratio exceeds their personal tolerance, searching for a more comfortable group. Good fit, though note it's grouping-based rather than grid-neighbor-based.

Paths: walkers head toward random destinations, preferring existing worn (gray) trails; each footstep raises a patch's "popularity," and popular-enough patches become permanent routes while unused ones decay. Excellent fit, essentially the Ants trail-reinforcement pattern applied to pedestrian routes.

Voting: a straightforward cellular automaton — each patch looks at its 8 neighbors' colors and adopts the majority vote (with optional tie-break and "close-call" rule variants). Excellent fit, one of the purest CAs in the library (kin to Conway's Life/Ising).

Traffic Basic: each car accelerates when the road ahead is clear and decelerates when it sees a car close ahead, showing jams emerging with no central cause. Excellent fit, extremely simple 1D local rule.

Hotelling's Law: each store tests a few candidate moves/price changes and adopts one only if it increases the store's market share/profit, while consumers pick whichever store minimizes price-plus-distance. Good fit — agent-based, though each agent does a small local "trial move" search each tick rather than a single fixed rule.

Taxi Cabs: cabs cruise city-grid streets, pick up passengers generated from time-varying origin/destination probabilities, and navigate to drop-off points obeying traffic lights and fare rules. Workable but more infrastructure-heavy (road network, traffic-light timers, stochastic demand tables) — a bigger porting effort than the others.

Minority Game: each agent picks side 0/1 using whichever of its several fixed strategies (indexed by recent binary history) has scored best, and agents in the minority earn a point. Very good fit for JS, and notably it needs no spatial grid at all — just arrays of agents with lookup-table strategies, so it's arguably one of the easiest and most self-contained to port.

Scatter: agents (with five selectable movement rules such as "move to largest open space" or "move away from nearest neighbor") execute rules gleaned from real interview data on classroom scattering behavior. Excellent fit, simple local distance-based rules with several interchangeable variants.

Rumor Mill: each person who knows the rumor tells one randomly chosen neighbor per tick, spreading it out from one or more seed locations across a grid. Excellent fit, another very clean local-diffusion CA.

I looked at Prisoner's Dilemma Basic too, but it's really just a single one-shot two-player decision demo (no population of interacting agents updating over time), so it doesn't fit the "cellular/agent update rule" pattern you're after — the population versions like PD Two/N-Person Iterated would be better analogues if you want that family covered. I also skipped Braess Paradox, Bidding Market, Limited Order Book, Artificial Anasazi, and the Distribution Center Discrete Event Simulator as they lean on network/graph routing or discrete-event-simulation idioms rather than a simple per-tick local update rule, and Language Change since it's fundamentally a preferential-attachment network/graph model (nodes and links) rather than grid/spatial agents.

If you'd like, I can go deeper into any specific model's Code tab (not just Info) to sketch out actual pseudocode for a JS port, or continue through the remaining untouched titles (e.g., the Evolution sub-folder, CRISPR family, or Economics models I skipped).