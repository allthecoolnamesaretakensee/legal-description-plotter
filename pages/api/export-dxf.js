export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parcels, combined, filename, tieLineCoordinates, tieLines } = req.body;
    
    // Build a simple, compatible DXF (R12 format - most compatible)
    const lines = [];
    
    // Minimal header
    lines.push('0', 'SECTION', '2', 'HEADER');
    lines.push('9', '$ACADVER', '1', 'AC1009');  // R12 format - most compatible
    lines.push('9', '$INSUNITS', '70', '1');     // Feet
    lines.push('0', 'ENDSEC');
    
    // Tables section with layers
    lines.push('0', 'SECTION', '2', 'TABLES');
    
    // Line type table
    lines.push('0', 'TABLE', '2', 'LTYPE', '70', '1');
    lines.push('0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid', '72', '65', '73', '0', '40', '0.0');
    lines.push('0', 'ENDTAB');
    
    // Layer table
    lines.push('0', 'TABLE', '2', 'LAYER', '70', '6');
    lines.push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
    lines.push('0', 'LAYER', '2', 'BOUNDARY', '70', '0', '62', '7', '6', 'CONTINUOUS');
    lines.push('0', 'LAYER', '2', 'POINTS', '70', '0', '62', '3', '6', 'CONTINUOUS');
    lines.push('0', 'LAYER', '2', 'POB', '70', '0', '62', '1', '6', 'CONTINUOUS');
    lines.push('0', 'LAYER', '2', 'TIE_LINE', '70', '0', '62', '4', '6', 'CONTINUOUS');
    lines.push('0', 'LAYER', '2', 'TEXT', '70', '0', '62', '2', '6', 'CONTINUOUS');
    lines.push('0', 'ENDTAB');
    
    // Style table
    lines.push('0', 'TABLE', '2', 'STYLE', '70', '1');
    lines.push('0', 'STYLE', '2', 'STANDARD', '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '3.0', '3', 'txt', '4', '');
    lines.push('0', 'ENDTAB');
    
    lines.push('0', 'ENDSEC');
    
    // Entities section
    lines.push('0', 'SECTION', '2', 'ENTITIES');
    
    // Draw tie lines if present
    if (tieLineCoordinates && tieLineCoordinates.length > 1) {
      for (let i = 0; i < tieLineCoordinates.length - 1; i++) {
        const curr = tieLineCoordinates[i];
        const next = tieLineCoordinates[i + 1];
        
        // Line entity
        addLine(lines, curr.x, curr.y, next.x, next.y, 'TIE_LINE');
        
        // Label at midpoint
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        addText(lines, midX, midY + 3, `T${i + 1}`, 'TEXT', 4);
      }
      
      // POC marker
      if (tieLineCoordinates.length > 0) {
        const poc = tieLineCoordinates[0];
        addCircle(lines, poc.x, poc.y, 3, 'TIE_LINE');
        addText(lines, poc.x + 5, poc.y + 5, 'POC', 'TEXT', 4);
      }
    }
    
    // Draw parcels
    for (let p = 0; p < parcels.length; p++) {
      const parcel = parcels[p];
      const coords = parcel.coordinates;
      const calls = parcel.calls || [];
      
      if (!coords || coords.length < 2) continue;
      
      // Draw boundary lines
      for (let i = 0; i < coords.length - 1; i++) {
        const curr = coords[i];
        const next = coords[i + 1];
        
        // Line
        addLine(lines, curr.x, curr.y, next.x, next.y, 'BOUNDARY');
        
        // Calculate midpoint and perpendicular offset for text
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        const dx = next.x - curr.x;
        const dy = next.y - curr.y;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        
        // Perpendicular offset (alternate sides to reduce overlap)
        const offsetDir = (i % 2 === 0) ? 1 : -1;
        const offsetDist = 20; // Distance from line
        const perpX = (-dy / len) * offsetDist * offsetDir;
        const perpY = (dx / len) * offsetDist * offsetDir;
        
        const textX = midX + perpX;
        const textY = midY + perpY;
        
        // Leader line from midpoint to text
        addLine(lines, midX, midY, textX, textY, 'TEXT');
        
        // Line label
        addText(lines, textX, textY + 4, `L${i + 1}`, 'TEXT', 4);
        
        // Bearing/distance if available
        if (calls[i]) {
          const call = calls[i];
          const bearing = formatBearing(call);
          const dist = call.distance_feet || call.arc_length || call.chord_distance || 0;
          
          // Stack text: bearing on one line, distance below
          addText(lines, textX, textY, bearing, 'TEXT', 3);
          addText(lines, textX, textY - 4, `${dist.toFixed(2)}'`, 'TEXT', 3);
        }
      }
      
      // Close polygon
      if (coords.length > 2) {
        const last = coords[coords.length - 1];
        const first = coords[0];
        addLine(lines, last.x, last.y, first.x, first.y, 'BOUNDARY');
      }
      
      // Point markers
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        const layer = i === 0 ? 'POB' : 'POINTS';
        const radius = i === 0 ? 3 : 1.5;
        const label = i === 0 ? 'POB' : String(i);
        
        addCircle(lines, c.x, c.y, radius, layer);
        addText(lines, c.x + 5, c.y + 5, label, 'TEXT', 3);
      }
    }
    
    lines.push('0', 'ENDSEC');
    lines.push('0', 'EOF');
    
    const dxfContent = lines.join('\n');
    
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'legal-plot'}.dxf"`);
    res.send(dxfContent);
    
  } catch (error) {
    console.error('DXF generation error:', error);
    res.status(500).json({ error: 'Failed to generate DXF', details: error.message });
  }
}

function addLine(lines, x1, y1, x2, y2, layer) {
  lines.push('0', 'LINE');
  lines.push('8', layer);
  lines.push('10', x1.toFixed(4));
  lines.push('20', y1.toFixed(4));
  lines.push('30', '0.0');
  lines.push('11', x2.toFixed(4));
  lines.push('21', y2.toFixed(4));
  lines.push('31', '0.0');
}

function addCircle(lines, x, y, radius, layer) {
  lines.push('0', 'CIRCLE');
  lines.push('8', layer);
  lines.push('10', x.toFixed(4));
  lines.push('20', y.toFixed(4));
  lines.push('30', '0.0');
  lines.push('40', radius.toFixed(4));
}

function addText(lines, x, y, text, layer, height) {
  lines.push('0', 'TEXT');
  lines.push('8', layer);
  lines.push('10', x.toFixed(4));
  lines.push('20', y.toFixed(4));
  lines.push('30', '0.0');
  lines.push('40', height.toFixed(2));
  lines.push('1', text);
}

function formatBearing(call) {
  if (!call) return '';
  
  if (call.call_type === 'curve') {
    return `R=${call.radius || '?'}'`;
  }
  
  const q = call.quadrant || '';
  const d = call.degrees || 0;
  const m = call.minutes || 0;
  const s = call.seconds || 0;
  
  return `${q.charAt(0) || ''}${d}°${m}'${s}"${q.charAt(1) || ''}`;
}
