// Fractional/Aliquot Legal Description Parser v3
// Handles LESS, EXCEPT, TOGETHER WITH with proper parcel separation

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { description, section_width = 5280, section_height = 5280 } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'No description provided' });
  }

  try {
    const result = parseFractionalDescription(description, section_width, section_height);
    res.status(200).json(result);
  } catch (error) {
    console.error('Fractional parse error:', error);
    res.status(500).json({ error: 'Failed to parse fractional description', details: error.message });
  }
}

function parseFractionalDescription(description, sectionWidth, sectionHeight) {
  const normalized = description
    .toUpperCase()
    .replace(/¼/g, '1/4')
    .replace(/½/g, '1/2')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('=== PARSING FRACTIONAL v3 ===');
  console.log('Input:', normalized);

  // Extract section info (applies to all parcels)
  const sectionMatch = normalized.match(/SECTION\s*(\d+)/i);
  const townshipMatch = normalized.match(/TOWNSHIP\s*(\d+)\s*(NORTH|SOUTH|N|S)?/i);
  const rangeMatch = normalized.match(/RANGE\s*(\d+)\s*(EAST|WEST|E|W)?/i);

  const sectionInfo = {
    section: sectionMatch ? parseInt(sectionMatch[1]) : null,
    township: townshipMatch ? parseInt(townshipMatch[1]) : null,
    township_dir: townshipMatch ? (townshipMatch[2] || '').charAt(0) : null,
    range: rangeMatch ? parseInt(rangeMatch[1]) : null,
    range_dir: rangeMatch ? (rangeMatch[2] || '').charAt(0) : null,
  };

  // STEP 1: Split by TOGETHER WITH to get separate parcels
  const parcelTexts = splitByTogetherWith(normalized);
  console.log('Split into', parcelTexts.length, 'parcels');

  // STEP 2: Parse each parcel
  const parcels = [];
  
  for (let i = 0; i < parcelTexts.length; i++) {
    console.log(`\n--- Parsing Parcel ${i + 1} ---`);
    console.log('Text:', parcelTexts[i]);
    
    const parcel = parseOneParcel(parcelTexts[i], sectionWidth, sectionHeight, sectionInfo, i + 1);
    parcels.push(parcel);
  }

  // Use first parcel as primary
  const primaryParcel = parcels[0];

  return {
    success: true,
    description_type: 'fractional',
    type: 'fractional',
    section_info: sectionInfo,
    section_dimensions: { width: sectionWidth, height: sectionHeight },
    subdivision_history: primaryParcel.subdivision_history,
    final_bounds: primaryParcel.bounds,
    coordinates: primaryParcel.coordinates,
    dimensions: primaryParcel.dimensions,
    area: primaryParcel.area,
    calls: primaryParcel.calls,
    less_outs: primaryParcel.less_outs,
    parcels: parcels.map(p => ({
      parcel_id: p.parcel_id,
      parcel_type: 'fractional',
      type: 'fractional',
      coordinates: p.coordinates,
      calls: p.calls,
      calculated_area_sqft: p.area.square_feet,
      calculated_area_acres: p.area.acres,
      closure: { closes: true, error_distance: 0, precision: 'Perfect', precision_ratio: 'Perfect' },
      warnings: p.warnings,
      less_outs: p.less_outs,
      subdivision_history: p.subdivision_history,
      dimensions: p.dimensions,
      bounds: p.bounds,
    })),
    total_parcels: parcels.length,
    raw_description: description,
    section_grid: {
      origin_x: 0,
      origin_y: 0,
      width: sectionWidth,
      height: sectionHeight,
    },
  };
}

function splitByTogetherWith(text) {
  // Split by "TOGETHER WITH" 
  const parts = text.split(/\s*,?\s*TOGETHER\s+WITH\s+(?:THE\s+)?/i);
  return parts.filter(p => p.trim().length > 0).map(p => p.trim());
}

