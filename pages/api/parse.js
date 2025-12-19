import Anthropic from '@anthropic-ai/sdk';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  maxDuration: 60,
};

const PARSER_PROMPT = `You are an expert land surveyor with decades of experience parsing legal descriptions. Parse this legal description and extract ALL information into structured JSON.

CRITICAL INSTRUCTIONS:
1. Extract EVERY call/course in the description - do not skip any
2. Handle CURVES properly - extract all curve data
3. If there are MULTIPLE PARCELS, parse each one separately
4. Be precise with bearings - include degrees, minutes, seconds exactly as written
5. IMPORTANT: Understand the difference between POINT OF COMMENCEMENT (POC) and POINT OF BEGINNING (POB):
   - POC (Point of Commencement): The initial reference point where the description starts (often a section corner, monument, or known survey point)
   - POB (Point of Beginning): The actual first corner of the parcel being described - the boundary CLOSES back to this point
   - TIE LINES: Any courses between POC and POB are TIE LINES - they are NOT part of the boundary, they just describe how to get from the reference point to the actual parcel
   - If description says "Commencing at..." that's the POC. When it then says "to the Point of Beginning" or "to the POB", everything after that is the actual boundary.
6. For complex descriptions with multiple reference points, section calls, or exceptions - extract them all
7. Look for: "thence", "to", "along", "with", "following" as indicators of new calls
8. Handle "more or less" distances, approximate bearings, and monument references
9. NON-RADIAL CALLS: When a call says "along the centerline of a creek" or "following the meander of" etc. with just a distance and no bearing, this is a NON-RADIAL call. For these:
   - Set call_type to "non_radial" 
   - Set is_unplottable to true
   - Include the along_description (e.g., "along the centerline of said creek")
   - Include the distance if given
   - Set direction_text to the general direction if mentioned (e.g., "Northwesterly, Northeasterly, and Northerly")
   - Add unplottable_reason explaining why (e.g., "Meander line along creek - no bearing given, path is irregular")

10. UNPLOTTABLE CALLS - Mark is_unplottable: true for ANY call that has:
   - "more or less" in the distance — uncertain measurement
   - "along the creek/river/stream/branch" — meander line
   - "with its meanders" — irregular path
   - "following the high water mark" — changes over time
   - "along the shore/bank" — irregular natural feature
   - "Northwesterly" or similar without specific bearing — direction only, no bearing
   - "to an iron pin found" without bearing/distance — destination only
   - "along the line of [other tract/survey]" — requires reference document
   - Multiple direction changes in one call — "Northwesterly, Northeasterly, and Northerly"

For each STRAIGHT LINE call, extract:
- call_number: sequential number starting at 1
- call_type: "line"
- direction_text: the full bearing exactly as written (e.g., "North 45 degrees 30 minutes 15 seconds East")
- quadrant: "NE", "SE", "SW", or "NW"
- degrees: number
- minutes: number  
- seconds: number
- bearing_decimal: decimal degrees from North, clockwise (0-360)
- distance_feet: number in feet
- distance_qualifier: "more or less" or null
- monument: description of monument at end of call or null
- monument_condition: "found", "set", or null
- along_description: what the line runs along if mentioned or null
- is_unplottable: true if this call cannot be accurately plotted from record alone
- unplottable_reason: explanation of why it's unplottable (e.g., "Meander line - no specific bearing", "Distance is 'more or less'", "Multiple direction changes without bearings")

For each CURVE call, extract:
- call_number: sequential number
- call_type: "curve"
- curve_direction: "left" or "right" - IMPORTANT: Determine from these clues:
  * "curve to the right" = "right"
  * "curve to the left" = "left"  
  * "concave to the North/South/East/West" - determine left/right based on travel direction
  * "concave Northerly/Southerly/Easterly/Westerly" - same logic
  * If radial bearing is given, curve is perpendicular to radial
- concave_direction: "N", "S", "E", "W", "NE", "SE", "SW", "NW" if stated (e.g., "concave to the South" = "S", "concave to the Northwest" = "NW")
- radial_bearing_text: radial bearing if given (e.g., "radial bearing of N 5°44'55" W")
- radial_bearing_decimal: radial bearing in decimal degrees (0-360) if radial bearing is given
- radius: radius in feet
- arc_length: arc length in feet (the distance along the arc, often just called "distance" or "for a distance of X feet")
- chord_bearing_text: CRITICAL - Extract the chord bearing exactly as written (e.g., "S 55°58'42" W"). Look for phrases like "chord bearing of", "a chord bearing of", "chord bears"
- chord_quadrant: "NE", "SE", "SW", or "NW" for chord bearing - MUST extract this from chord_bearing_text
- chord_degrees: degrees portion of chord bearing - MUST extract this
- chord_minutes: minutes portion of chord bearing (EXACTLY as written, even if > 59)
- chord_seconds: seconds portion of chord bearing (may include decimals like 56.5)
- chord_bearing_decimal: chord bearing in decimal degrees from North clockwise (0-360)
- chord_distance: chord distance in feet - look for phrases like "for a distance of X feet" after chord bearing, or "chord distance of X feet"
- central_angle_degrees: central angle/delta degrees - look for "central angle of X°Y'Z""
- central_angle_minutes: central angle minutes
- central_angle_seconds: central angle seconds
- tangent_length: tangent length in feet (if given)
- monument: description of monument at end or null
- monument_condition: "found", "set", or null

CRITICAL for curves: Always extract chord_bearing_text, chord_quadrant, chord_degrees, chord_minutes, chord_seconds when present!
Example: "chord bearing of S 55°58'42" W for a distance of 700.00 feet" should give:
  chord_bearing_text: "S 55°58'42" W"
  chord_quadrant: "SW"
  chord_degrees: 55
  chord_minutes: 58
  chord_seconds: 42
  chord_distance: 700.00

Also extract:
- poc_description: Full description of Point of Commencement (if different from POB), or null if description starts directly at POB
- poc_reference: What the POC references (e.g., "NE corner of Section 12, Township 3 South, Range 5 East")
- tie_lines: Array of calls from POC to POB (these are NOT boundary lines), or empty array if no tie lines
  Each tie line has same structure as regular calls but with: is_tie_line: true
- parcels: array of parcel objects if multiple parcels exist, otherwise single parcel
  Each parcel has:
  - parcel_id: "1", "2", etc. or "main" if single parcel
  - parcel_name: any name given to the parcel
  - parcel_type: "boundary" (normal closing parcel), "centerline" (easement centerline that won't close), or "less_and_except" (parcel to subtract)
  - is_centerline: true if this describes a centerline/easement that won't close back to POB
  - easement_width: width in feet if this is an easement (e.g., "10 foot easement" = 10)
  - pob_description: full description of Point of Beginning
  - pob_reference: what the POB references
  - calls: array of all calls for this parcel
  - called_area_value: number if area is stated
  - called_area_unit: "acres" or "square feet" or null
  
- subdivision_info: {name, lot, block, city, county, state, plat_reference} or null
- total_parcels: number of parcels

SPECIAL CASES:
1. CENTERLINE DESCRIPTIONS: If the legal describes "the centerline of" an easement, road, or utility corridor, 
   set parcel_type: "centerline" and is_centerline: true. These don't close - they're linear.
2. LESS AND EXCEPT: If a parcel is described as "less and except" or "excepting therefrom", 
   set parcel_type: "less_and_except". This parcel should be subtracted from the main parcel.
3. TOGETHER WITH: Multiple parcels described with "together with" should be separate parcels that combine.

Return ONLY valid JSON with this structure:
{
  "poc_description": "string or null",
  "poc_reference": "string or null", 
  "tie_lines": [...] or [],
  "parcels": [
    {
      "parcel_id": "string",
      "parcel_name": "string or null",
      "parcel_type": "boundary" or "centerline" or "less_and_except",
      "is_centerline": boolean,
      "easement_width": number or null,
      "pob_description": "string",
      "pob_reference": "string or null",
      "calls": [...],
      "called_area_value": number or null,
      "called_area_unit": "string or null"
    }
  ],
  "subdivision_info": {...} or null,
  "total_parcels": number,
  "raw_text_cleaned": "the legal description text cleaned up"
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, imageBase64, imageType } = req.body;

    if (!text && !imageBase64) {
      return res.status(400).json({ error: 'No input provided' });
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    let content = [];
    
    // If image is provided, add it to the content
    if (imageBase64) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageType || "image/jpeg",
          data: imageBase64,
        },
      });
      content.push({
        type: "text",
        text: `${PARSER_PROMPT}\n\nPlease read the legal description from this image and parse it according to the instructions above.`,
      });
    } else {
      content.push({
        type: "text",
        text: `${PARSER_PROMPT}\n\nLegal Description:\n${text}`,
      });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: content,
        },
      ],
    });

    const aiResponse = message.content[0].text;
    
    // Clean up the response - remove markdown code blocks if present
    let cleanJson = aiResponse;
    if (cleanJson.includes('```json')) {
      cleanJson = cleanJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleanJson.includes('```')) {
      cleanJson = cleanJson.replace(/```\n?/g, '');
    }
    cleanJson = cleanJson.trim();

    const parsed = JSON.parse(cleanJson);

    // Calculate tie line coordinates if present
    let tieLineCoords = null;
    if (parsed.tie_lines && parsed.tie_lines.length > 0) {
      tieLineCoords = calculateCoordinates(parsed.tie_lines);
    }

    // Calculate coordinates and closure for each parcel
    const processedParcels = parsed.parcels.map(parcel => {
      // If there are tie lines, the POB starts at the end of tie lines
      // Otherwise POB is at 0,0
      const startCoord = tieLineCoords && tieLineCoords.length > 0 
        ? { x: tieLineCoords[tieLineCoords.length - 1].x, y: tieLineCoords[tieLineCoords.length - 1].y }
        : { x: 0, y: 0 };
      
      // POST-PROCESSING: Verify and fix ALL bearings (not just errors)
      // The AI sometimes returns wrong bearing_decimal values, so we recalculate from components
      const bearingErrors = [];
      parcel.calls?.forEach((call, idx) => {
        if (call.call_type === 'line' || call.call_type === 'non_radial') {
          // Check for minutes > 59
          if (call.minutes && call.minutes > 59) {
            const originalMinutes = call.minutes;
            call.minutes = call.minutes % 100;
            bearingErrors.push({ callIndex: idx, type: 'bearing', original: originalMinutes, fixed: call.minutes });
          }
          
          // ALWAYS recalculate bearing_decimal from components to ensure correctness
          if (call.quadrant && (call.degrees !== undefined || call.minutes !== undefined)) {
            const q = call.quadrant;
            const deg = call.degrees || 0;
            const min = call.minutes || 0;
            const sec = call.seconds || 0;
            const baseBearing = deg + (min / 60) + (sec / 3600);
            
            let newBearingDecimal;
            if (q === 'NE') newBearingDecimal = baseBearing;
            else if (q === 'SE') newBearingDecimal = 180 - baseBearing;
            else if (q === 'SW') newBearingDecimal = 180 + baseBearing;
            else if (q === 'NW') newBearingDecimal = 360 - baseBearing;
            
            // Log if there was a discrepancy
            if (call.bearing_decimal && Math.abs(call.bearing_decimal - newBearingDecimal) > 0.01) {
              console.warn(`Fixed bearing_decimal for call ${idx + 1}: ${call.bearing_decimal} → ${newBearingDecimal} (${q} ${deg}°${min}'${sec}")`);
            }
            
            call.bearing_decimal = newBearingDecimal;
          }
        }
        
        // Fix curve chord bearing - parse from text if needed
        if (call.call_type === 'curve') {
          console.log(`\n=== CURVE CALL ${idx + 1} ===`);
          console.log(`chord_bearing_text: "${call.chord_bearing_text}"`);
          console.log(`chord_minutes from AI: ${call.chord_minutes}`);
          console.log(`curve_direction: ${call.curve_direction}`);
          console.log(`radius: ${call.radius}`);
          
          // Default curve_direction if not set (most curves are to the right)
          if (!call.curve_direction) {
            call.curve_direction = 'right';
          }
          
          // First check if chord_bearing_text has an error
          if (call.chord_bearing_text) {
            // Normalize the text first - replace fancy quotes with standard ones
            const normalizedText = call.chord_bearing_text
              .replace(/[""″]/g, '"')
              .replace(/[''′]/g, "'")
              .replace(/\s+/g, ' ');
            
            console.log(`Normalized: "${normalizedText}"`);
            
            // Try multiple regex patterns to match different formats
            // Format: "N 39°906'26" E" or "N39°06'26"E" etc
            const patterns = [
              /([NS])\s*(\d+)[°d]\s*(\d+)[''']\s*(\d+)?["""]*\s*([EW])/i,
              /([NS])\s*(\d+)[°d](\d+)[''']\s*(\d+)?["""]*\s*([EW])/i,
              /([NS])(\d+)[°d](\d+)[''']\s*(\d+)?["""]*([EW])/i,
              /([NS])\s*(\d+)[°d]\s*(\d+)\s*[''']\s*(\d+)?\s*["""]*\s*([EW])/i,
            ];
            
            let match = null;
            for (let i = 0; i < patterns.length; i++) {
              match = normalizedText.match(patterns[i]);
              if (match) {
                console.log(`Pattern ${i+1} matched!`);
                break;
              }
            }
            
            if (match) {
              let parsedMinutes = parseInt(match[3]);
              const originalMinutes = parsedMinutes;
              console.log(`Parsed: dir=${match[1]}, deg=${match[2]}, min=${parsedMinutes}, sec=${match[4]}, dir2=${match[5]}`);
              
              // Fix minutes > 59
              if (parsedMinutes > 59) {
                parsedMinutes = parsedMinutes % 100;
                bearingErrors.push({ callIndex: idx, type: 'chord', original: originalMinutes, fixed: parsedMinutes });
                call.chord_bearing_text_original = call.chord_bearing_text;
                call.had_bearing_error = true;
                console.log(`\n!!! BEARING ERROR DETECTED !!! ${originalMinutes}' → ${parsedMinutes}'\n`);
              }
              
              // Update/set chord components
              call.chord_quadrant = match[1].toUpperCase() + match[5].toUpperCase();
              call.chord_degrees = parseInt(match[2]);
              call.chord_minutes = parsedMinutes;
              call.chord_seconds = parseInt(match[4] || 0);
            } else {
              console.warn(`!!! NO PATTERN MATCHED for: "${normalizedText}"`);
            }
          } else {
            console.log(`No chord_bearing_text - checking chord_minutes directly: ${call.chord_minutes}`);
            // Even without text, check if AI returned invalid minutes
            if (call.chord_minutes && call.chord_minutes > 59) {
              const originalMinutes = call.chord_minutes;
              call.chord_minutes = call.chord_minutes % 100;
              bearingErrors.push({ callIndex: idx, type: 'chord', original: originalMinutes, fixed: call.chord_minutes });
              call.had_bearing_error = true;
              console.log(`\n!!! BEARING ERROR (from chord_minutes) !!! ${originalMinutes}' → ${call.chord_minutes}'\n`);
            }
          }
          
          // ALWAYS recalculate chord_bearing_decimal from components
          if (call.chord_quadrant && (call.chord_degrees !== undefined || call.chord_minutes !== undefined)) {
            const q = call.chord_quadrant;
            const deg = call.chord_degrees || 0;
            const min = call.chord_minutes || 0;
            const sec = call.chord_seconds || 0;
            const baseBearing = deg + (min / 60) + (sec / 3600);
            
            let newChordBearingDecimal;
            if (q === 'NE') newChordBearingDecimal = baseBearing;
            else if (q === 'SE') newChordBearingDecimal = 180 - baseBearing;
            else if (q === 'SW') newChordBearingDecimal = 180 + baseBearing;
            else if (q === 'NW') newChordBearingDecimal = 360 - baseBearing;
            
            if (call.chord_bearing_decimal && Math.abs(call.chord_bearing_decimal - newChordBearingDecimal) > 0.01) {
              console.warn(`Fixed chord_bearing_decimal for call ${idx + 1}: ${call.chord_bearing_decimal} → ${newChordBearingDecimal}`);
            }
            
            call.chord_bearing_decimal = newChordBearingDecimal;
          }
        }
      });
      
      // Store bearing errors on parcel for frontend notification
      parcel.bearing_errors = bearingErrors;
      
      // Detect unplottable calls
      const unplottableCalls = detectUnplottableCalls(parcel.calls);
      const hasUnplottable = unplottableCalls.length > 0;
      
      // Calculate forward coordinates (normal direction)
      const coords = calculateCoordinates(parcel.calls, startCoord);
      
      // Calculate reverse coordinates (from POB going backwards)
      const reverseCoords = calculateCoordinatesReverse(parcel.calls, startCoord);
      
      // Find error zone by comparing forward and reverse
      const errorZone = findErrorZone(coords, reverseCoords, parcel.calls);
      
      const closure = calculateClosure(coords);
      const calculatedArea = calculateArea(coords);
      
      return {
        ...parcel,
        coordinates: coords,
        reverse_coordinates: reverseCoords,
        error_zone: errorZone,
        closure: closure,
        calculated_area_sqft: calculatedArea,
        calculated_area_acres: calculatedArea / 43560,
        area_discrepancy: parcel.called_area_value ? 
          calculateAreaDiscrepancy(parcel.called_area_value, parcel.called_area_unit, calculatedArea) : null,
        warnings: generateWarnings(parcel, closure, calculatedArea, errorZone),
        unplottable_calls: unplottableCalls,
        has_unplottable: hasUnplottable,
        requires_field_survey: hasUnplottable,
      };
    });

    // Generate combined coordinates if multiple parcels
    let combinedCoordinates = null;
    if (processedParcels.length > 1) {
      combinedCoordinates = generateCombinedCoordinates(processedParcels);
    }

    res.status(200).json({
      success: true,
      poc_description: parsed.poc_description,
      poc_reference: parsed.poc_reference,
      tie_lines: parsed.tie_lines || [],
      tie_line_coordinates: tieLineCoords,
      parcels: processedParcels,
      combined_coordinates: combinedCoordinates,
      total_parcels: parsed.total_parcels,
      subdivision_info: parsed.subdivision_info,
      raw_text_cleaned: parsed.raw_text_cleaned,
    });

  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ 
      error: 'Failed to parse description', 
      details: error.message 
    });
  }
}

function calculateCoordinates(calls, startPoint = { x: 0, y: 0 }) {
  if (!calls || calls.length === 0) return [];
  
  const coords = [{ x: startPoint.x, y: startPoint.y, n: startPoint.y, e: startPoint.x, label: 'POB', call: null }];
  let n = startPoint.y, e = startPoint.x;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    
    if (call.call_type === 'line' || call.call_type === 'non_radial') {
      const bearingRad = (call.bearing_decimal * Math.PI) / 180;
      const dist = call.distance_feet || 0;
      
      const dE = Math.sin(bearingRad) * dist;
      const dN = Math.cos(bearingRad) * dist;
      
      e += dE;
      n += dN;
      
      coords.push({
        x: e,
        y: n,
        n: Math.round(n * 1000) / 1000,
        e: Math.round(e * 1000) / 1000,
        label: `${i + 1}`,
        call: call,
        callIndex: i,
      });
    } else if (call.call_type === 'curve') {
      // Validate curve data - catch typos like "906 minutes" 
      let chordBearing = call.chord_bearing_decimal;
      let chordDist = call.chord_distance;
      
      // Check for invalid chord bearing (minutes > 60 suggests typo)
      if (call.chord_minutes && call.chord_minutes > 60) {
        // Try to fix common OCR errors like "906" should be "06"
        const fixedMinutes = call.chord_minutes % 100;
        if (fixedMinutes < 60) {
          // Recalculate bearing with fixed minutes
          const q = call.chord_quadrant || 'NE';
          let baseBearing = (call.chord_degrees || 0) + (fixedMinutes / 60) + ((call.chord_seconds || 0) / 3600);
          
          if (q === 'NE') chordBearing = baseBearing;
          else if (q === 'SE') chordBearing = 180 - baseBearing;
          else if (q === 'SW') chordBearing = 180 + baseBearing;
          else if (q === 'NW') chordBearing = 360 - baseBearing;
          
          console.warn(`Fixed curve chord bearing: ${call.chord_minutes}' → ${fixedMinutes}'`);
        }
      }
      
      // If no chord bearing but we have radial bearing, calculate chord bearing
      // Chord bearing is perpendicular to radial bearing
      if (!chordBearing && call.radial_bearing_decimal !== undefined && call.radial_bearing_decimal !== null) {
        console.log(`Calculating chord bearing from radial bearing: ${call.radial_bearing_decimal}`);
        
        // Chord bearing is 90° from radial bearing
        let radialBearing = call.radial_bearing_decimal;
        
        // For a curve, the chord is perpendicular to the radial line
        // The direction (+90 or -90) depends on curve direction
        if (call.curve_direction === 'left') {
          chordBearing = radialBearing - 90;
        } else {
          chordBearing = radialBearing + 90;
        }
        
        if (chordBearing < 0) chordBearing += 360;
        if (chordBearing >= 360) chordBearing -= 360;
        
        console.log(`Calculated chord bearing from radial: ${chordBearing}`);
        call.chord_bearing_decimal = chordBearing;
      }
      
      // If STILL no chord bearing, try to calculate from concave direction and previous bearing
      if (!chordBearing && call.concave_direction && i > 0) {
        console.log(`Calculating chord bearing from concave direction: ${call.concave_direction}`);
        
        // Get the previous call's ending bearing to determine travel direction
        const prevCall = calls[i - 1];
        let incomingBearing = prevCall.bearing_decimal || prevCall.chord_bearing_decimal || 0;
        console.log(`Previous call bearing: ${incomingBearing}`);
        
        // The chord bearing is roughly the average of incoming and outgoing tangent bearings
        // For small central angles, it's close to the incoming bearing
        const centralAngle = (call.central_angle_degrees || 0) + 
                            ((call.central_angle_minutes || 0) / 60) + 
                            ((call.central_angle_seconds || 0) / 3600);
        
        // Deflection is half the central angle
        const deflection = centralAngle / 2;
        console.log(`Central angle: ${centralAngle}°, deflection: ${deflection}°`);
        
        // Determine deflection direction from concave direction
        const concaveMap = { 'N': 0, 'NE': 45, 'E': 90, 'SE': 135, 'S': 180, 'SW': 225, 'W': 270, 'NW': 315 };
        const concaveAngle = concaveMap[call.concave_direction];
        
        if (concaveAngle !== undefined) {
          // Calculate angle from travel direction to concave direction
          let angleToConcave = concaveAngle - incomingBearing;
          if (angleToConcave < -180) angleToConcave += 360;
          if (angleToConcave > 180) angleToConcave -= 360;
          
          console.log(`Concave angle: ${concaveAngle}°, angle to concave: ${angleToConcave}°`);
          
          // If concave is to the right of travel (0 to 180), curve right, add deflection
          // If concave is to the left (-180 to 0), curve left, subtract deflection
          if (angleToConcave > 0 && angleToConcave < 180) {
            chordBearing = incomingBearing + deflection;
            call.curve_direction = 'right';
          } else {
            chordBearing = incomingBearing - deflection;
            call.curve_direction = 'left';
          }
          
          if (chordBearing < 0) chordBearing += 360;
          if (chordBearing >= 360) chordBearing -= 360;
          
          console.log(`Calculated chord bearing from concave: ${chordBearing}°, curve_direction: ${call.curve_direction}`);
          call.chord_bearing_decimal = chordBearing;
        }
      }
      
      // LAST RESORT: If still no chord bearing, use arc length direction from previous bearing
      if (!chordBearing && i > 0) {
        const prevCall = calls[i - 1];
        chordBearing = prevCall.bearing_decimal || prevCall.chord_bearing_decimal || 0;
        console.log(`LAST RESORT: Using previous bearing as chord bearing: ${chordBearing}°`);
        call.chord_bearing_decimal = chordBearing;
      }
      
      // SPECIAL CASE: If this is the LAST call and ends at POB, and we still have poor chord data,
      // calculate the chord bearing from current position to POB (0,0)
      const isLastCall = (i === calls.length - 1);
      if (isLastCall && !call.chord_bearing_decimal) {
        // The chord should go from current position back toward POB
        // We need to calculate what bearing gets us closest to (0,0)
        const distToPOB = Math.sqrt(e * e + n * n);
        if (distToPOB > 0.1) {
          // Calculate bearing from current position to POB
          const bearingToPOB = Math.atan2(-e, -n) * 180 / Math.PI;
          chordBearing = bearingToPOB < 0 ? bearingToPOB + 360 : bearingToPOB;
          console.log(`LAST CALL TO POB: Calculated chord bearing to POB: ${chordBearing}°`);
          call.chord_bearing_decimal = chordBearing;
        }
      }
      
      // If no chord distance but we have radius and central angle, calculate it
      // Chord = 2 * R * sin(delta/2)
      if (!chordDist && call.radius && (call.central_angle_degrees !== undefined || call.delta_degrees !== undefined)) {
        const centralAngleDeg = call.central_angle_degrees || call.delta_degrees || 0;
        const centralAngleMin = call.central_angle_minutes || call.delta_minutes || 0;
        const centralAngleSec = call.central_angle_seconds || call.delta_seconds || 0;
        
        const centralAngleDecimal = centralAngleDeg + (centralAngleMin / 60) + (centralAngleSec / 3600);
        const centralAngleRad = (centralAngleDecimal * Math.PI) / 180;
        
        chordDist = 2 * call.radius * Math.sin(centralAngleRad / 2);
        
        console.log(`Calculated chord distance: ${chordDist.toFixed(2)}' from R=${call.radius}, Δ=${centralAngleDecimal}°`);
        call.chord_distance = chordDist;
      }
      
      // Fall back to arc length if still no chord distance
      if (!chordDist) {
        chordDist = call.arc_length || 0;
      }
      
      // For curves, use chord bearing and chord distance for endpoint
      const chordBearingRad = (chordBearing * Math.PI) / 180;
      
      const dE = Math.sin(chordBearingRad) * chordDist;
      const dN = Math.cos(chordBearingRad) * chordDist;
      
      e += dE;
      n += dN;
      
      coords.push({
        x: e,
        y: n,
        n: Math.round(n * 1000) / 1000,
        e: Math.round(e * 1000) / 1000,
        label: `${i + 1}`,
        call: call,
        callIndex: i,
        isCurve: true,
        curveWarning: call.chord_minutes > 60 ? `Possible typo in chord bearing: ${call.chord_minutes} minutes` : null,
      });
    }
  }
  
  return coords;
}

// Calculate coordinates going BACKWARD from POB (reverse direction)
function calculateCoordinatesReverse(calls, startPoint = { x: 0, y: 0 }) {
  if (!calls || calls.length === 0) return [];
  
  // Start at POB
  const coords = [{ x: startPoint.x, y: startPoint.y, n: startPoint.y, e: startPoint.x, label: 'POB', call: null }];
  let n = startPoint.y, e = startPoint.x;

  // Go through calls in reverse order, with reversed bearings
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i];
    
    if (call.call_type === 'line' || call.call_type === 'non_radial') {
      // Reverse the bearing (add 180 degrees)
      const reversedBearing = (call.bearing_decimal + 180) % 360;
      const bearingRad = (reversedBearing * Math.PI) / 180;
      const dist = call.distance_feet || 0;
      
      const dE = Math.sin(bearingRad) * dist;
      const dN = Math.cos(bearingRad) * dist;
      
      e += dE;
      n += dN;
      
      coords.push({
        x: e,
        y: n,
        n: Math.round(n * 1000) / 1000,
        e: Math.round(e * 1000) / 1000,
        label: `${i + 1}R`,  // R for reverse
        call: call,
        callIndex: i,
        isReverse: true,
      });
    } else if (call.call_type === 'curve') {
      // Reverse curve - flip the chord bearing
      const reversedBearing = (call.chord_bearing_decimal + 180) % 360;
      const chordBearingRad = (reversedBearing * Math.PI) / 180;
      const chordDist = call.chord_distance || call.arc_length || 0;
      
      const dE = Math.sin(chordBearingRad) * chordDist;
      const dN = Math.cos(chordBearingRad) * chordDist;
      
      e += dE;
      n += dN;
      
      coords.push({
        x: e,
        y: n,
        n: Math.round(n * 1000) / 1000,
        e: Math.round(e * 1000) / 1000,
        label: `${i + 1}R`,
        call: call,
        callIndex: i,
        isCurve: true,
        isReverse: true,
      });
    }
  }
  
  return coords;
}

// Find where forward and reverse paths are closest (potential error zone)
function findErrorZone(forwardCoords, reverseCoords, calls) {
  if (forwardCoords.length < 2 || reverseCoords.length < 2) return null;
  
  // The last forward point and last reverse point should theoretically meet
  // (or be very close if description is accurate)
  
  // For each forward point, find the corresponding reverse point
  // Forward point i corresponds to reverse point (n - i) where n = total calls
  const totalCalls = calls?.length || (forwardCoords.length - 1);
  
  let maxGap = { distance: 0 };
  let gapDetails = [];
  
  for (let fIdx = 1; fIdx < forwardCoords.length; fIdx++) {
    // Forward point fIdx corresponds to after call fIdx
    // Reverse point that should match is at reverseCoords[totalCalls - fIdx + 1]
    const rIdx = totalCalls - fIdx + 1;
    
    if (rIdx > 0 && rIdx < reverseCoords.length) {
      const fCoord = forwardCoords[fIdx];
      const rCoord = reverseCoords[rIdx];
      
      const dx = rCoord.x - fCoord.x;
      const dy = rCoord.y - fCoord.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      gapDetails.push({
        forwardCallIndex: fIdx,
        reverseCallIndex: totalCalls - rIdx + 1,
        forwardCoord: fCoord,
        reverseCoord: rCoord,
        distance: dist,
        gapDx: dx,
        gapDy: dy,
      });
      
      if (dist > maxGap.distance) {
        maxGap = {
          forwardIndex: fIdx,
          reverseIndex: rIdx,
          forwardCoord: fCoord,
          reverseCoord: rCoord,
          distance: dist,
          forwardLabel: fCoord.label,
          reverseLabel: rCoord.label,
          // Calculate what bearing/distance would close this gap
          closingBearing: calculateBearing(fCoord, rCoord),
          closingDistance: dist,
        };
      }
    }
  }
  
  // Find the "problem zone" - where gap suddenly increases
  let problemZone = null;
  for (let i = 1; i < gapDetails.length; i++) {
    const prevGap = gapDetails[i - 1].distance;
    const currGap = gapDetails[i].distance;
    
    // If gap increases by more than 10 feet, this is likely the problem area
    if (currGap - prevGap > 10) {
      problemZone = {
        beforeCall: gapDetails[i - 1].forwardCallIndex,
        afterCall: gapDetails[i].forwardCallIndex,
        gapIncrease: currGap - prevGap,
      };
      break;
    }
  }
  
  return {
    largestGap: maxGap.distance > 1 ? maxGap : null,
    problemZone: problemZone,
    allGaps: gapDetails,
  };
}

// Calculate bearing from point A to point B
function calculateBearing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  
  // Calculate angle from north, clockwise
  let bearing = Math.atan2(dx, dy) * 180 / Math.PI;
  if (bearing < 0) bearing += 360;
  
  // Convert to surveyor's bearing (e.g., N45°30'15"E)
  let quadrant, degrees, minutes, seconds;
  
  if (bearing >= 0 && bearing < 90) {
    quadrant = 'NE';
    degrees = bearing;
  } else if (bearing >= 90 && bearing < 180) {
    quadrant = 'SE';
    degrees = 180 - bearing;
  } else if (bearing >= 180 && bearing < 270) {
    quadrant = 'SW';
    degrees = bearing - 180;
  } else {
    quadrant = 'NW';
    degrees = 360 - bearing;
  }
  
  const totalSeconds = degrees * 3600;
  const deg = Math.floor(totalSeconds / 3600);
  const min = Math.floor((totalSeconds % 3600) / 60);
  const sec = Math.round(totalSeconds % 60);
  
  return {
    decimal: bearing,
    quadrant: quadrant,
    degrees: deg,
    minutes: min,
    seconds: sec,
    formatted: `${quadrant.charAt(0)}${deg}°${min}'${sec}"${quadrant.charAt(1)}`,
  };
}

function calculateClosure(coords) {
  if (coords.length < 2) return null;
  
  const first = coords[0];
  const last = coords[coords.length - 1];
  
  // Calculate error from last point to first point
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const errorDist = Math.sqrt(dx * dx + dy * dy);
  
  let perimeter = 0;
  for (let i = 1; i < coords.length; i++) {
    const segDx = coords[i].x - coords[i-1].x;
    const segDy = coords[i].y - coords[i-1].y;
    perimeter += Math.sqrt(segDx * segDx + segDy * segDy);
  }
  
  const precision = errorDist > 0.001 ? Math.round(perimeter / errorDist) : Infinity;
  
  // Determine closure quality based on precision ratio
  // Survey standards: 1:5000 minimum for rural, 1:10000 for urban, 1:15000+ for ALTA
  let closure_quality;
  if (errorDist < 0.05 || precision >= 50000) closure_quality = "Excellent";
  else if (errorDist < 0.1 || precision >= 20000) closure_quality = "Very Good";
  else if (errorDist < 0.25 || precision >= 10000) closure_quality = "Good";
  else if (errorDist < 0.5 || precision >= 5000) closure_quality = "Acceptable";
  else if (errorDist < 1.0 || precision >= 2500) closure_quality = "Marginal";
  else closure_quality = "Poor";
  
  return {
    error_distance: Math.round(errorDist * 1000) / 1000,
    error_north: Math.round(dy * 1000) / 1000,
    error_east: Math.round(dx * 1000) / 1000,
    perimeter: Math.round(perimeter * 100) / 100,
    precision_ratio: precision === Infinity ? "Perfect" : `1:${precision.toLocaleString()}`,
    precision_value: precision,
    closes: errorDist < 1.0 || precision >= 2500,  // More lenient - 1.0' or 1:2500 or better
    closure_quality: closure_quality,
  };
}

function calculateArea(coords) {
  if (coords.length < 3) return 0;
  
  // Shoelace formula
  let area = 0;
  const n = coords.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i].x * coords[j].y;
    area -= coords[j].x * coords[i].y;
  }
  
  return Math.abs(area / 2);
}

function calculateAreaDiscrepancy(calledValue, calledUnit, calculatedSqFt) {
  let calledSqFt = calledValue;
  if (calledUnit === 'acres') {
    calledSqFt = calledValue * 43560;
  }
  
  const difference = Math.abs(calculatedSqFt - calledSqFt);
  const percentDiff = (difference / calledSqFt) * 100;
  
  return {
    called_sqft: calledSqFt,
    calculated_sqft: calculatedSqFt,
    difference_sqft: Math.round(difference * 100) / 100,
    percent_difference: Math.round(percentDiff * 100) / 100,
    significant: percentDiff > 2,
  };
}

function generateWarnings(parcel, closure, calculatedArea, errorZone = null) {
  const warnings = [];
  
  // Don't warn about closure for centerline descriptions - they're not supposed to close
  if (parcel.is_centerline || parcel.parcel_type === 'centerline') {
    warnings.push({
      type: 'info',
      severity: 'info',
      message: `This is a centerline description${parcel.easement_width ? ` (${parcel.easement_width}' easement)` : ''} - not expected to close`,
    });
  } else if (closure && !closure.closes) {
    warnings.push({
      type: 'closure',
      severity: closure.error_distance > 2 ? 'error' : 'warning',
      message: `Description does not close. Error: ${closure.error_distance} ft (${closure.precision_ratio})`,
    });
  }
  
  // Add error zone warning - but only if closure is poor
  // Don't show this warning if the parcel closes well (precision > 10000)
  if (errorZone && errorZone.largestGap && closure && closure.precision < 10000) {
    warnings.push({
      type: 'error_zone',
      severity: 'error',
      message: `Possible error between calls L${errorZone.largestGap.forwardIndex} and L${errorZone.largestGap.reverseIndex}. Gap: ${errorZone.largestGap.distance.toFixed(2)} ft`,
    });
  }
  
  if (parcel.called_area_value) {
    const calledSqFt = parcel.called_area_unit === 'acres' 
      ? parcel.called_area_value * 43560 
      : parcel.called_area_value;
    const percentDiff = Math.abs((calculatedArea - calledSqFt) / calledSqFt) * 100;
    
    if (percentDiff > 5) {
      warnings.push({
        type: 'area',
        severity: 'error',
        message: `Calculated area differs from called area by ${percentDiff.toFixed(1)}%`,
      });
    } else if (percentDiff > 2) {
      warnings.push({
        type: 'area',
        severity: 'warning',
        message: `Calculated area differs from called area by ${percentDiff.toFixed(1)}%`,
      });
    }
  }
  
  return warnings;
}

// Detect calls that cannot be plotted without field survey
function detectUnplottableCalls(calls) {
  if (!calls || calls.length === 0) return [];
  
  const unplottable = [];
  
  const meanderKeywords = [
    'creek', 'river', 'stream', 'branch', 'run', 'brook',
    'shore', 'shoreline', 'bank', 'waterline', 'water line',
    'lake', 'pond', 'meander', 'high water', 'low water',
    'tideline', 'tide line', 'ocean', 'sea', 'gulf', 'bay'
  ];
  
  const uncertainKeywords = [
    'more or less', 'approximately', 'about', 'roughly', 
    'estimated', 'uncertain', '±', 'plus or minus'
  ];
  
  const vagueDirKeywords = [
    'northerly', 'southerly', 'easterly', 'westerly',
    'northeasterly', 'northwesterly', 'southeasterly', 'southwesterly'
  ];
  
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const reasons = [];
    
    // Check if AI already marked it
    if (call.is_unplottable) {
      unplottable.push({
        call_number: call.call_number || i + 1,
        call_index: i,
        reason: call.unplottable_reason || 'Marked as unplottable',
        call_text: call.direction_text || call.along_description || 'Unknown',
        call_type: call.call_type,
      });
      continue;
    }
    
    const callText = (
      (call.direction_text || '') + ' ' + 
      (call.along_description || '') + ' ' +
      (call.distance_qualifier || '')
    ).toLowerCase();
    
    // Check for meander/water features
    for (const keyword of meanderKeywords) {
      if (callText.includes(keyword)) {
        reasons.push(`Meander line along ${keyword}`);
        break;
      }
    }
    
    // Check for "more or less" type language
    for (const keyword of uncertainKeywords) {
      if (callText.includes(keyword)) {
        reasons.push(`Distance is uncertain ("${keyword}")`);
        break;
      }
    }
    
    // Check for vague directions without specific bearing
    if (call.call_type === 'non_radial' || !call.bearing_decimal) {
      for (const keyword of vagueDirKeywords) {
        if (callText.includes(keyword)) {
          reasons.push(`Direction only ("${keyword}"), no specific bearing`);
          break;
        }
      }
    }
    
    // Check for multiple direction changes in one call
    let dirCount = 0;
    for (const dir of vagueDirKeywords) {
      if (callText.includes(dir)) dirCount++;
    }
    if (dirCount > 1) {
      reasons.push('Multiple direction changes in one call');
    }
    
    // If any reasons found, add to unplottable list
    if (reasons.length > 0) {
      unplottable.push({
        call_number: call.call_number || i + 1,
        call_index: i,
        reason: reasons.join('; '),
        call_text: call.direction_text || call.along_description || `Call ${i + 1}`,
        call_type: call.call_type,
      });
    }
  }
  
  return unplottable;
}

function generateCombinedCoordinates(parcels) {
  // Offset each parcel so they don't overlap when displayed together
  const combined = [];
  let offsetX = 0;
  
  for (const parcel of parcels) {
    // Find the bounding box of this parcel
    const xs = parcel.coordinates.map(c => c.x);
    const maxX = Math.max(...xs);
    const minX = Math.min(...xs);
    const width = maxX - minX;
    
    // Add offset coordinates
    const offsetCoords = parcel.coordinates.map(c => ({
      ...c,
      x: c.x + offsetX - minX,
      display_x: c.x + offsetX - minX,
      display_y: c.y,
      parcel_id: parcel.parcel_id,
    }));
    
    combined.push(...offsetCoords);
    offsetX += width + 50; // 50 ft gap between parcels
  }
  
  return combined;
}
