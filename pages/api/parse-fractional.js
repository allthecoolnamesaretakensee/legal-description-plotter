// Fractional/Aliquot Legal Description Parser
// Parses descriptions like "NW 1/4 of the SE 1/4 of Section 12"

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { description, section_width = 5280, section_height = 5280, section_corners = null } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'No description provided' });
  }

  try {
    const result = parseFractionalDescription(description, section_width, section_height, section_corners);
    res.status(200).json(result);
  } catch (error) {
    console.error('Fractional parse error:', error);
    res.status(500).json({ error: 'Failed to parse fractional description', details: error.message });
  }
}

function parseFractionalDescription(description, sectionWidth, sectionHeight, sectionCorners) {
  // Normalize the description
  const normalized = description
    .toUpperCase()
    .replace(/¼/g, '1/4')
    .replace(/½/g, '1/2')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('Parsing fractional:', normalized);

  // Extract LESS/EXCEPT/SUBJECT TO clauses BEFORE parsing aliquot parts
  const lessOuts = [];
  let cleanText = normalized;
  
  // Pattern to find LESS/EXCEPT clauses
  const lessPatterns = [
    /,?\s*LESS\s+(?:AND\s+EXCEPT\s+)?(?:THE\s+)?((?:NORTH|SOUTH|EAST|WEST)\s+[\d.]+\s*(?:FEET|FT|')?\s*(?:THEREOF|ALSO)?[^,]*)/gi,
    /,?\s*EXCEPT\s+(?:THE\s+)?((?:NORTH|SOUTH|EAST|WEST)\s+[\d.]+\s*(?:FEET|FT|')?[^,]*)/gi,
    /,?\s*SUBJECT\s+TO[^,]+((?:NORTH|SOUTH|EAST|WEST)\s+[\d.]+\s*(?:FEET|FT|')?)[^,]*/gi
  ];
  
  lessPatterns.forEach(pattern => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(normalized)) !== null) {
      const lessMatch = match[1]?.match(/(NORTH|SOUTH|EAST|WEST)\s+([\d.]+)/i);
      if (lessMatch) {
        lessOuts.push({
          direction: lessMatch[1].toUpperCase(),
          distance: parseFloat(lessMatch[2]),
          fullText: match[0].trim(),
          type: match[0].toLowerCase().includes('subject') ? 'subject_to' : 'less'
        });
      }
      // Remove from clean text to avoid parsing as aliquot
      cleanText = cleanText.replace(match[0], ' , ');
    }
  });
  
  console.log('Found LESS/EXCEPT clauses:', lessOuts);
  console.log('Clean text for parsing:', cleanText);

  // Extract section, township, range info
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

  // Start with full section bounds
  // Using coordinate system where (0,0) is SW corner, X increases East, Y increases North
  let bounds = {
    minX: 0,
    minY: 0,
    maxX: sectionWidth,
    maxY: sectionHeight,
  };

  // If section corners provided, use those instead
  if (sectionCorners) {
    // TODO: Handle non-rectangular sections with actual corner coordinates
    // For now, we'll use the simple rectangular approach
  }

  // Parse the fractional parts from CLEAN text (without LESS clauses)
  const parts = extractFractionalParts(cleanText);
  console.log('Extracted parts:', parts);

  // Track the subdivision history for display
  const subdivisionHistory = [{
    description: `Section ${sectionInfo.section || '?'}`,
    bounds: { ...bounds },
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    area_sqft: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY),
    area_acres: ((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)) / 43560,
  }];

  // Apply each fractional part (already in correct order from extraction)
  for (const part of parts) {
    const previousBounds = { ...bounds };
    bounds = applyFractionalPart(bounds, part);
    
    subdivisionHistory.push({
      description: part.original,
      operation: part.type,
      bounds: { ...bounds },
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      area_sqft: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY),
      area_acres: ((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)) / 43560,
    });
  }

  // Calculate final parcel coordinates (clockwise from SW corner)
  const coordinates = [
    { x: bounds.minX, y: bounds.minY, label: 'SW' },  // SW corner
    { x: bounds.minX, y: bounds.maxY, label: 'NW' },  // NW corner
    { x: bounds.maxX, y: bounds.maxY, label: 'NE' },  // NE corner
    { x: bounds.maxX, y: bounds.minY, label: 'SE' },  // SE corner
    { x: bounds.minX, y: bounds.minY, label: 'SW' },  // Close to SW
  ];

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const areaSqFt = width * height;
  const areaAcres = areaSqFt / 43560;

  // Generate calls for the boundary (for compatibility with existing plotter)
  const calls = [
    {
      call_number: 1,
      call_type: 'line',
      bearing_text: 'N 0°00\'00" E',
      bearing_decimal: 0,
      quadrant: 'NE',
      degrees: 0, minutes: 0, seconds: 0,
      distance_feet: height,
      description: 'West line',
    },
    {
      call_number: 2,
      call_type: 'line',
      bearing_text: 'N 90°00\'00" E',
      bearing_decimal: 90,
      quadrant: 'SE',
      degrees: 90, minutes: 0, seconds: 0,
      distance_feet: width,
      description: 'North line',
    },
    {
      call_number: 3,
      call_type: 'line',
      bearing_text: 'S 0°00\'00" E',
      bearing_decimal: 180,
      quadrant: 'SE',
      degrees: 0, minutes: 0, seconds: 0,
      distance_feet: height,
      description: 'East line',
    },
    {
      call_number: 4,
      call_type: 'line',
      bearing_text: 'S 90°00\'00" W',
      bearing_decimal: 270,
      quadrant: 'SW',
      degrees: 90, minutes: 0, seconds: 0,
      distance_feet: width,
      description: 'South line',
    },
  ];

  // Generate warnings for LESS/EXCEPT clauses
  const warnings = lessOuts.map(less => ({
    type: 'exclusion',
    message: `${less.type === 'subject_to' ? 'Subject to' : 'Less'} ${less.direction} ${less.distance}' - not plotted`,
    details: less.fullText
  }));

  return {
    success: true,
    type: 'fractional',
    section_info: sectionInfo,
    section_dimensions: {
      width: sectionWidth,
      height: sectionHeight,
    },
    subdivision_history: subdivisionHistory,
    final_bounds: bounds,
    coordinates: coordinates,
    dimensions: {
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
    },
    area: {
      square_feet: Math.round(areaSqFt * 100) / 100,
      acres: Math.round(areaAcres * 10000) / 10000,
    },
    calls: calls,
    less_outs: lessOuts,
    parcels: [{
      parcel_id: 1,
      type: 'fractional',
      coordinates: coordinates,
      calls: calls,
      calculated_area_sqft: areaSqFt,
      calculated_area_acres: areaAcres,
      closure: { closes: true, error_distance: 0, precision: 'Perfect', precision_ratio: 'Perfect' },
      warnings: warnings,
      less_outs: lessOuts,
    }],
    raw_description: description,
  };
}

function extractFractionalParts(normalized) {
  const parts = [];
  
  // Pattern for "of the" separators
  const parts_raw = normalized.split(/\s+OF\s+(THE\s+)?/i);
  
  console.log('Split parts:', parts_raw);
  
  // Process each part
  for (let i = 0; i < parts_raw.length; i++) {
    let part = parts_raw[i].trim();
    
    // Skip empty parts and section/location info
    if (!part || part.match(/^SECTION|^TOWNSHIP|^RANGE|^HILLSBOROUGH|^COUNTY|^FLORIDA|^PINELLAS|^PASCO/i)) {
      continue;
    }
    
    // Strip leading "THE " if present
    part = part.replace(/^THE\s+/i, '');
    
    console.log('Processing part:', part);
    
    // Check for strip FIRST (North 200 feet, West 300 feet, etc.)
    // Must have a number followed by feet/ft/'
    const stripMatch = part.match(/^(NORTH|SOUTH|EAST|WEST)\s+(\d+\.?\d*)\s*(FEET|FT|')?$/i) ||
                       part.match(/(NORTH|SOUTH|EAST|WEST)\s+(\d+\.?\d*)\s*(FEET|FT|')/i);
    if (stripMatch) {
      console.log('Found strip:', stripMatch[1], stripMatch[2]);
      parts.push({
        type: 'strip',
        direction: stripMatch[1].toUpperCase(),
        distance: parseFloat(stripMatch[2]),
        original: part,
      });
      continue;
    }
    
    // Check for fractional (NW 1/4, N 1/2, West Quarter, etc.)
    const fracMatch = part.match(/(NW|NE|SW|SE|N|S|E|W|NORTH|SOUTH|EAST|WEST)\s*(1\/4|1\/2|QUARTER|HALF)/i);
    if (fracMatch) {
      let direction = fracMatch[1].toUpperCase();
      let fraction = fracMatch[2].toUpperCase();
      
      // Normalize direction
      if (direction === 'NORTH') direction = 'N';
      if (direction === 'SOUTH') direction = 'S';
      if (direction === 'EAST') direction = 'E';
      if (direction === 'WEST') direction = 'W';
      
      // Normalize fraction
      if (fraction === 'QUARTER') fraction = '1/4';
      if (fraction === 'HALF') fraction = '1/2';
      
      console.log('Found quarter:', direction, fraction);
      parts.push({
        type: 'quarter',
        direction: direction,
        fraction: fraction,
        original: part,
      });
      continue;
    }
    
    console.log('Could not parse part:', part);
  }
  
  console.log('Extracted parts before reverse:', parts);
  
  // Reverse the parts - we read left to right but apply right to left
  // "North 200' of the West 1/4 of the NW 1/4 of the SE 1/4"
  // Should apply: SE 1/4 → NW 1/4 → West 1/4 → North 200'
  return parts.reverse();
}

function applyFractionalPart(bounds, part) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  
  if (part.type === 'strip') {
    // Strip: take a portion from one side
    switch (part.direction) {
      case 'NORTH':
        return {
          minX: bounds.minX,
          minY: bounds.maxY - part.distance,
          maxX: bounds.maxX,
          maxY: bounds.maxY,
        };
      case 'SOUTH':
        return {
          minX: bounds.minX,
          minY: bounds.minY,
          maxX: bounds.maxX,
          maxY: bounds.minY + part.distance,
        };
      case 'EAST':
        return {
          minX: bounds.maxX - part.distance,
          minY: bounds.minY,
          maxX: bounds.maxX,
          maxY: bounds.maxY,
        };
      case 'WEST':
        return {
          minX: bounds.minX,
          minY: bounds.minY,
          maxX: bounds.minX + part.distance,
          maxY: bounds.maxY,
        };
    }
  }
  
  if (part.type === 'quarter') {
    const isHalf = part.fraction === '1/2';
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    
    switch (part.direction) {
      // Single-direction divisions - N/S affect height, E/W affect width
      case 'N':
        // North half or quarter
        return {
          minX: bounds.minX,
          minY: isHalf ? bounds.minY + height / 2 : bounds.minY + (height * 3 / 4),
          maxX: bounds.maxX,
          maxY: bounds.maxY,
        };
      case 'S':
        // South half or quarter
        return {
          minX: bounds.minX,
          minY: bounds.minY,
          maxX: bounds.maxX,
          maxY: isHalf ? bounds.minY + height / 2 : bounds.minY + height / 4,
        };
      case 'E':
        // East half or quarter
        return {
          minX: isHalf ? bounds.minX + width / 2 : bounds.minX + (width * 3 / 4),
          minY: bounds.minY,
          maxX: bounds.maxX,
          maxY: bounds.maxY,
        };
      case 'W':
        // West half or quarter
        return {
          minX: bounds.minX,
          minY: bounds.minY,
          maxX: isHalf ? bounds.minX + width / 2 : bounds.minX + width / 4,
          maxY: bounds.maxY,
        };
      
      // Two-letter directions - always quarters (half of each dimension)
      case 'NE':
        return {
          minX: bounds.minX + width / 2,
          minY: bounds.minY + height / 2,
          maxX: bounds.maxX,
          maxY: bounds.maxY,
        };
      case 'NW':
        return {
          minX: bounds.minX,
          minY: bounds.minY + height / 2,
          maxX: bounds.minX + width / 2,
          maxY: bounds.maxY,
        };
      case 'SE':
        return {
          minX: bounds.minX + width / 2,
          minY: bounds.minY,
          maxX: bounds.maxX,
          maxY: bounds.minY + height / 2,
        };
      case 'SW':
        return {
          minX: bounds.minX,
          minY: bounds.minY,
          maxX: bounds.minX + width / 2,
          maxY: bounds.minY + height / 2,
        };
    }
  }
  
  // If we couldn't parse it, return unchanged
  console.warn('Could not apply fractional part:', part);
  return bounds;
}
