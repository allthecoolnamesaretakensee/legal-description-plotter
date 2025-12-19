import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
         AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType } from 'docx';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parcels, rawText, filename } = req.body;
    
    const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
    const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };
    
    const children = [];
    
    // Title
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "Legal Description Analysis", bold: true, size: 32 })]
      })
    );
    
    // Date
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString()}`, size: 20, color: "666666" })]
      })
    );
    
    // Raw Legal Description
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: "Legal Description", bold: true, size: 26 })]
      })
    );
    
    children.push(
      new Paragraph({
        spacing: { after: 300 },
        children: [new TextRun({ text: rawText || "No raw text provided", size: 22 })]
      })
    );
    
    // Process each parcel
    for (const parcel of parcels) {
      if (parcels.length > 1) {
        children.push(
          new Paragraph({
            spacing: { before: 400, after: 200 },
            children: [new TextRun({ text: `Parcel ${parcel.parcel_id}${parcel.parcel_name ? `: ${parcel.parcel_name}` : ''}`, bold: true, size: 28 })]
          })
        );
      }
      
      // POB
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: "Point of Beginning", bold: true, size: 24 })]
        })
      );
      
      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: parcel.pob_description || "Not specified", size: 22 })]
        })
      );
      
      // Line Calls Table
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: "Line Calls", bold: true, size: 24 })]
        })
      );
      
      const tableRows = [
        // Header row
        new TableRow({
          children: [
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, width: { size: 800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "#", bold: true, color: "FFFFFF", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, width: { size: 1000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Type", bold: true, color: "FFFFFF", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Direction", bold: true, color: "FFFFFF", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Distance", bold: true, color: "FFFFFF", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Curve Data", bold: true, color: "FFFFFF", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Monument", bold: true, color: "FFFFFF", size: 20 })] })] }),
          ]
        })
      ];
      
      // Data rows
      for (const call of parcel.calls || []) {
        let curveData = "-";
        if (call.call_type === "curve") {
          curveData = `R=${call.radius}' Δ=${call.delta_degrees}°${call.delta_minutes}'${call.delta_seconds}"`;
        }
        
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({ borders: cellBorders, width: { size: 800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: String(call.call_number), size: 20 })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: call.call_type === "curve" ? "Curve" : "Line", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: call.direction_text || call.chord_bearing_text || "-", size: 18 })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: `${call.distance_feet || call.arc_length || "-"} ft`, size: 20 })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 2500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: curveData, size: 18 })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: call.monument ? `${call.monument} (${call.monument_condition || 'n/a'})` : "-", size: 18 })] })] }),
            ]
          })
        );
      }
      
      children.push(
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );
      
      // Closure Information
      if (parcel.closure) {
        children.push(
          new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [new TextRun({ text: "Closure Analysis", bold: true, size: 24 })]
          })
        );
        
        const closureColor = parcel.closure.closes ? "228B22" : "CC0000";
        
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Status: ", bold: true, size: 22 }),
              new TextRun({ text: parcel.closure.closes ? "CLOSES" : "DOES NOT CLOSE", color: closureColor, bold: true, size: 22 })
            ]
          })
        );
        
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Error Distance: ${parcel.closure.error_distance} ft`, size: 22 })
            ]
          })
        );
        
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Precision Ratio: ${parcel.closure.precision_ratio}`, size: 22 })
            ]
          })
        );
        
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Perimeter: ${parcel.closure.perimeter} ft`, size: 22 })
            ]
          })
        );
      }
      
      // Area Information
      children.push(
        new Paragraph({
          spacing: { before: 300, after: 100 },
          children: [new TextRun({ text: "Area Analysis", bold: true, size: 24 })]
        })
      );
      
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Calculated Area: ${parcel.calculated_area_sqft?.toFixed(2) || 0} sq ft (${parcel.calculated_area_acres?.toFixed(4) || 0} acres)`, size: 22 })
          ]
        })
      );
      
      if (parcel.called_area_value) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Called Area: ${parcel.called_area_value} ${parcel.called_area_unit}`, size: 22 })
            ]
          })
        );
        
        if (parcel.area_discrepancy) {
          const discColor = parcel.area_discrepancy.significant ? "CC0000" : "228B22";
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `Difference: ${parcel.area_discrepancy.percent_difference}%`, color: discColor, size: 22 })
              ]
            })
          );
        }
      }
      
      // Warnings
      if (parcel.warnings && parcel.warnings.length > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 300, after: 100 },
            children: [new TextRun({ text: "Warnings", bold: true, size: 24, color: "CC0000" })]
          })
        );
        
        for (const warning of parcel.warnings) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `⚠ ${warning.message}`, color: warning.severity === 'error' ? "CC0000" : "FF8C00", size: 22 })
              ]
            })
          );
        }
      }
      
      // Coordinate Table
      children.push(
        new Paragraph({
          spacing: { before: 300, after: 100 },
          children: [new TextRun({ text: "Coordinates", bold: true, size: 24 })]
        })
      );
      
      const coordRows = [
        new TableRow({
          children: [
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "Point", bold: true, color: "FFFFFF", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "Northing", bold: true, color: "FFFFFF", size: 20 })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: "1B4F72", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "Easting", bold: true, color: "FFFFFF", size: 20 })] })] }),
          ]
        })
      ];
      
      for (const coord of parcel.coordinates || []) {
        coordRows.push(
          new TableRow({
            children: [
              new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: coord.label, size: 20 })] })] }),
              new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: String(coord.n), size: 20 })] })] }),
              new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: String(coord.e), size: 20 })] })] }),
            ]
          })
        );
      }
      
      children.push(
        new Table({
          rows: coordRows,
          width: { size: 50, type: WidthType.PERCENTAGE },
        })
      );
    }
    
    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
      },
      sections: [{
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: children,
      }]
    });
    
    const buffer = await Packer.toBuffer(doc);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'legal-description'}.docx"`);
    res.send(buffer);
    
  } catch (error) {
    console.error('Word generation error:', error);
    res.status(500).json({ error: 'Failed to generate Word document', details: error.message });
  }
}
