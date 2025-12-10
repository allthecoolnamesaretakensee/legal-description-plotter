export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parcels, combined, filename, tieLineCoordinates, tieLines } = req.body;
    
    let dxf = generateDXFHeader();
    dxf += generateDXFTables(parcels.length);
    dxf += '0\nSECTION\n2\nENTITIES\n';
    
    // Draw tie lines first if present
    if (tieLineCoordinates && tieLineCoordinates.length > 1) {
      dxf += generateTieLineEntities(tieLineCoordinates, tieLines);
    }
    
    if (combined && parcels.length > 1) {
      dxf += generateDXFEntities(parcels, true, tieLineCoordinates);
    } else {
      dxf += generateDXFEntities(parcels, false, tieLineCoordinates);
    }
    
    dxf += '0\nENDSEC\n0\nEOF\n';
    
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'legal-description'}.dxf"`);
    res.send(dxf);
    
  } catch (error) {
    console.error('DXF generation error:', error);
    res.status(500).json({ error: 'Failed to generate DXF', details: error.message });
  }
}

function generateDXFHeader() {
  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$DWGCODEPAGE
3
ANSI_1252
9
$INSBASE
10
0.0
20
0.0
30
0.0
9
$EXTMIN
10
-1000.0
20
-1000.0
30
0.0
9
$EXTMAX
10
10000.0
20
10000.0
30
0.0
9
$LIMMIN
10
0.0
20
0.0
9
$LIMMAX
10
10000.0
20
10000.0
9
$INSUNITS
70
1
9
$LUNITS
70
2
9
$LUPREC
70
4
0
ENDSEC
`;
}

function generateDXFTables(numParcels) {
  let tables = `0
SECTION
2
TABLES
0
TABLE
2
LTYPE
70
2
0
LTYPE
2
CONTINUOUS
70
0
3
Solid line
72
65
73
0
40
0.0
0
LTYPE
2
DASHED
70
0
3
Dashed line
72
65
73
2
40
0.5
49
0.25
49
-0.25
0
ENDTAB
0
TABLE
2
LAYER
70
20
`;

  // Add standard layers
  const layers = [
    { name: 'BOUNDARY', color: 7 },       // White
    { name: 'POINTS', color: 3 },          // Green
    { name: 'POB', color: 1 },             // Red
    { name: 'POC', color: 5 },             // Blue
    { name: 'TIE_LINE', color: 4 },        // Cyan
    { name: 'TEXT', color: 2 },            // Yellow
    { name: 'BEARING_TEXT', color: 6 },    // Magenta
    { name: 'CURVES', color: 5 },          // Blue
    { name: 'COORDINATES', color: 8 },     // Gray
  ];

  // Add parcel-specific layers if multiple parcels
  for (let i = 1; i <= numParcels; i++) {
    if (numParcels > 1) {
      layers.push({ name: `BOUNDARY_P${i}`, color: (i % 7) + 1 });
      layers.push({ name: `POINTS_P${i}`, color: 3 });
      layers.push({ name: `TEXT_P${i}`, color: 2 });
    }
  }

  for (const layer of layers) {
    tables += `0
LAYER
2
${layer.name}
70
0
62
${layer.color}
6
CONTINUOUS
`;
  }

  tables += `0
ENDTAB
0
TABLE
2
STYLE
70
1
0
STYLE
2
STANDARD
70
0
40
0.0
41
1.0
50
0.0
71
0
42
0.2
3
txt
4

0
ENDTAB
0
ENDSEC
`;

  return tables;
}

function generateTieLineEntities(tieCoords, tieLines) {
  let entities = '';
  
  // Draw POC marker
  if (tieCoords.length > 0) {
    const poc = tieCoords[0];
    entities += generateCircle(poc.x, poc.y, 3, 'POC');
    entities += generateText(poc.x + 5, poc.y + 5, 'POC', 'POC', 4);
  }
  
  // Draw tie lines as dashed
  for (let i = 0; i < tieCoords.length - 1; i++) {
    const curr = tieCoords[i];
    const next = tieCoords[i + 1];
    
    entities += generateLine(curr.x, curr.y, next.x, next.y, 'TIE_LINE');
    
    // Add bearing/distance label for tie line
    if (tieLines && tieLines[i]) {
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      const call = tieLines[i];
      const label = formatBearingDistance(call);
      entities += generateText(midX, midY + 3, label, 'TIE_LINE', 2);
    }
  }
  
  return entities;
}

function generateDXFEntities(parcels, combined, tieLineCoords) {
  let entities = '';
  let offsetX = 0;
  
  for (let p = 0; p < parcels.length; p++) {
    const parcel = parcels[p];
    const coords = parcel.coordinates;
    
    if (!coords || coords.length < 2) continue;
    
    // Calculate offset for combined view
    let parcelOffsetX = 0;
    if (combined && p > 0) {
      const prevParcel = parcels[p - 1];
      const prevXs = prevParcel.coordinates.map(c => c.x);
      const currXs = coords.map(c => c.x);
      const prevMax = Math.max(...prevXs);
      const currMin = Math.min(...currXs);
      offsetX += prevMax - currMin + 100;
      parcelOffsetX = offsetX;
    }
    
    const layerSuffix = parcels.length > 1 ? `_P${parcel.parcel_id}` : '';
    const boundaryLayer = parcels.length > 1 ? `BOUNDARY_P${parcel.parcel_id}` : 'BOUNDARY';
    
    // Draw boundary lines with bearing/distance labels
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      
      const x1 = curr.x + parcelOffsetX;
      const y1 = curr.y;
      const x2 = next.x + parcelOffsetX;
      const y2 = next.y;
      
      // Draw the line
      if (next.isCurve) {
        entities += generateLine(x1, y1, x2, y2, 'CURVES');
      } else {
        entities += generateLine(x1, y1, x2, y2, boundaryLayer);
      }
      
      // Add bearing and distance text along the line
      if (next.call) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        // Calculate angle of line for text rotation
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        
        // Format the bearing/distance label
        const label = formatBearingDistance(next.call);
        
        // Offset text slightly from line
        const perpAngle = (angle + 90) * Math.PI / 180;
        const textOffsetX = midX + Math.cos(perpAngle) * 3;
        const textOffsetY = midY + Math.sin(perpAngle) * 3;
        
        entities += generateTextWithRotation(textOffsetX, textOffsetY, label, 'BEARING_TEXT', 2, angle);
      }
    }
    
    // Close the polygon
    if (coords.length > 2) {
      const last = coords[coords.length - 1];
      const first = coords[0];
      entities += generateLine(
        last.x + parcelOffsetX, last.y,
        first.x + parcelOffsetX, first.y,
        boundaryLayer
      );
    }
    
    // Draw points
    for (let i = 0; i < coords.length; i++) {
      const coord = coords[i];
      const x = coord.x + parcelOffsetX;
      const y = coord.y;
      const label = i === 0 ? 'POB' : `${i}`;
      const layer = i === 0 ? 'POB' : 'POINTS';
      
      // Point marker (small circle)
      entities += generateCircle(x, y, i === 0 ? 2 : 1.5, layer);
      
      // Point label
      entities += generateText(x + 3, y + 3, label, 'TEXT', 3);
      
      // Coordinate annotation (smaller, below)
      const coordLabel = `(${coord.n.toFixed(2)}, ${coord.e.toFixed(2)})`;
      entities += generateText(x + 3, y - 4, coordLabel, 'COORDINATES', 1.5);
    }
  }
  
  return entities;
}

function formatBearingDistance(call) {
  if (call.call_type === 'curve') {
    return `C: R=${call.radius}' L=${call.arc_length || call.chord_distance}'`;
  }
  
  // Format bearing
  let bearing = '';
  if (call.direction_text) {
    // Try to create abbreviated version: N45°30'15"E
    const quadrant = call.quadrant || '';
    const deg = call.degrees || 0;
    const min = call.minutes || 0;
    const sec = call.seconds || 0;
    bearing = `${quadrant.charAt(0)}${deg}°${min}'${sec}"${quadrant.charAt(1) || ''}`;
  } else {
    bearing = call.direction_text || '';
  }
  
  const dist = call.distance_feet ? `${call.distance_feet.toFixed(2)}'` : '';
  
  return `${bearing} ${dist}`.trim();
}

function generateLine(x1, y1, x2, y2, layer) {
  return `0
LINE
8
${layer}
10
${x1.toFixed(4)}
20
${y1.toFixed(4)}
30
0.0
11
${x2.toFixed(4)}
21
${y2.toFixed(4)}
31
0.0
`;
}

function generateCircle(x, y, radius, layer) {
  return `0
CIRCLE
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
40
${radius.toFixed(4)}
`;
}

function generateText(x, y, text, layer, height) {
  return `0
TEXT
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
40
${height.toFixed(4)}
1
${text}
`;
}

function generateTextWithRotation(x, y, text, layer, height, rotation) {
  // Normalize rotation to keep text readable (not upside down)
  let rot = rotation;
  if (rot > 90 || rot < -90) {
    rot = rot + 180;
  }
  
  return `0
TEXT
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
30
0.0
40
${height.toFixed(4)}
50
${rot.toFixed(4)}
1
${text}
`; 
}
