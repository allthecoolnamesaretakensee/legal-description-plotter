# Survey Copilot - Domain Knowledge Base

> This document contains surveying domain knowledge to help AI assistants understand legal description parsing. Read this at the start of any development session.

---

## Table of Contents
1. [Legal Description Types](#legal-description-types)
2. [Point of Commencement vs Point of Beginning](#poc-vs-pob)
3. [Bearing Conventions](#bearing-conventions)
4. [Cardinal Directions](#cardinal-directions)
5. [Curve Calculations](#curve-calculations)
6. [Aliquot Parts System](#aliquot-parts-system)
7. [Common Patterns](#common-patterns)
8. [LESS and EXCEPT Clauses](#less-and-except-clauses)
9. [County-Specific Quirks](#county-specific-quirks)
10. [Common OCR Errors](#common-ocr-errors)
11. [Known Edge Cases](#known-edge-cases)

---

## Legal Description Types

### 1. Metes and Bounds
The oldest form of land description. Uses bearings (directions) and distances to trace the boundary.

**Example:**
```
Beginning at an iron rod found at the NW corner of Lot 5, thence S89°45'30"E 
a distance of 150.00 feet to an iron rod set, thence S00°14'30"W a distance 
of 100.00 feet...
```

**Key Components:**
- Point of Beginning (POB)
- Bearings (N45°30'15"E format)
- Distances (in feet)
- Monuments (iron rods, concrete markers, etc.)
- Curves (radius, arc length, chord bearing)

### 2. Aliquot Parts (Fractional/Government Survey)
Used in states with the Public Land Survey System (PLSS). Divides sections into quarters and smaller parts.

**Example:**
```
The NW 1/4 of the SE 1/4 of Section 33, Township 28 South, Range 18 East
```

**CRITICAL: Reading Order is RIGHT TO LEFT (inside out)**
- Start with full section (5280' × 5280')
- SE 1/4 → Take southeast quarter (2640' × 2640')
- NW 1/4 → Take northwest quarter of that (1320' × 1320')

**Complex Example:**
```
The West 1/2 of the Southeast 1/4 of the Northwest 1/4 of the Northwest 1/4 of Section 9
```
Processing order (right to left):
1. Section 9: 5280 × 5280
2. NW 1/4: 2640 × 2640
3. NW 1/4: 1320 × 1320
4. SE 1/4: 660 × 660
5. W 1/2: 330 × 660

**NOT** W 1/2 first! That's the most common parsing bug.

### 3. Lot and Block (Subdivision)
References recorded plats.

**Example:**
```
Lot 15, Block 3, SUNSHINE ESTATES, according to the plat thereof recorded 
in Plat Book 45, Page 23, Public Records of Hillsborough County, Florida
```

### 4. Hybrid Descriptions
Combines multiple types - very common in Florida.

**Example:**
```
The North 200 feet of the West 1/4 of the NW 1/4 of Section 5...
```

---

## POC vs POB

### Point of Commencement (POC)
- The **reference point** where the description starts
- Often a known survey monument, section corner, or recorded point
- NOT part of the actual boundary
- Keywords: "Commence at", "Commencing at", "Begin at" (when followed by tie lines)

### Point of Beginning (POB)
- The **first corner** of the actual parcel
- The boundary CLOSES back to this point
- Keywords: "Point of Beginning", "POB", "to the point of beginning"

### Tie Lines
- Calls BETWEEN the POC and POB
- Used to locate the parcel from a known reference
- NOT part of the boundary
- Should be drawn differently (dashed, cyan) in plots

**Example:**
```
COMMENCE at the SW corner of Section 6,          ← POC
run thence North 504.34 feet,                    ← Tie Line 1
thence S89°05'E 200.00 feet to the              ← Tie Line 2
POINT OF BEGINNING;                              ← POB (boundary starts)
thence continue S89°05'E 115.00 feet,           ← Boundary Call 1
thence South 160.00 feet,                        ← Boundary Call 2
...
to the Point of Beginning.                       ← Closure
```

### Detection Rules:
1. If "Commence" or "Begin" followed later by "to the Point of Beginning" → has tie lines
2. If "Beginning at" with no later POB mention → POB is at start, no tie lines
3. Everything BEFORE "Point of Beginning" = tie lines
4. Everything AFTER "Point of Beginning" = boundary

---

## Bearing Conventions

### Quadrant Bearing Format
```
N 45° 30' 15" E
│  │   │   │  └── East/West direction
│  │   │   └───── Seconds (0-59.99)
│  │   └───────── Minutes (0-59)
│  └───────────── Degrees (0-90)
└──────────────── North/South reference
```

### Conversion to Decimal Degrees (Azimuth from North, clockwise)
| Quadrant | Formula | Example |
|----------|---------|---------|
| NE | degrees + min/60 + sec/3600 | N45°30'E = 45.5° |
| SE | 180 - (deg + min/60 + sec/3600) | S45°30'E = 134.5° |
| SW | 180 + (deg + min/60 + sec/3600) | S45°30'W = 225.5° |
| NW | 360 - (deg + min/60 + sec/3600) | N45°30'W = 314.5° |

### Common Bearing Formats in Legal Descriptions
- `N45°30'15"E` - Standard (no spaces)
- `N 45° 30' 15" E` - With spaces
- `North 45 degrees 30 minutes 15 seconds East` - Spelled out
- `N45-30-15E` - Dashes (rare)
- `N 45°30'E` - No seconds (implies 00")

---

## Cardinal Directions

When a legal says just "South" or "North" without degrees, it means DUE cardinal direction:

| Direction | Bearing | Decimal |
|-----------|---------|---------|
| North | N00°00'00"E | 0° |
| South | S00°00'00"E | 180° |
| East | S90°00'00"E | 90° |
| West | N90°00'00"W | 270° |

### "Parallel With" Pattern
Very common in Florida legals:
- "South and parallel with said West line" = Due South = 180°
- "North and parallel with said East line" = Due North = 0°
- "East and parallel with said South line" = Due East = 90°
- "West and parallel with said North line" = Due West = 270°

---

## Curve Calculations

### Curve Components
- **Radius (R):** Distance from curve center to arc
- **Arc Length (L):** Distance along the curved path
- **Chord Distance (C):** Straight line from start to end of curve
- **Chord Bearing:** Direction of the chord
- **Central Angle (Δ/Delta):** Angle at center of curve
- **Tangent Length (T):** Distance from curve start to intersection point
- **PC (Point of Curvature):** Where the curve BEGINS - the tangent point from incoming line
- **PT (Point of Tangency):** Where the curve ENDS - tangent point to outgoing line

### Curve Direction
- **Curve to the Right:** Center is to the right of travel direction
- **Curve to the Left:** Center is to the left of travel direction
- **Concave to [direction]:** Indicates which side the center is on
  - "Concave Northeasterly" = center is NE of the curve = curving to the right if heading south

### Calculation Formulas
```
Arc Length:     L = R × Δ × (π/180)      where Δ is in degrees
Chord Distance: C = 2 × R × sin(Δ/2)
Tangent:        T = R × tan(Δ/2)
```

### Minimum Required Data
To plot a curve, you need at least:
1. Radius + Arc Length, OR
2. Radius + Central Angle, OR
3. Chord Bearing + Chord Distance (approximate)

### TANGENT CURVES - Critical Knowledge (v48+)

**Key Indicator:** "Point of Curvature" (PC) or "P.C." in the legal description means the curve is TANGENT to the incoming line. This allows us to CALCULATE the chord bearing!

**Example Legal:**
```
"...thence S4°03'48"W along the East right-of-way line of U.S. highway 41 
a distance of 1203.22 feet to the Point of Beginning. Said point being the 
PC of a curve, concaved Northeasterly, having a central angle of 90° and 
a radius of 50 feet, thence Southeasterly along the arc of said curve a 
distance of 78.54 feet to the P.T. of said curve..."
```

**What we know:**
- Incoming bearing: S4°03'48"W (this is the TANGENT to the curve at PC)
- Curve is "concaved Northeasterly" = center is to the NE = curve turns RIGHT (clockwise)
- Central angle (delta): 90°
- Radius: 50'
- Arc: 78.54' (matches 2πR × 90/360 = 78.54')

**Chord Bearing Calculation:**
1. Convert incoming bearing to azimuth: S4°03'48"W = 180° + 4.063° = 184.063°
2. Determine turn direction: "Concave NE" + heading South = turn RIGHT (add to azimuth)
3. Chord bearing = incoming azimuth + (delta/2) = 184.063° + 45° = 229.063°
4. Wait - that's not quite right. For a tangent curve:
   - The chord bisects the central angle
   - Chord azimuth = incoming_azimuth + (delta/2) × direction
   - But we also need to consider: the tangent at PC is perpendicular to the radius at PC

**Correct Formula for Tangent Curve Chord:**
```
chord_bearing_azimuth = incoming_azimuth + (delta / 2) × turn_direction
where turn_direction = +1 for right turn, -1 for left turn
```

For our example:
- Incoming azimuth: 184.063° (S4°03'48"W)
- Delta/2: 45°
- Turn: RIGHT (+1) because "concave NE" and traveling roughly south
- Chord azimuth = 184.063° + 45° = 229.063°
- Convert to quadrant: 229.063° - 180° = 49.063° from South toward West = S49°04'E (approximately)

**Chord Distance:**
```
chord = 2 × R × sin(delta/2) = 2 × 50 × sin(45°) = 100 × 0.7071 = 70.71'
```

**Detection Keywords for Tangent Curves:**
- "Point of Curvature" / "P.C." / "PC"
- "Point of Tangency" / "P.T." / "PT"  
- "tangent to" / "tangent curve"
- Curve immediately following a line call (implies tangent)

**Concave Direction → Turn Direction Mapping:**
| Traveling | Concave Direction | Turn Direction |
|-----------|-------------------|----------------|
| North | East/NE | Right (+) |
| North | West/NW | Left (-) |
| South | East/SE | Left (-) |
| South | West/SW | Right (+) |
| East | North/NE | Left (-) |
| East | South/SE | Right (+) |
| West | North/NW | Right (+) |
| West | South/SW | Left (-) |

**Note:** "Concave Northeasterly" when traveling South means the center is to your LEFT, which is actually a LEFT turn. The key is: which side of your path is the center?

---

## Aliquot Parts System

### Section Dimensions
- Full section: 5280' × 5280' (1 mile × 1 mile) = 640 acres
- Quarter section (1/4): 2640' × 2640' = 160 acres
- Quarter-quarter (1/16): 1320' × 1320' = 40 acres
- Quarter-quarter-quarter (1/64): 660' × 660' = 10 acres

### Division Rules

**Two-Letter Directions (NE, SE, SW, NW):**
- Always divide BOTH width and height by 2
- NE = top right quadrant
- SE = bottom right quadrant
- SW = bottom left quadrant
- NW = top left quadrant

**Single-Letter with Fraction:**
- N 1/4 = North quarter (divide HEIGHT by 4, take top strip)
- S 1/4 = South quarter (divide HEIGHT by 4, take bottom strip)
- E 1/4 = East quarter (divide WIDTH by 4, take right strip)
- W 1/4 = West quarter (divide WIDTH by 4, take left strip)
- N 1/2 = North half (divide HEIGHT by 2, take top half)
- S 1/2 = South half (divide HEIGHT by 2, take bottom half)
- E 1/2 = East half (divide WIDTH by 2, take right half)
- W 1/2 = West half (divide WIDTH by 2, take left half)

### Strip Descriptions
"The North 200 feet of the [aliquot]" = Take only 200' from the north side

**Processing Order:**
1. Parse and apply all aliquot divisions first (right to left)
2. Apply strip modifier LAST

**Example:** "North 200' of W 1/4 of NW 1/4 of NE 1/4 of SE 1/4"
```
Section:     5280' × 5280'
SE 1/4:      2640' × 2640'
NE 1/4:      1320' × 1320'
NW 1/4:       660' × 660'
W 1/4:        165' × 660'   ← Width ÷ 4
North 200':   165' × 200'   ← Height capped at 200'
```

---

## Common Patterns

### Pattern: Multiple Parcels
```
PARCEL 1: [description]
PARCEL 2: [description]
```
or
```
[description] TOGETHER WITH [second description]
```

### Pattern: Exceptions
```
[main description] LESS AND EXCEPT [exclusion description]
```

### Pattern: Easements
```
TOGETHER WITH a 10-foot easement for ingress and egress over and across...
```

### Pattern: Reference to Other Documents
```
as described in Official Records Book 1234, Page 567
```

---

## LESS and EXCEPT Clauses

These subtract area from the main parcel. Common patterns:

### Simple Strip Exclusions
```
LESS the North 30 feet thereof for road right-of-way
EXCEPT the East 50 feet for drainage easement
LESS AND EXCEPT the West 25 feet
```

### Metes and Bounds Exclusions
```
LESS AND EXCEPT: Beginning at [POB], thence [calls]...
```

### Reference Exclusions
```
LESS AND EXCEPT that portion conveyed to the State of Florida 
in Official Records Book 789, Page 123
```

### Processing Rules:
1. Detect LESS/EXCEPT clauses BEFORE parsing main aliquot parts
2. Remove exclusion text from main parsing to avoid contamination
3. Display exclusions in UI as warnings
4. Future: Plot exclusions as dashed lines

---

## County-Specific Quirks

### Florida Counties
- **Hillsborough:** Often uses "all lying and being in" suffix
- **Pinellas:** Often references unrecorded plats
- **Polk:** Common "Mt. View" and other unrecorded subdivision references
- **Pasco:** Frequently uses lot/block with government lot references

### Skip List for County Names in Aliquot Parser
These should NOT be parsed as directional indicators:
- PINELLAS, PASCO, HILLSBOROUGH, POLK, ORANGE, OSCEOLA
- MANATEE, SARASOTA, LEE, COLLIER, BREVARD, VOLUSIA
- DUVAL, CLAY, NASSAU, BAKER, ST. JOHNS

---

## Common OCR Errors

| OCR Reads | Should Be | Context |
|-----------|-----------|---------|
| 0 (zero) | O (letter) | "N0RTH" → "NORTH" |
| 1 (one) | l (letter) | "P1at" → "Plat" |
| S | 5 | "S" in bearing vs "5" in degrees |
| 6 | G | "Ran6e" → "Range" |
| rn | m | "Townrnent" → "Township" |
| " (curly) | " (straight) | Bearing seconds |
| ' (curly) | ' (straight) | Bearing minutes |
| ° (degree) | 0 (zero) | "N450" → "N45°" |

### OCR Confidence Indicators
- Multiple spaces where one expected
- Inconsistent formatting within same description
- Numbers where letters expected (or vice versa)

---

## Known Edge Cases

### 1. Irregular Sections
Not all sections are exactly 5280' × 5280'. Sections along township edges may be irregular. For plotting purposes, we assume standard dimensions unless told otherwise.

### 2. Meander Lines
Calls like "along the meander of said creek" are UNPLOTTABLE from record. Mark as requiring field survey.

### 3. "More or Less" Distances
Distances with "more or less" are uncertain. Flag as approximate.

### 4. Reference Calls
"To the West line of Lot 5" without a bearing requires the referenced document.

### 5. Centerline Easements
Easements described by centerline don't close - they're linear features.

### 6. Multiple POB References
Some complex descriptions reference multiple starting points for different portions.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v49 | Jan 2025 | Tangent curve chord calculation, PC/PT detection |
| v48 | Jan 2025 | Fixed parcel combining logic, different subdivisions detection |
| v47 | Jan 2025 | Better long legal error messages |
| v46 | Jan 2025 | Auto bi-directional, legal in Word export, smart combine |
| v45 | Jan 2025 | Gap-fill single path display, draggable info box |
| v43-44 | Jan 2025 | Gap detection improvements, scroll wheel fix |
| v42 | Jan 2025 | Bi-directional gap-fill for meander lines |
| v37 | Jan 2025 | Cardinal direction fix, parallel call handling, wheel zoom fix |
| v36 | Jan 2025 | Strip parsing fix, W 1/4 vs W 1/2 fix, draggable popups |
| v35 | Dec 2024 | POC/POB detection, tie line visualization |
| v34 | Dec 2024 | Curve handling improvements |

---

## Contact

Bug reports: https://forms.gle/WrVRcMnrftRG7BoHA
Developer: eturnbull@teamterminus.com


## Critical Bug Log

### v39 - Duplicate Parser Bug (Jan 2025)
**Symptom:** Fractional descriptions with spelled-out directions (SOUTHEAST, NORTHWEST) not parsing correctly
**Root Cause:** `parse.js` has an INLINE `parseFractionalDescriptionInline()` function that duplicates `parse-fractional.js`. Fixes to `parse-fractional.js` have NO EFFECT because the main parser uses the inline version.
**Solution:** Must fix BOTH `parse.js:extractFractionalParts()` AND `parse-fractional.js:extractFractionalParts()`
**Key Lesson:** When debugging, always trace which code is actually being executed!


## Complex Fractional Parsing Pattern (v40+)

### TOGETHER WITH + LESS Pattern
Legal descriptions with "TOGETHER WITH" create **multiple parcels** that need to be plotted separately:

**Example:**
```
The West 1/2 of the Southeast 1/4 of the Northwest 1/4 of the Northwest 1/4 of Section 9,
Less the South 441 feet thereof, 
TOGETHER WITH the West 20 feet of the South 441 feet of the West 1/2 of the Southeast 1/4 
of the Northwest 1/4 of the Northwest 1/4, 
Less the South 18 feet for road right-of-way.
```

**Parsing Logic:**
1. **Split by "TOGETHER WITH"** - creates separate parcels
2. **For each parcel:**
   - Extract LESS clauses first (remove from main text)
   - Parse aliquot parts in **RIGHT-TO-LEFT** order
   - Apply aliquot divisions to section bounds
   - Apply strips (like "South 441 feet", "West 20 feet")
   - Finally apply LESS clauses (subtract from result)

**Key Insight:** The "TOGETHER WITH" portion often references the **same aliquot base** but then takes a strip from what was LESS'd out of the main parcel. This creates L-shaped or complex combined parcels.

## Bi-Directional Gap-Fill Pattern (v42+)

### The Problem
Legal descriptions often contain "unplottable" calls that cannot be accurately plotted from record alone:
- **Meander lines**: "along the waters of the Arlington River"
- **Irregular boundaries**: "following the high water mark"
- **Direction-only calls**: "Easterly" without specific bearing
- **More or less distances**: "665 feet, more or less"
- **Curves without chord data**: non-tangent curves missing chord bearing/distance

### The Solution: Bi-Directional Plotting
When a gap (unplottable call) is detected:

1. **Forward Path**: Plot from POB until reaching the gap call
2. **Reverse Path**: For all calls AFTER the gap, flip their bearings (add 180°) and plot FROM the POB
3. **Calculate Gap Line**: The bearing and distance that connects the forward endpoint to the reverse endpoint

### Example
```
Legal: "...thence S 0°00'40" E 665' ± to the waters;
        thence Easterly along said waters 377' ±;
        thence N 0°30'20" W 1364.1' to the POB"
```

**Processing:**
- Forward: S 0°00'40" E 665' → STOP at waters (gap)
- Gap Call: "Easterly 377'" - unplottable, no bearing
- Reverse: Take "N 0°30'20" W 1364.1'" → flip to "S 0°30'20" E 1364.1'" → plot from POB
- Calculate: Connect forward endpoint to reverse endpoint
- Result: **N 76°56'25" E, 338.57'** (calculated closing)
- Compare: Called 377' ± vs Calculated 338.57' = -38.43' difference

### Visual Representation
- **Amber/Orange**: Forward path (calls before gap)
- **Purple/Violet**: Reverse path (calls after gap, plotted from POB with flipped bearings)
- **Red Dashed**: Calculated gap line with bearing and distance

### Detection Keywords
The system looks for these patterns to identify gaps:
- "more or less", "approximately", "about"
- "meander", "along waters", "along creek", "along river"
- "shore", "bank", "waterline", "high water"
- "Northerly", "Southerly", "Easterly", "Westerly" (direction only, no bearing)
- Multiple direction changes without bearings

### Use Cases
1. **Meander lines along water features**: Calculate actual chord
2. **Curves without chord data**: Connect endpoints when arc can't be plotted
3. **Missing data**: When some calls are illegible or missing bearing info
4. **Verification**: Compare calculated vs called distances to check for errors