function parseOneParcel(text, sectionWidth, sectionHeight, sectionInfo, parcelId) {
  console.log('Parsing parcel text:', text);
  
  // STEP 1: Split off LESS/EXCEPT clauses from the main description
  const { mainText, lessOuts } = extractLessExcept(text);
  console.log('Main text:', mainText);
  console.log('LESS outs:', lessOuts);

  // STEP 2: Extract all parts (quarters and strips) from main text
  const parts = extractFractionalParts(mainText);
  console.log('Extracted parts:', parts.map(p => p.original));

  // STEP 3: Apply divisions starting from full section
  let bounds = {
    minX: 0,
    minY: 0,
    maxX: sectionWidth,
    maxY: sectionHeight,
  };

  const subdivisionHistory = [{
    description: `Section ${sectionInfo.section || '?'}`,
    bounds: { ...bounds },
    width: sectionWidth,
    height: sectionHeight,
  }];

  // Apply each part in order (already reversed to correct order)
  for (const part of parts) {
    const prevBounds = { ...bounds };
    bounds = applyPart(bounds, part);
    
    subdivisionHistory.push({
      description: part.original,
      operation: part.type,
      bounds: { ...bounds },
      width: Math.round((bounds.maxX - bounds.minX) * 100) / 100,
      height: Math.round((bounds.maxY - bounds.minY) * 100) / 100,
    });
    
    console.log(`Applied ${part.original}: ${bounds.maxX - bounds.minX} x ${bounds.maxY - bounds.minY}`);
  }

  // STEP 4: Apply LESS/EXCEPT clauses (subtract from the result)
  for (const less of lessOuts) {
    const prevBounds = { ...bounds };
    bounds = applyLess(bounds, less);
    
    subdivisionHistory.push({
      description: `LESS ${less.direction} ${less.distance}'`,
      operation: 'less',
      bounds: { ...bounds },
      width: Math.round((bounds.maxX - bounds.minX) * 100) / 100,
      height: Math.round((bounds.maxY - bounds.minY) * 100) / 100,
    });
    
    console.log(`Applied LESS ${less.direction} ${less.distance}': ${bounds.maxX - bounds.minX} x ${bounds.maxY - bounds.minY}`);
  }

  // Calculate final coordinates and dimensions
  const coordinates = [
    { x: bounds.minX, y: bounds.minY, label: 'SW' },
    { x: bounds.minX, y: bounds.maxY, label: 'NW' },
    { x: bounds.maxX, y: bounds.maxY, label: 'NE' },
    { x: bounds.maxX, y: bounds.minY, label: 'SE' },
    { x: bounds.minX, y: bounds.minY, label: 'SW' },
  ];

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  return {
    parcel_id: parcelId,
    bounds,
    coordinates,
    dimensions: {
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
    },
    area: {
      square_feet: Math.round(width * height * 100) / 100,
      acres: Math.round((width * height / 43560) * 10000) / 10000,
    },
    calls: generateCalls(width, height),
    less_outs: lessOuts,
    warnings: [],
    subdivision_history,
  };
}

function extractLessExcept(text) {
  const lessOuts = [];
  let mainText = text;
  
  // Find all LESS/EXCEPT clauses with direction and distance
  const pattern = /,?\s*LESS\s+(?:AND\s+EXCEPT\s+)?(?:THE\s+)?((?:NORTH|SOUTH|EAST|WEST)\s+\d+\.?\d*)\s*(?:FEET|FT|')?\s*(?:THEREOF)?(?:\s+FOR\s+[^,]*)?/gi;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const dirDist = match[1].match(/(NORTH|SOUTH|EAST|WEST)\s+([\d.]+)/i);
    if (dirDist) {
      lessOuts.push({
        direction: dirDist[1].toUpperCase(),
        distance: parseFloat(dirDist[2]),
        fullText: match[0].trim(),
      });
      // Remove from main text
      mainText = mainText.replace(match[0], ' ');
    }
  }
  
  return { mainText: mainText.trim(), lessOuts };
}

