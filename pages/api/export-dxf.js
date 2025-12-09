export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parcels, combined, filename } = req.body;
    
    let dxf = generateDXFHeader();
    
    if (combined && parcels.length > 1) {
      // Generate combined view with all parcels
      dxf += generateDXFEntities(parcels, true);
    } else {
      // Generate single parcel or separate parcels
      dxf += generateDXFEntities(parcels, false);
    }
    
    dxf += generateDXFFooter();
    
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
AC1014
9
$INSUNITS
70
1
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
10
0
LAYER
2
BOUNDARY
70
0
62
7
6
CONTINUOUS
0
LAYER
2
POINTS
70
0
62
3
6
CONTINUOUS
0
LAYER
2
CURVES
70
0
62
5
6
CONTINUOUS
0
LAYER
2
TEXT
70
0
62
2
6
CONTINUOUS
0
LAYER
2
POB
70
0
62
1
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;
}

function generateDXFEntities(parcels, combined) {
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
      offsetX += prevMax - currMin + 100; // 100 unit gap
      parcelOffsetX = offsetX;
    }
    
    const layerSuffix = parcels.length > 1 ? `_P${parcel.parcel_id}` : '';
    
    // Draw boundary lines
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      
      const x1 = curr.x + parcelOffsetX;
      const y1 = curr.y;
      const x2 = next.x + parcelOffsetX;
      const y2 = next.y;
      
      if (next.isCurve) {
        // For curves, we'll draw as a line for now (proper arc would need more complex DXF)
        entities += generateLine(x1, y1, x2, y2, `CURVES${layerSuffix}`);
      } else {
        entities += generateLine(x1, y1, x2, y2, `BOUNDARY${layerSuffix}`);
      }
    }
    
    // Close the polygon (last point to POB)
    if (coords.length > 2) {
      const last = coords[coords.length - 1];
      const first = coords[0];
      entities += generateLine(
        last.x + parcelOffsetX, last.y,
        first.x + parcelOffsetX, first.y,
        `BOUNDARY${layerSuffix}`
      );
    }
    
    // Draw points and labels
    for (let i = 0; i < coords.length; i++) {
      const coord = coords[i];
      const x = coord.x + parcelOffsetX;
      const y = coord.y;
      const label = i === 0 ? 'POB' : `${i}`;
      const layer = i === 0 ? `POB${layerSuffix}` : `POINTS${layerSuffix}`;
      
      // Point marker
      entities += generatePoint(x, y, layer);
      
      // Label text
      entities += generateText(x + 2, y + 2, label, `TEXT${layerSuffix}`, 3);
      
      // Coordinate label (smaller, offset)
      const coordLabel = `N:${coord.n.toFixed(2)} E:${coord.e.toFixed(2)}`;
      entities += generateText(x + 2, y - 3, coordLabel, `TEXT${layerSuffix}`, 1.5);
    }
    
    // Add bearing and distance labels on lines
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      
      if (next.call) {
        const midX = (curr.x + next.x) / 2 + parcelOffsetX;
        const midY = (curr.y + next.y) / 2;
        
        let label = '';
        if (next.call.call_type === 'curve') {
          label = `C${next.call.call_number}: R=${next.call.radius}' A=${next.call.arc_length}'`;
        } else {
          label = `${next.call.direction_text} ${next.call.distance_feet}'`;
        }
        
        entities += generateText(midX, midY + 3, label, `TEXT${layerSuffix}`, 2);
      }
    }
  }
  
  return entities;
}

function generateLine(x1, y1, x2, y2, layer) {
  return `0
LINE
8
${layer}
10
${x1.toFixed(6)}
20
${y1.toFixed(6)}
30
0.0
11
${x2.toFixed(6)}
21
${y2.toFixed(6)}
31
0.0
`;
}

function generatePoint(x, y, layer) {
  return `0
POINT
8
${layer}
10
${x.toFixed(6)}
20
${y.toFixed(6)}
30
0.0
`;
}

function generateText(x, y, text, layer, height) {
  return `0
TEXT
8
${layer}
10
${x.toFixed(6)}
20
${y.toFixed(6)}
30
0.0
40
${height}
1
${text}
`;
}

function generateDXFFooter() {
  return `0
ENDSEC
0
EOF
`;
}
