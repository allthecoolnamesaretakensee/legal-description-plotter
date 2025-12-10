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
   - Include the along_description (e.g., "along the centerline of said creek")
   - Include the distance if given
   - Set direction_text to the general direction if mentioned (e.g., "Northwesterly, Northeasterly, and Northerly")
   - For plotting purposes, you may need to estimate a bearing based on the general direction and context

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

For each CURVE call, extract:
- call_number: sequential number
- call_type: "curve"
- curve_direction: "left" or "right" (direction of curve)
- radius: radius in feet
- arc_length: arc length in feet (if given)
- chord_bearing_text: chord bearing as written
- chord_bearing_decimal: chord bearing in decimal degrees
- chord_distance: chord distance in feet
- delta_degrees: central angle degrees
- delta_minutes: central angle minutes
- delta_seconds: central angle seconds
- delta_decimal: central angle in decimal degrees
- monument: description of monument at end or null
- monument_condition: "found", "set", or null

Also extract:
- poc_description: Full description of Point of Commencement (if different from POB), or null if description starts directly at POB
- poc_reference: What the POC references (e.g., "NE corner of Section 12, Township 3 South, Range 5 East")
- tie_lines: Array of calls from POC to POB (these are NOT boundary lines), or empty array if no tie lines
  Each tie line has same structure as regular calls but with: is_tie_line: true
- parcels: array of parcel objects if multiple parcels exist, otherwise single parcel
  Each parcel has:
  - parcel_id: "1", "2", etc. or "main" if single parcel
  - parcel_name: any name given to the parcel
  - pob_description: full description of Point of Beginning
  - pob_reference: what the POB references
  - calls: array of all calls for this parcel
  - called_area_value: number if area is stated
  - called_area_unit: "acres" or "square feet" or null
  
- subdivision_info: {name, lot, block, city, county, state, plat_reference} or null
- total_parcels: number of parcels

Return ONLY valid JSON with this structure:
{
  "poc_description": "string or null",
  "poc_reference": "string or null", 
  "tie_lines": [...] or [],
  "parcels": [
    {
      "parcel_id": "string",
      "parcel_name": "string or null",
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
      
      // Calculate forward coordinates (normal direction)
      const coords = calculateCoordinates(parcel.calls, startCoord);
      
      // Calculate reverse coordinates (from POB going backwards)
      const reverseCoords = calculateCoordinatesReverse(parcel.calls, startCoord);
      
      // Find error zone by comparing forward and reverse
      const errorZone = findErrorZone(coords, reverseCoords);
      
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
      // For curves, use chord bearing and chord distance for endpoint
      const chordBearingRad = (call.chord_bearing_decimal * Math.PI) / 180;
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
        label: `${i + 1}`,
        call: call,
        callIndex: i,
        isCurve: true,
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
function findErrorZone(forwardCoords, reverseCoords) {
  if (forwardCoords.length < 2 || reverseCoords.length < 2) return null;
  
  let bestMatch = null;
  let minDistance = Infinity;
  
  // Skip POB (index 0) as it's the same point
  for (let f = 1; f < forwardCoords.length; f++) {
    for (let r = 1; r < reverseCoords.length; r++) {
      const fCoord = forwardCoords[f];
      const rCoord = reverseCoords[r];
      
      const dist = Math.sqrt(
        Math.pow(fCoord.x - rCoord.x, 2) + 
        Math.pow(fCoord.y - rCoord.y, 2)
      );
      
      // They should be the same point if forward call F meets reverse call R
      // Forward point F should match reverse point (total - F)
      const expectedReverseIndex = forwardCoords.length - f;
      
      if (dist < minDistance && r !== reverseCoords.length - 1) {
        minDistance = dist;
        bestMatch = {
          forwardIndex: f,
          reverseIndex: r,
          forwardCoord: fCoord,
          reverseCoord: rCoord,
          distance: dist,
          forwardCallIndex: fCoord.callIndex,
          reverseCallIndex: rCoord.callIndex,
        };
      }
    }
  }
  
  // Find the biggest gap between corresponding points
  let maxGap = { distance: 0 };
  for (let i = 1; i < Math.min(forwardCoords.length, reverseCoords.length); i++) {
    const fIdx = i;
    const rIdx = reverseCoords.length - i;
    
    if (rIdx > 0 && rIdx < reverseCoords.length) {
      const fCoord = forwardCoords[fIdx];
      const rCoord = reverseCoords[rIdx];
      
      const dist = Math.sqrt(
        Math.pow(fCoord.x - rCoord.x, 2) + 
        Math.pow(fCoord.y - rCoord.y, 2)
      );
      
      if (dist > maxGap.distance) {
        maxGap = {
          forwardIndex: fIdx,
          reverseIndex: rIdx,
          forwardCoord: fCoord,
          reverseCoord: rCoord,
          distance: dist,
          forwardLabel: fCoord.label,
          reverseLabel: rCoord.label,
        };
      }
    }
  }
  
  return {
    closestMatch: bestMatch,
    largestGap: maxGap.distance > 1 ? maxGap : null,  // Only report if gap > 1 foot
  };
}

function calculateClosure(coords) {
  if (coords.length < 2) return null;
  
  const last = coords[coords.length - 1];
  const errorDist = Math.sqrt(last.x ** 2 + last.y ** 2);
  
  let perimeter = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i].x - coords[i-1].x;
    const dy = coords[i].y - coords[i-1].y;
    perimeter += Math.sqrt(dx ** 2 + dy ** 2);
  }
  
  const precision = errorDist > 0.001 ? Math.round(perimeter / errorDist) : Infinity;
  
  return {
    error_distance: Math.round(errorDist * 1000) / 1000,
    error_north: Math.round(last.y * 1000) / 1000,
    error_east: Math.round(last.x * 1000) / 1000,
    perimeter: Math.round(perimeter * 100) / 100,
    precision_ratio: precision === Infinity ? "Perfect" : `1:${precision.toLocaleString()}`,
    closes: errorDist < 0.5,
    closure_quality: errorDist < 0.1 ? "Excellent" : errorDist < 0.5 ? "Good" : errorDist < 2 ? "Fair" : "Poor",
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
  
  if (closure && !closure.closes) {
    warnings.push({
      type: 'closure',
      severity: closure.error_distance > 2 ? 'error' : 'warning',
      message: `Description does not close. Error: ${closure.error_distance} ft (${closure.precision_ratio})`,
    });
  }
  
  // Add error zone warning
  if (errorZone && errorZone.largestGap) {
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
