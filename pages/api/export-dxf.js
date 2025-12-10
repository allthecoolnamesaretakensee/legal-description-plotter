export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parcels, combined, filename, tieLineCoordinates, tieLines } = req.body;
    
    // Build complete DXF with proper structure
    let dxf = '';
    
    // HEADER SECTION
    dxf += '0\nSECTION\n2\nHEADER\n';
    dxf += '9\n$ACADVER\n1\nAC1018\n';  // AutoCAD 2004 format
    dxf += '9\n$DWGCODEPAGE\n3\nANSI_1252\n';
    dxf += '9\n$INSBASE\n10\n0.0\n20\n0.0\n30\n0.0\n';
    dxf += '9\n$INSUNITS\n70\n1\n';  // Inches
    dxf += '9\n$LUNITS\n70\n2\n';     // Decimal
    dxf += '9\n$LUPREC\n70\n4\n';     // 4 decimal places
    dxf += '0\nENDSEC\n';
    
    // TABLES SECTION
    dxf += '0\nSECTION\n2\nTABLES\n';
    
    // LTYPE table
    dxf += '0\nTABLE\n2\nLTYPE\n70\n2\n';
    dxf += '0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n';
    dxf += '0\nLTYPE\n2\nDASHED\n70\n0\n3\nDashed\n72\n65\n73\n2\n40\n0.75\n49\n0.5\n49\n-0.25\n';
    dxf += '0\nENDTAB\n';
    
    // LAYER table
    dxf += '0\nTABLE\n2\nLAYER\n70\n10\n';
    dxf += '0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n';  // Default layer
    dxf += '0\nLAYER\n2\nBOUNDARY\n70\n0\n62\n7\n6\nCONTINUOUS\n';  // White
    dxf += '0\nLAYER\n2\nPOINTS\n70\n0\n62\n3\n6\nCONTINUOUS\n';    // Green
    dxf += '0\nLAYER\n2\nPOB\n70\n0\n62\n1\n6\nCONTINUOUS\n';       // Red
    dxf += '0\nLAYER\n2\nTIE_LINE\n70\n0\n62\n4\n6\nDASHED\n';      // Cyan
    dxf += '0\nLAYER\n2\nTEXT\n70\n0\n62\n2\n6\nCONTINUOUS\n';      // Yellow
    dxf += '0\nLAYER\n2\nLINE_LABELS\n70\n0\n62\n6\n6\nCONTINUOUS\n'; // Magenta
    dxf += '0\nLAYER\n2\nCURVES\n70\n0\n62\n5\n6\nCONTINUOUS\n';    // Blue
    dxf += '0\nENDTAB\n';
    
    // STYLE table (for text)
    dxf += '0\nTABLE\n2\nSTYLE\n70\n1\n';
    dxf += '0\nSTYLE\n2\nSTANDARD\n70\n0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n0\n42\n2.5\n3\ntxt\n4\n\n';
    dxf += '0\nENDTAB\n';
    
    dxf += '0\nENDSEC\n';
    
    // ENTITIES SECTION
    dxf += '0\nSECTION\n2\nENTITIES\n';
    
    // Draw tie lines if present
    if (tieLineCoordinates && tieLineCoordinates.length > 1) {
      for (let i = 0; i < tieLineCoordinates.length - 1; i++) {
        const curr = tieLineCoordinates[i];
        const next = tieLineCoordinates[i + 1];
        
        // Tie line
        dxf += `0\nLINE\n8\nTIE_LINE\n`;
        dxf += `10\n${curr.x.toFixed(4)}\n20\n${curr.y.toFixed(4)}\n30\n0.0\n`;
        dxf += `11\n${next.x.toFixed(4)}\n21\n${next.y.toFixed(4)}\n31\n0.0\n`;
        
        // Tie line label (T1, T2, etc.)
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        dxf += `0\nTEXT\n8\nLINE_LABELS\n`;
        dxf += `10\n${midX.toFixed(4)}\n20\n${midY.toFixed(4)}\n30\n0.0\n`;
        dxf += `40\n5.0\n1\nT${i + 1}\n`;
        
        // Also add bearing/distance as text
        if (tieLines && tieLines[i]) {
          const tie = tieLines[i];
          const bearingText = formatBearingText(tie);
          dxf += `0\nTEXT\n8\nTEXT\n`;
          dxf += `10\n${(midX + 5).toFixed(4)}\n20\n${(midY - 5).toFixed(4)}\n30\n0.0\n`;
          dxf += `40\n3.0\n1\n${bearingText}\n`;
        }
      }
      
      // POC marker
      const poc = tieLineCoordinates[0];
      dxf += `0\nCIRCLE\n8\nTIE_LINE\n`;
      dxf += `10\n${poc.x.toFixed(4)}\n20\n${poc.y.toFixed(4)}\n30\n0.0\n40\n3.0\n`;
      dxf += `0\nTEXT\n8\nTEXT\n`;
      dxf += `10\n${(poc.x + 5).toFixed(4)}\n20\n${(poc.y + 5).toFixed(4)}\n30\n0.0\n`;
      dxf += `40\n4.0\n1\nPOC\n`;
    }
    
    // Draw boundary parcels
    for (let p = 0; p < parcels.length; p++) {
      const parcel = parcels[p];
      const coords = parcel.coordinates;
      const calls = parcel.calls || [];
      
      if (!coords || coords.length < 2) continue;
      
      // Draw boundary lines
      for (let i = 0; i < coords.length - 1; i++) {
        const curr = coords[i];
        const next = coords[i + 1];
        
        const layer = next.isCurve ? 'CURVES' : 'BOUNDARY';
        
        // Line entity
        dxf += `0\nLINE\n8\n${layer}\n`;
        dxf += `10\n${curr.x.toFixed(4)}\n20\n${curr.y.toFixed(4)}\n30\n0.0\n`;
        dxf += `11\n${next.x.toFixed(4)}\n21\n${next.y.toFixed(4)}\n30\n0.0\n`;
        
        // Line label (L1, L2, etc.) at midpoint
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        
        dxf += `0\nTEXT\n8\nLINE_LABELS\n`;
        dxf += `10\n${midX.toFixed(4)}\n20\n${midY.toFixed(4)}\n30\n0.0\n`;
        dxf += `40\n5.0\n1\nL${i + 1}\n`;
        
        // Bearing and distance text (offset from line)
        if (calls[i]) {
          const call = calls[i];
          const bearingText = formatBearingText(call);
          const distText = `${call.distance_feet || call.arc_length || ''}'`;
          
          // Calculate perpendicular offset
          const dx = next.x - curr.x;
          const dy = next.y - curr.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          const perpX = -dy / len * 8;  // 8 units perpendicular offset
          const perpY = dx / len * 8;
          
          // Calculate text rotation to match line
          const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
          // Keep text readable (not upside down)
          const textRot = (rotation > 90 || rotation < -90) ? rotation + 180 : rotation;
          
          dxf += `0\nTEXT\n8\nTEXT\n`;
          dxf += `10\n${(midX + perpX).toFixed(4)}\n20\n${(midY + perpY).toFixed(4)}\n30\n0.0\n`;
          dxf += `40\n3.0\n50\n${textRot.toFixed(2)}\n1\n${bearingText} ${distText}\n`;
        }
      }
      
      // Close polygon (last to first)
      if (coords.length > 2) {
        const last = coords[coords.length - 1];
        const first = coords[0];
        dxf += `0\nLINE\n8\nBOUNDARY\n`;
        dxf += `10\n${last.x.toFixed(4)}\n20\n${last.y.toFixed(4)}\n30\n0.0\n`;
        dxf += `11\n${first.x.toFixed(4)}\n21\n${first.y.toFixed(4)}\n30\n0.0\n`;
      }
      
      // Draw point markers and labels
      for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];
        const layer = i === 0 ? 'POB' : 'POINTS';
        const radius = i === 0 ? 2.5 : 1.5;
        const label = i === 0 ? 'POB' : String(i);
        
        // Circle marker
        dxf += `0\nCIRCLE\n8\n${layer}\n`;
        dxf += `10\n${coord.x.toFixed(4)}\n20\n${coord.y.toFixed(4)}\n30\n0.0\n`;
        dxf += `40\n${radius.toFixed(4)}\n`;
        
        // Point label
        dxf += `0\nTEXT\n8\nTEXT\n`;
        dxf += `10\n${(coord.x + 4).toFixed(4)}\n20\n${(coord.y + 4).toFixed(4)}\n30\n0.0\n`;
        dxf += `40\n3.5\n1\n${label}\n`;
        
        // Coordinate annotation
        const coordText = `N:${coord.n.toFixed(2)} E:${coord.e.toFixed(2)}`;
        dxf += `0\nTEXT\n8\nTEXT\n`;
        dxf += `10\n${(coord.x + 4).toFixed(4)}\n20\n${(coord.y - 5).toFixed(4)}\n30\n0.0\n`;
        dxf += `40\n2.0\n1\n${coordText}\n`;
      }
    }
    
    // Add line table as MTEXT in corner
    let tableText = 'LINE TABLE:\\P';
    for (let p = 0; p < parcels.length; p++) {
      const parcel = parcels[p];
      const calls = parcel.calls || [];
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const bearing = formatBearingText(call);
        const dist = call.distance_feet || call.arc_length || '';
        tableText += `L${i + 1}: ${bearing} ${dist}'\\P`;
      }
    }
    
    // Find bounds for table placement
    const allX = parcels.flatMap(p => p.coordinates?.map(c => c.x) || []);
    const allY = parcels.flatMap(p => p.coordinates?.map(c => c.y) || []);
    const maxX = Math.max(...allX) + 50;
    const maxY = Math.max(...allY);
    
    dxf += `0\nMTEXT\n8\nTEXT\n`;
    dxf += `10\n${maxX.toFixed(4)}\n20\n${maxY.toFixed(4)}\n30\n0.0\n`;
    dxf += `40\n2.5\n41\n150.0\n71\n1\n`;
    dxf += `1\n${tableText}\n`;
    
    dxf += '0\nENDSEC\n';
    dxf += '0\nEOF\n';
    
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'legal-description'}.dxf"`);
    res.send(dxf);
    
  } catch (error) {
    console.error('DXF generation error:', error);
    res.status(500).json({ error: 'Failed to generate DXF', details: error.message });
  }
}

function formatBearingText(call) {
  if (!call) return '';
  
  if (call.call_type === 'curve') {
    return `C R=${call.radius}'`;
  }
  
  const q = call.quadrant || '';
  const d = call.degrees || 0;
  const m = call.minutes || 0;
  const s = call.seconds || 0;
  
  // Format: N45°30'15"E
  return `${q.charAt(0) || ''}${d}d${m}'${s}"${q.charAt(1) || ''}`;
}