function extractFractionalParts(text) {
  const parts = [];
  
  // Split by "OF THE" or "OF"
  const segments = text.split(/\s+OF\s+(?:THE\s+)?/i);
  
  // Skip patterns for location info
  const skipPattern = /^(SECTION|TOWNSHIP|RANGE|HILLSBOROUGH|POLK|PINELLAS|PASCO|COUNTY|FLORIDA)/i;
  
  for (const segment of segments) {
    if (!segment || typeof segment !== 'string') continue;
    
    const trimmed = segment.trim().replace(/^THE\s+/i, '');
    if (!trimmed || skipPattern.test(trimmed)) continue;
    
    console.log('Processing segment:', trimmed);
    
    // Check for fractional (NW 1/4, SOUTHEAST 1/4, W 1/2, etc.)
    const fracMatch = trimmed.match(/^(NORTHWEST|NORTHEAST|SOUTHWEST|SOUTHEAST|NW|NE|SW|SE|NORTH|SOUTH|EAST|WEST|N|S|E|W)\s*(1\/4|1\/2|QUARTER|HALF)/i);
    if (fracMatch) {
      let dir = normalizeDirection(fracMatch[1]);
      let frac = fracMatch[2].toUpperCase();
      if (frac === 'QUARTER') frac = '1/4';
      if (frac === 'HALF') frac = '1/2';
      
      parts.push({
        type: 'fraction',
        direction: dir,
        fraction: frac,
        denominator: frac === '1/4' ? 4 : 2,
        original: `${dir} ${frac}`,
      });
      continue;
    }
    
    // Check for strip (WEST 20 FEET, SOUTH 441 FEET, etc.)
    const stripMatch = trimmed.match(/^(NORTH|SOUTH|EAST|WEST)\s+(\d+\.?\d*)\s*(FEET|FT|')?/i);
    if (stripMatch && !trimmed.match(/\d\s*\/\s*[24]/)) {
      parts.push({
        type: 'strip',
        direction: stripMatch[1].toUpperCase(),
        distance: parseFloat(stripMatch[2]),
        original: `${stripMatch[1].toUpperCase()} ${stripMatch[2]}'`,
      });
      continue;
    }
  }
  
  // CRITICAL: Reverse the parts - aliquot reads right-to-left
  // "W 1/2 of SE 1/4 of NW 1/4" → process NW 1/4, then SE 1/4, then W 1/2
  console.log('Parts before reverse:', parts.map(p => p.original));
  const reversed = parts.reverse();
  console.log('Parts after reverse:', reversed.map(p => p.original));
  
  return reversed;
}

function normalizeDirection(dir) {
  const d = dir.toUpperCase();
  if (d === 'NORTHWEST') return 'NW';
  if (d === 'NORTHEAST') return 'NE';
  if (d === 'SOUTHWEST') return 'SW';
  if (d === 'SOUTHEAST') return 'SE';
  if (d === 'NORTH') return 'N';
  if (d === 'SOUTH') return 'S';
  if (d === 'EAST') return 'E';
  if (d === 'WEST') return 'W';
  return d;
}

function applyPart(bounds, part) {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  
  if (part.type === 'strip') {
    // Strip takes a fixed distance from one side
    const dir = part.direction;
    const dist = Math.min(part.distance, dir === 'NORTH' || dir === 'SOUTH' ? h : w);
    
    if (dir === 'NORTH') {
      return { minX: bounds.minX, minY: bounds.maxY - dist, maxX: bounds.maxX, maxY: bounds.maxY };
    } else if (dir === 'SOUTH') {
      return { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.minY + dist };
    } else if (dir === 'EAST') {
      return { minX: bounds.maxX - dist, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
    } else if (dir === 'WEST') {
      return { minX: bounds.minX, minY: bounds.minY, maxX: bounds.minX + dist, maxY: bounds.maxY };
    }
  }
  
  if (part.type === 'fraction') {
    const dir = part.direction;
    const denom = part.denominator;
    
    // Two-letter directions (NE, NW, SE, SW) - divide both dimensions by 2
    if (dir.length === 2) {
      const nw = w / 2, nh = h / 2;
      if (dir === 'NW') return { minX: bounds.minX, minY: bounds.minY + nh, maxX: bounds.minX + nw, maxY: bounds.maxY };
      if (dir === 'NE') return { minX: bounds.minX + nw, minY: bounds.minY + nh, maxX: bounds.maxX, maxY: bounds.maxY };
      if (dir === 'SW') return { minX: bounds.minX, minY: bounds.minY, maxX: bounds.minX + nw, maxY: bounds.minY + nh };
      if (dir === 'SE') return { minX: bounds.minX + nw, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.minY + nh };
    }
    
    // Single-letter directions - divide one dimension by denominator
    if (dir === 'N') return { minX: bounds.minX, minY: bounds.maxY - h/denom, maxX: bounds.maxX, maxY: bounds.maxY };
    if (dir === 'S') return { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.minY + h/denom };
    if (dir === 'E') return { minX: bounds.maxX - w/denom, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
    if (dir === 'W') return { minX: bounds.minX, minY: bounds.minY, maxX: bounds.minX + w/denom, maxY: bounds.maxY };
  }
  
  return bounds;
}

function applyLess(bounds, less) {
  const dir = less.direction;
  const dist = less.distance;
  
  // LESS subtracts from the specified side
  if (dir === 'SOUTH') {
    return { ...bounds, minY: Math.min(bounds.minY + dist, bounds.maxY) };
  } else if (dir === 'NORTH') {
    return { ...bounds, maxY: Math.max(bounds.maxY - dist, bounds.minY) };
  } else if (dir === 'EAST') {
    return { ...bounds, maxX: Math.max(bounds.maxX - dist, bounds.minX) };
  } else if (dir === 'WEST') {
    return { ...bounds, minX: Math.min(bounds.minX + dist, bounds.maxX) };
  }
  
  return bounds;
}

function generateCalls(width, height) {
  return [
    { call_number: 1, call_type: 'line', bearing_text: "N 0°00'00\" E", bearing_decimal: 0, distance_feet: height },
    { call_number: 2, call_type: 'line', bearing_text: "S 90°00'00\" E", bearing_decimal: 90, distance_feet: width },
    { call_number: 3, call_type: 'line', bearing_text: "S 0°00'00\" W", bearing_decimal: 180, distance_feet: height },
    { call_number: 4, call_type: 'line', bearing_text: "N 90°00'00\" W", bearing_decimal: 270, distance_feet: width },
  ];
}

export { parseFractionalDescription, extractFractionalParts };
