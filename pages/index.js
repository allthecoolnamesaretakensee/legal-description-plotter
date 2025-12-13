import { useState, useRef } from 'react';
import Head from 'next/head';

export default function Home() {
  const [inputType, setInputType] = useState('text');
  const [textInput, setTextInput] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [imageType, setImageType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('input');
  const [activeParcel, setActiveParcel] = useState(0);
  const [showCombined, setShowCombined] = useState(false);
  const [showDetailedLabels, setShowDetailedLabels] = useState(false);
  const [bearingErrors, setBearingErrors] = useState([]);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [currentErrorIndex, setCurrentErrorIndex] = useState(0);
  const fileInputRef = useRef(null);
  const plotRef = useRef(null);

  // Download plot as PNG image
  const downloadPlotImage = async () => {
    const svgElement = plotRef.current?.querySelector('svg');
    if (!svgElement) {
      alert('No plot to download');
      return;
    }

    try {
      // Clone the SVG to modify it
      const clonedSvg = svgElement.cloneNode(true);
      
      // Get the viewBox dimensions
      const viewBox = svgElement.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 700, 550];
      const svgWidth = viewBox[2];
      const svgHeight = viewBox[3];
      
      // Set explicit dimensions on cloned SVG
      clonedSvg.setAttribute('width', svgWidth);
      clonedSvg.setAttribute('height', svgHeight);
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      
      // Add background rect
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', '#030712');
      clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
      
      // Serialize SVG
      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      // Create canvas at 2x resolution
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = 2;
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;
      
      const img = new Image();
      
      img.onload = () => {
        // Fill background
        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw SVG scaled up
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Download
        const link = document.createElement('a');
        link.download = `legal-plot-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        URL.revokeObjectURL(svgUrl);
      };
      
      img.onerror = (e) => {
        console.error('Error loading SVG image:', e);
        // Fallback: download SVG directly
        const link = document.createElement('a');
        link.download = `legal-plot-${Date.now()}.svg`;
        link.href = svgUrl;
        link.click();
      };

      img.src = svgUrl;
    } catch (err) {
      console.error('Error downloading image:', err);
      alert('Failed to download image. Try right-clicking the plot to save.');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result.split(',')[1];
      setImageData(base64);
      setImagePreview(event.target.result);
      
      // Determine image type
      if (file.type === 'application/pdf') {
        setImageType('application/pdf');
      } else if (file.type.startsWith('image/')) {
        setImageType(file.type);
      } else {
        setImageType('image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleParse = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputType === 'text' ? textInput : null,
          imageBase64: inputType === 'image' ? imageData : null,
          imageType: imageType,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse');
      }

      setResult(data);
      setActiveTab('results');
      setActiveParcel(0);
      
      // Check for bearing errors (like 906 minutes)
      const errors = [];
      data.parcels?.forEach((parcel, pIdx) => {
        parcel.calls?.forEach((call, cIdx) => {
          // Check regular bearing
          if (call.minutes && call.minutes > 59) {
            errors.push({
              parcelIndex: pIdx,
              callIndex: cIdx,
              callNumber: call.call_number || cIdx + 1,
              type: 'bearing',
              field: 'minutes',
              found: `${call.quadrant?.charAt(0) || ''}${call.degrees}°${call.minutes}'${call.seconds || 0}"${call.quadrant?.charAt(1) || ''}`,
              invalidValue: call.minutes,
              suggestions: [
                { label: `${call.quadrant?.charAt(0) || ''}${call.degrees}°${call.minutes % 100}'${call.seconds || 0}"${call.quadrant?.charAt(1) || ''}`, reason: 'remove leading digit' },
              ]
            });
          }
          // Check curve chord bearing
          if (call.call_type === 'curve' && call.chord_minutes && call.chord_minutes > 59) {
            errors.push({
              parcelIndex: pIdx,
              callIndex: cIdx,
              callNumber: call.call_number || cIdx + 1,
              type: 'curve_chord',
              field: 'chord_minutes',
              found: `${call.chord_quadrant?.charAt(0) || 'N'}${call.chord_degrees}°${call.chord_minutes}'${call.chord_seconds || 0}"${call.chord_quadrant?.charAt(1) || 'E'}`,
              invalidValue: call.chord_minutes,
              suggestions: [
                { label: `${call.chord_quadrant?.charAt(0) || 'N'}${call.chord_degrees}°${call.chord_minutes % 100}'${call.chord_seconds || 0}"${call.chord_quadrant?.charAt(1) || 'E'}`, reason: 'remove leading digit' },
              ]
            });
          }
        });
      });
      
      if (errors.length > 0) {
        setBearingErrors(errors);
        setCurrentErrorIndex(0);
        setShowErrorModal(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportDXF = async (combined = false) => {
    try {
      const response = await fetch('/api/export-dxf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcels: result.parcels,
          combined: combined,
          filename: 'legal-description',
          tieLineCoordinates: result.tie_line_coordinates,
          tieLines: result.tie_lines,
        }),
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `legal-description${combined ? '-combined' : ''}.dxf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export DXF: ' + err.message);
    }
  };

  const handleExportWord = async () => {
    try {
      const response = await fetch('/api/export-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcels: result.parcels,
          rawText: result.raw_text_cleaned,
          filename: 'legal-description',
        }),
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'legal-description.docx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export Word: ' + err.message);
    }
  };

  const handleExportCSV = () => {
    if (!result) return;
    
    let csv = 'Parcel,Call #,Type,Direction,Distance (ft),Radius,Arc Length,Delta,Monument,Condition\n';
    
    for (const parcel of result.parcels) {
      for (const call of parcel.calls || []) {
        csv += `"${parcel.parcel_id}",`;
        csv += `${call.call_number},`;
        csv += `"${call.call_type}",`;
        csv += `"${call.direction_text || call.chord_bearing_text || ''}",`;
        csv += `${call.distance_feet || call.chord_distance || ''},`;
        csv += `${call.radius || ''},`;
        csv += `${call.arc_length || ''},`;
        csv += `"${call.delta_degrees ? `${call.delta_degrees}°${call.delta_minutes}'${call.delta_seconds}"` : ''}",`;
        csv += `"${call.monument || ''}",`;
        csv += `"${call.monument_condition || ''}"\n`;
      }
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'legal-description-calls.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = () => {
    if (result?.raw_text_cleaned) {
      navigator.clipboard.writeText(result.raw_text_cleaned);
    }
  };

  const [showReverse, setShowReverse] = useState(false);

  const PlotView = ({ parcel, showCombinedView, allParcels }) => {
    const coords = showCombinedView ? 
      (result.combined_coordinates || parcel.coordinates) : 
      parcel.coordinates;
    
    const reverseCoords = parcel.reverse_coordinates;
    const errorZone = parcel.error_zone;
    
    const tieCoords = result.tie_line_coordinates;
    const tieLines = result.tie_lines;
    
    if (!coords || coords.length < 2) return null;
    
    // Include all coordinates in bounds calculation
    let allCoords = [...coords];
    if (tieCoords && tieCoords.length > 0) {
      allCoords = [...tieCoords, ...allCoords];
    }
    if (showReverse && reverseCoords && reverseCoords.length > 0) {
      allCoords = [...allCoords, ...reverseCoords];
    }
    
    const padding = 80;  // Increased padding
    const width = 700;   // Wider
    const height = 550;  // Taller
    
    const xs = allCoords.map(c => c.x);
    const ys = allCoords.map(c => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    
    // Add 10% buffer to range
    const rangeX = (maxX - minX) * 1.1 || 1;
    const rangeY = (maxY - minY) * 1.1 || 1;
    const centerX = (maxX + minX) / 2;
    const centerY = (maxY + minY) / 2;
    
    const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);
    
    const toSvg = (c) => ({
      x: width/2 + (c.x - centerX) * scale,
      y: height/2 - (c.y - centerY) * scale,  // Flip Y for screen coords
    });
    
    // Group coordinates by parcel for coloring
    const parcelColors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];
    
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full bg-gray-950 rounded-lg border border-gray-700">
        {/* Grid */}
        <g stroke="#374151" strokeWidth="0.5" opacity="0.3">
          {[...Array(10)].map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * height/9} x2={width} y2={i * height/9} />
          ))}
          {[...Array(14)].map((_, i) => (
            <line key={`v${i}`} x1={i * width/13} y1={0} x2={i * width/13} y2={height} />
          ))}
        </g>
        
        {/* Draw tie lines (dashed, cyan) with bearing/distance */}
        {tieCoords && tieCoords.length > 1 && (
          <g>
            {tieCoords.slice(0, -1).map((coord, i) => {
              const start = toSvg(coord);
              const end = toSvg(tieCoords[i + 1]);
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;
              
              // Get tie line data
              const tie = tieLines?.[i];
              
              if (!showDetailedLabels) {
                // SIMPLE MODE
                return (
                  <g key={`tie-${i}`}>
                    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#06b6d4" strokeWidth="2" strokeDasharray="8,4" />
                    <circle cx={midX} cy={midY} r="10" fill="#111827" stroke="#06b6d4" strokeWidth="1" />
                    <text x={midX} y={midY + 4} textAnchor="middle" fill="#06b6d4" fontSize="9" fontWeight="bold">T{i + 1}</text>
                  </g>
                );
              }
              
              // DETAILED MODE
              const bearing = tie ? 
                `${tie.quadrant?.charAt(0) || ''}${tie.degrees}°${tie.minutes}'${tie.seconds || 0}"${tie.quadrant?.charAt(1) || ''}`
                : '';
              const distance = tie ? `${(tie.distance_feet || 0).toFixed(2)}'` : '';
              
              const dx = end.x - start.x;
              const dy = end.y - start.y;
              const len = Math.sqrt(dx*dx + dy*dy) || 1;
              const offsetDir = (i % 2 === 0) ? 1 : -1;
              const offsetDist = 45;
              const perpX = (-dy / len) * offsetDist * offsetDir;
              const perpY = (dx / len) * offsetDist * offsetDir;
              const labelX = midX + perpX;
              const labelY = midY + perpY;
              
              return (
                <g key={`tie-${i}`}>
                  <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#06b6d4" strokeWidth="2" strokeDasharray="8,4" />
                  <line x1={midX} y1={midY} x2={labelX} y2={labelY} stroke="#06b6d4" strokeWidth="1" opacity="0.5" />
                  <circle cx={midX} cy={midY} r="2" fill="#06b6d4" />
                  
                  <rect x={labelX - 35} y={labelY - 22} width="70" height="44" rx="3" fill="#0c1829" stroke="#06b6d4" strokeWidth="1" opacity="0.95" />
                  <text x={labelX} y={labelY - 10} textAnchor="middle" fill="#06b6d4" fontSize="9" fontWeight="bold">T{i + 1}</text>
                  <text x={labelX} y={labelY + 2} textAnchor="middle" fill="#e5e7eb" fontSize="7" fontFamily="monospace">{bearing}</text>
                  <text x={labelX} y={labelY + 14} textAnchor="middle" fill="#9ca3af" fontSize="7" fontFamily="monospace">{distance}</text>
                </g>
              );
            })}
            {/* POC marker */}
            <g>
              <circle cx={toSvg(tieCoords[0]).x} cy={toSvg(tieCoords[0]).y} r={8} fill="#06b6d4" stroke="#fff" strokeWidth="2" />
              <text x={toSvg(tieCoords[0]).x} y={toSvg(tieCoords[0]).y - 12} textAnchor="middle" fill="#06b6d4" fontSize="10" fontWeight="bold">
                POC
              </text>
            </g>
          </g>
        )}
        
        {/* Draw REVERSE path if enabled (green dashed) */}
        {showReverse && reverseCoords && reverseCoords.length > 1 && (
          <g>
            {reverseCoords.slice(0, -1).map((coord, i) => {
              const start = toSvg(coord);
              const end = toSvg(reverseCoords[i + 1]);
              
              return (
                <line
                  key={`rev-${i}`}
                  x1={start.x} y1={start.y}
                  x2={end.x} y2={end.y}
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="6,4"
                  opacity="0.7"
                />
              );
            })}
            {/* Reverse points (smaller, green) */}
            {reverseCoords.slice(1).map((c, i) => {
              const svgC = toSvg(c);
              return (
                <g key={`rev-pt-${i}`}>
                  <circle cx={svgC.x} cy={svgC.y} r={3} fill="#10b981" stroke="#fff" strokeWidth="1" opacity="0.7" />
                </g>
              );
            })}
          </g>
        )}
        
        {/* Draw error zone gap line if exists */}
        {showReverse && errorZone && errorZone.largestGap && (
          <g>
            {/* The gap line */}
            <line
              x1={toSvg(errorZone.largestGap.forwardCoord).x}
              y1={toSvg(errorZone.largestGap.forwardCoord).y}
              x2={toSvg(errorZone.largestGap.reverseCoord).x}
              y2={toSvg(errorZone.largestGap.reverseCoord).y}
              stroke="#ef4444"
              strokeWidth="3"
              strokeDasharray="4,4"
            />
            {/* Gap distance label */}
            <g transform={`translate(${(toSvg(errorZone.largestGap.forwardCoord).x + toSvg(errorZone.largestGap.reverseCoord).x) / 2}, ${(toSvg(errorZone.largestGap.forwardCoord).y + toSvg(errorZone.largestGap.reverseCoord).y) / 2})`}>
              <rect x="-55" y="-28" width="110" height="56" rx="4" fill="#1f2937" stroke="#ef4444" strokeWidth="2" />
              <text x="0" y="-14" textAnchor="middle" fill="#fca5a5" fontSize="8" fontWeight="bold">CLOSING LINE</text>
              <text x="0" y="0" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">
                {errorZone.largestGap.closingBearing?.formatted || '?'}
              </text>
              <text x="0" y="14" textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="bold">
                {errorZone.largestGap.closingDistance?.toFixed(2) || '?'}'
              </text>
            </g>
            {/* Arrow markers at endpoints */}
            <circle 
              cx={toSvg(errorZone.largestGap.forwardCoord).x} 
              cy={toSvg(errorZone.largestGap.forwardCoord).y} 
              r="6" fill="#f59e0b" stroke="#fff" strokeWidth="2" 
            />
            <circle 
              cx={toSvg(errorZone.largestGap.reverseCoord).x} 
              cy={toSvg(errorZone.largestGap.reverseCoord).y} 
              r="6" fill="#10b981" stroke="#fff" strokeWidth="2" 
            />
          </g>
        )}
        
        {/* Draw FORWARD polygon */}
        {showCombinedView && allParcels ? (
          allParcels.map((p, pIdx) => {
            const pCoords = p.coordinates.map(toSvg);
            const color = parcelColors[pIdx % parcelColors.length];
            return (
              <g key={pIdx}>
                <polygon
                  points={pCoords.map(c => `${c.x},${c.y}`).join(' ')}
                  fill={`${color}22`}
                  stroke={color}
                  strokeWidth="2"
                />
                {/* Line labels - L1, L2, etc */}
                {p.coordinates.slice(0, -1).map((coord, i) => {
                  const start = toSvg(coord);
                  const end = toSvg(p.coordinates[i + 1]);
                  const midX = (start.x + end.x) / 2;
                  const midY = (start.y + end.y) / 2;
                  
                  return (
                    <g key={`label-${pIdx}-${i}`}>
                      <circle cx={midX} cy={midY} r="11" fill="#111827" stroke={color} strokeWidth="1" />
                      <text x={midX} y={midY + 4} textAnchor="middle" fill={color} fontSize="9" fontWeight="bold">
                        L{i + 1}
                      </text>
                    </g>
                  );
                })}
                {/* Point markers */}
                {pCoords.map((c, i) => (
                  <g key={i}>
                    <circle cx={c.x} cy={c.y} r={i === 0 ? 6 : 4} fill={i === 0 ? "#10b981" : color} stroke="#fff" strokeWidth="1" />
                    <text x={c.x + 8} y={c.y - 5} fill="#e5e7eb" fontSize="9" fontWeight="bold">
                      {i === 0 ? `P${p.parcel_id}` : i}
                    </text>
                  </g>
                ))}
              </g>
            );
          })
        ) : (
          <>
            {/* Forward path - draw lines and arcs separately */}
            {coords.slice(0, -1).map((coord, i) => {
              const start = toSvg(coord);
              const end = toSvg(coords[i + 1]);
              const call = parcel.calls?.[i];
              
              // Check if this is a curve
              if (call?.call_type === 'curve' && call.radius) {
                // Draw actual arc using SVG arc
                const radius = call.radius * scale;
                const sweepFlag = call.curve_direction === 'right' ? 1 : 0;
                const largeArcFlag = (call.central_angle_degrees || call.delta_degrees || 0) > 180 ? 1 : 0;
                
                return (
                  <path
                    key={`line-${i}`}
                    d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                  />
                );
              }
              
              // Regular line
              return (
                <line
                  key={`line-${i}`}
                  x1={start.x} y1={start.y}
                  x2={end.x} y2={end.y}
                  stroke="#f59e0b"
                  strokeWidth="2"
                />
              );
            })}
            
            {/* Fill polygon */}
            <polygon
              points={coords.map(c => toSvg(c)).map(c => `${c.x},${c.y}`).join(' ')}
              fill="rgba(251,191,36,0.08)"
              stroke="none"
            />
            
            {/* Line labels - Simple or Detailed based on toggle */}
            {coords.slice(0, -1).map((coord, i) => {
              const start = toSvg(coord);
              const end = toSvg(coords[i + 1]);
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;
              
              const call = parcel.calls?.[i];
              const isCurve = call?.call_type === 'curve';
              
              // Highlight problem lines
              const isErrorLine = errorZone && errorZone.largestGap && 
                (i + 1 === errorZone.largestGap.forwardIndex || 
                 i + 1 === coords.length - errorZone.largestGap.reverseIndex);
              
              const lineColor = isErrorLine ? "#ef4444" : isCurve ? "#3b82f6" : "#f59e0b";
              const textColor = isErrorLine ? "#fca5a5" : isCurve ? "#93c5fd" : "#fbbf24";
              
              if (!showDetailedLabels) {
                // SIMPLE MODE - just circles with L#
                return (
                  <g key={`label-${i}`}>
                    <circle cx={midX} cy={midY} r="11" fill="#1f2937" stroke={lineColor} strokeWidth="1.5" />
                    <text x={midX} y={midY + 4} textAnchor="middle" fill={textColor} fontSize="9" fontWeight="bold">
                      {isCurve ? 'C' : 'L'}{i + 1}
                    </text>
                  </g>
                );
              }
              
              // DETAILED MODE - leaders with full info
              const dx = end.x - start.x;
              const dy = end.y - start.y;
              const len = Math.sqrt(dx*dx + dy*dy) || 1;
              
              const offsetDir = (i % 2 === 0) ? 1 : -1;
              const offsetDist = 45 + (i % 3) * 12;
              const perpX = (-dy / len) * offsetDist * offsetDir;
              const perpY = (dx / len) * offsetDist * offsetDir;
              
              const labelX = midX + perpX;
              const labelY = midY + perpY;
              
              // Format bearing/distance based on call type
              let line1 = '', line2 = '', line3 = '';
              if (isCurve) {
                line1 = `R=${call.radius}'`;
                line2 = `Δ=${call.central_angle_degrees || call.delta_degrees || '?'}°`;
                line3 = `Arc=${(call.arc_length || 0).toFixed(2)}'`;
              } else if (call) {
                line1 = `${call.quadrant?.charAt(0) || ''}${call.degrees}°${call.minutes}'${call.seconds || 0}"${call.quadrant?.charAt(1) || ''}`;
                line2 = `${(call.distance_feet || 0).toFixed(2)}'`;
                line3 = '';
              }
              
              const boxHeight = isCurve ? 52 : 40;
              
              return (
                <g key={`label-${i}`}>
                  <line x1={midX} y1={midY} x2={labelX} y2={labelY} stroke={lineColor} strokeWidth="1" opacity="0.5" />
                  <circle cx={midX} cy={midY} r="2" fill={lineColor} />
                  
                  <rect 
                    x={labelX - 32} y={labelY - boxHeight/2 - 8} 
                    width="64" height={boxHeight} 
                    rx="3" fill="#111827" stroke={lineColor} strokeWidth="1" opacity="0.95"
                  />
                  
                  <text x={labelX} y={labelY - boxHeight/2 + 6} textAnchor="middle" fill={textColor} fontSize="9" fontWeight="bold">
                    {isCurve ? 'C' : 'L'}{i + 1}
                  </text>
                  <text x={labelX} y={labelY - boxHeight/2 + 18} textAnchor="middle" fill="#e5e7eb" fontSize="7" fontFamily="monospace">
                    {line1}
                  </text>
                  <text x={labelX} y={labelY - boxHeight/2 + 28} textAnchor="middle" fill="#9ca3af" fontSize="7" fontFamily="monospace">
                    {line2}
                  </text>
                  {line3 && (
                    <text x={labelX} y={labelY - boxHeight/2 + 38} textAnchor="middle" fill="#9ca3af" fontSize="7" fontFamily="monospace">
                      {line3}
                    </text>
                  )}
                </g>
              );
            })}
            
            {/* Point markers */}
            {coords.map((c, i) => {
              const svgC = toSvg(c);
              return (
                <g key={i}>
                  <circle cx={svgC.x} cy={svgC.y} r={i === 0 ? 7 : 4} 
                    fill={i === 0 ? "#10b981" : c.isCurve ? "#3b82f6" : "#f59e0b"} 
                    stroke="#fff" strokeWidth="2" />
                  <text x={svgC.x + 9} y={svgC.y - 6} fill="#e5e7eb" fontSize="10" fontWeight="bold">
                    {c.label}
                  </text>
                </g>
              );
            })}
          </>
        )}
        
        {/* North arrow */}
        <g transform="translate(30, 30)">
          <polygon points="0,-18 -6,4 0,0 6,4" fill="#9ca3af" />
          <text x="-4" y="16" fill="#9ca3af" fontSize="11" fontWeight="bold">N</text>
        </g>
        
        {/* Closure indicator - simplified */}
        {parcel.closure && (
          <g transform={`translate(${width - 105}, 10)`}>
            {parcel.closure.error_distance < 1.0 ? (
              // CLOSES - Green
              <>
                <rect x="0" y="0" width="98" height="36" rx="4" fill="#065f4620" stroke="#10b981" strokeWidth="2" />
                <text x="49" y="15" textAnchor="middle" fill="#10b981" fontSize="11" fontWeight="bold">
                  ✓ CLOSES
                </text>
                <text x="49" y="28" textAnchor="middle" fill="#9ca3af" fontSize="9">
                  Error: {parcel.closure.error_distance < 0.05 ? '0.0' : parcel.closure.error_distance.toFixed(1)}'
                </text>
              </>
            ) : (
              // DOES NOT CLOSE - Red flag
              <>
                <rect x="0" y="0" width="98" height="36" rx="4" fill="#7f1d1d40" stroke="#ef4444" strokeWidth="2" />
                <text x="49" y="15" textAnchor="middle" fill="#ef4444" fontSize="10" fontWeight="bold">
                  ⚠ NO CLOSE
                </text>
                <text x="49" y="28" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">
                  Error: {parcel.closure.error_distance.toFixed(1)}'
                </text>
              </>
            )}
          </g>
        )}
        
        {/* Legend */}
        <g transform={`translate(12, ${height - 55})`}>
          <rect x="0" y="0" width="130" height="50" rx="4" fill="#111827" stroke="#374151" />
          <line x1="8" y1="12" x2="28" y2="12" stroke="#f59e0b" strokeWidth="2" />
          <text x="33" y="15" fill="#9ca3af" fontSize="8">Forward path</text>
          {showReverse && (
            <>
              <line x1="8" y1="26" x2="28" y2="26" stroke="#10b981" strokeWidth="2" strokeDasharray="4,3" />
              <text x="33" y="29" fill="#9ca3af" fontSize="8">Reverse path</text>
              <line x1="8" y1="40" x2="28" y2="40" stroke="#ef4444" strokeWidth="2" strokeDasharray="3,3" />
              <text x="33" y="43" fill="#9ca3af" fontSize="8">Error gap</text>
            </>
          )}
        </g>
      </svg>
    );
  };

  return (
    <>
      <Head>
        <title>Legal Description Plotter | Survey Copilot</title>
        <meta name="description" content="AI-powered legal description parser and CAD exporter" />
      </Head>
      
      {/* Error Detection Modal */}
      {showErrorModal && bearingErrors.length > 0 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border-2 border-amber-500 max-w-lg w-full shadow-2xl">
            <div className="p-4 border-b border-gray-700 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-lg font-bold text-amber-400">POSSIBLE ERROR IN LEGAL DESCRIPTION</h2>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-gray-300">
                <strong className="text-white">Line {bearingErrors[currentErrorIndex].callNumber}</strong>
                {bearingErrors[currentErrorIndex].type === 'curve_chord' ? ' (Curve)' : ''}: 
                {' '}Bearing has invalid {bearingErrors[currentErrorIndex].field.replace('_', ' ')} value
              </p>
              
              <div className="bg-gray-900 rounded-lg p-4 font-mono">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Found:</span>
                  <span className="text-red-400 text-lg">{bearingErrors[currentErrorIndex].found}</span>
                  <span className="text-gray-500">← {bearingErrors[currentErrorIndex].invalidValue} minutes is impossible</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-gray-400 text-sm">Did you mean:</p>
                {bearingErrors[currentErrorIndex].suggestions.map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      // Apply the fix
                      const err = bearingErrors[currentErrorIndex];
                      const newResult = { ...result };
                      const call = newResult.parcels[err.parcelIndex].calls[err.callIndex];
                      
                      if (err.type === 'curve_chord') {
                        call.chord_minutes = call.chord_minutes % 100;
                        // Recalculate chord_bearing_decimal
                        const q = call.chord_quadrant || 'NE';
                        let baseBearing = (call.chord_degrees || 0) + (call.chord_minutes / 60) + ((call.chord_seconds || 0) / 3600);
                        if (q === 'NE') call.chord_bearing_decimal = baseBearing;
                        else if (q === 'SE') call.chord_bearing_decimal = 180 - baseBearing;
                        else if (q === 'SW') call.chord_bearing_decimal = 180 + baseBearing;
                        else if (q === 'NW') call.chord_bearing_decimal = 360 - baseBearing;
                      } else {
                        call.minutes = call.minutes % 100;
                        // Recalculate bearing_decimal
                        const q = call.quadrant || 'NE';
                        let baseBearing = (call.degrees || 0) + (call.minutes / 60) + ((call.seconds || 0) / 3600);
                        if (q === 'NE') call.bearing_decimal = baseBearing;
                        else if (q === 'SE') call.bearing_decimal = 180 - baseBearing;
                        else if (q === 'SW') call.bearing_decimal = 180 + baseBearing;
                        else if (q === 'NW') call.bearing_decimal = 360 - baseBearing;
                      }
                      
                      // Move to next error or close modal
                      if (currentErrorIndex < bearingErrors.length - 1) {
                        setCurrentErrorIndex(currentErrorIndex + 1);
                      } else {
                        setShowErrorModal(false);
                        // Re-parse with fixed data would require backend call
                        // For now, just update local state
                        setResult(newResult);
                      }
                    }}
                    className="w-full text-left p-3 rounded-lg bg-green-900/30 border border-green-700 hover:bg-green-900/50 transition-colors"
                  >
                    <span className="text-green-400 font-mono text-lg">{sug.label}</span>
                    <span className="text-gray-400 text-sm ml-3">({sug.reason})</span>
                  </button>
                ))}
                
                <button
                  onClick={() => {
                    // Skip this error
                    if (currentErrorIndex < bearingErrors.length - 1) {
                      setCurrentErrorIndex(currentErrorIndex + 1);
                    } else {
                      setShowErrorModal(false);
                    }
                  }}
                  className="w-full text-left p-3 rounded-lg bg-gray-700/50 border border-gray-600 hover:bg-gray-700 transition-colors"
                >
                  <span className="text-gray-300">Skip this error</span>
                  <span className="text-gray-500 text-sm ml-3">(keep original value)</span>
                </button>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-700 flex justify-between items-center">
              <span className="text-sm text-gray-500">
                Error {currentErrorIndex + 1} of {bearingErrors.length}
              </span>
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="min-h-screen bg-gray-900 text-gray-100">
        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-amber-400">Legal Description Plotter</h1>
              <p className="text-sm text-gray-400">Survey Copilot • AI-Powered Parsing</p>
            </div>
            <div className="text-xs text-gray-500">v1.0</div>
          </div>
        </header>

        {/* Tabs */}
        <div className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-6xl mx-auto flex">
            {['input', 'results', 'calls', 'export'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                disabled={tab !== 'input' && !result}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab 
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-gray-900/50' 
                    : 'text-gray-400 hover:text-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <main className="max-w-6xl mx-auto p-4">
          {/* INPUT TAB */}
          {activeTab === 'input' && (
            <div className="space-y-4">
              {/* Input Type Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setInputType('text')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    inputType === 'text' 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Paste Text
                </button>
                <button
                  onClick={() => setInputType('image')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    inputType === 'image' 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Upload Image/PDF
                </button>
              </div>

              {/* Text Input */}
              {inputType === 'text' && (
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Paste your legal description here..."
                  className="w-full h-72 bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm focus:border-amber-500 focus:outline-none resize-none"
                />
              )}

              {/* Image Upload */}
              {inputType === 'image' && (
                <div className="space-y-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-amber-500 transition-colors"
                  >
                    {imagePreview ? (
                      <div className="space-y-4">
                        {imageType === 'application/pdf' ? (
                          <div className="text-amber-400">
                            <svg className="w-16 h-16 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                            PDF Uploaded
                          </div>
                        ) : (
                          <img src={imagePreview} alt="Preview" className="max-h-64 mx-auto rounded" />
                        )}
                        <p className="text-sm text-gray-400">Click to upload a different file</p>
                      </div>
                    ) : (
                      <div className="text-gray-400">
                        <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="font-medium">Click to upload</p>
                        <p className="text-sm mt-1">JPG, PNG, PDF • Photos, scans, screenshots</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
                  {error}
                </div>
              )}

              {/* Parse Button */}
              <button
                onClick={handleParse}
                disabled={loading || (inputType === 'text' ? !textInput.trim() : !imageData)}
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 font-medium py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Parsing with AI...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Parse Legal Description
                  </>
                )}
              </button>
            </div>
          )}

          {/* RESULTS TAB */}
          {activeTab === 'results' && result && (
            <div className="space-y-4">
              {/* FIELD SURVEY REQUIRED WARNING */}
              {result.parcels[activeParcel].requires_field_survey && (
                <div className="bg-gradient-to-r from-amber-900/40 to-red-900/40 border-2 border-amber-500 rounded-lg p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-amber-300">⚠️ This Legal Requires Field Survey</h3>
                      <p className="text-sm text-gray-300 mt-1">
                        The following calls cannot be accurately plotted from the record description alone:
                      </p>
                      <ul className="mt-3 space-y-2">
                        {result.parcels[activeParcel].unplottable_calls?.map((call, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 w-8 h-6 flex items-center justify-center bg-red-900/50 rounded text-red-300 font-bold text-xs">
                              L{call.call_number}
                            </span>
                            <div>
                              <span className="text-amber-200 font-medium">{call.reason}</span>
                              {call.call_text && (
                                <span className="text-gray-400 text-xs block">"{call.call_text}"</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 p-3 bg-gray-900/50 rounded-lg">
                        <p className="text-xs text-gray-400">
                          <strong className="text-amber-400">RECOMMENDATION:</strong> This boundary requires field location of monuments 
                          and actual survey of meander/irregular lines. Enable <strong>"Bi-Directional"</strong> view to see the 
                          calculated closing line that would connect the plottable portions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* POC and Tie Lines Info */}
              {result.poc_description && (
                <div className="bg-cyan-900/30 border border-cyan-700/50 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-cyan-400 uppercase mb-2">Point of Commencement (POC)</h3>
                  <p className="text-gray-200 text-sm">{result.poc_description}</p>
                  {result.poc_reference && (
                    <p className="text-gray-400 text-xs mt-1">Reference: {result.poc_reference}</p>
                  )}
                  {result.tie_lines && result.tie_lines.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-cyan-700/30">
                      <p className="text-xs text-cyan-400 uppercase mb-2">Tie Line(s) to POB:</p>
                      {result.tie_lines.map((tie, i) => (
                        <p key={i} className="text-gray-300 text-sm font-mono">
                          {tie.direction_text || tie.chord_bearing_text} — {tie.distance_feet || tie.arc_length}' 
                          {tie.monument && <span className="text-gray-500"> to {tie.monument}</span>}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Plot Controls */}
              <div className="flex gap-2 flex-wrap items-center justify-between">
                <div className="flex gap-2 flex-wrap items-center">
                  {/* Parcel Selector */}
                  {result.parcels.length > 1 && (
                    <>
                      <span className="text-sm text-gray-400">View:</span>
                      {result.parcels.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => { setActiveParcel(i); setShowCombined(false); }}
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                            !showCombined && activeParcel === i 
                              ? 'bg-amber-600 text-white' 
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Parcel {p.parcel_id}
                        </button>
                      ))}
                      <button
                        onClick={() => setShowCombined(true)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          showCombined 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Combined View
                      </button>
                    </>
                  )}
                </div>
                
                <div className="flex gap-2 items-center">
                  {/* Label detail toggle */}
                  <button
                    onClick={() => setShowDetailedLabels(!showDetailedLabels)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                      showDetailedLabels 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title="Toggle between simple and detailed labels"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    {showDetailedLabels ? 'Detailed' : 'Simple'}
                  </button>
                  
                  {/* Download Image button */}
                  <button
                    onClick={downloadPlotImage}
                    className="px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 bg-purple-700 text-white hover:bg-purple-600"
                    title="Download plot as PNG image"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Save Image
                  </button>
                  
                  {/* Bi-directional toggle */}
                  <button
                    onClick={() => setShowReverse(!showReverse)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                      showReverse 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    {showReverse ? 'Hide' : 'Show'} Bi-Directional
                  </button>
                </div>
              </div>

              {/* Plot */}
              <div ref={plotRef} className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 uppercase mb-3">
                  {showCombined ? 'Combined Plot' : `Parcel ${result.parcels[activeParcel].parcel_id} Plot`}
                </h3>
                <PlotView 
                  parcel={result.parcels[activeParcel]} 
                  showCombinedView={showCombined}
                  allParcels={result.parcels}
                />
              </div>

              {/* Closing Line Info - shown when bi-directional is enabled */}
              {showReverse && result.parcels[activeParcel].error_zone?.largestGap && (
                <div className="bg-gradient-to-r from-red-900/30 to-green-900/30 border border-red-700/50 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-white uppercase mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Calculated Closing Line
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-900/50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 uppercase">From Point</div>
                      <div className="text-lg font-bold text-amber-400">
                        L{result.parcels[activeParcel].error_zone.largestGap.forwardLabel}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        Forward path endpoint
                      </div>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 uppercase">Closing Bearing & Distance</div>
                      <div className="text-lg font-bold text-white">
                        {result.parcels[activeParcel].error_zone.largestGap.closingBearing?.formatted || 'N/A'}
                      </div>
                      <div className="text-lg font-bold text-green-400">
                        {result.parcels[activeParcel].error_zone.largestGap.closingDistance?.toFixed(2) || '?'} ft
                      </div>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3">
                      <div className="text-xs text-gray-500 uppercase">To Point</div>
                      <div className="text-lg font-bold text-green-400">
                        L{result.parcels[activeParcel].error_zone.largestGap.reverseLabel}R
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        Reverse path endpoint
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    💡 This is the line that would connect the forward and reverse paths. 
                    Compare this to your record legal — if it mentions a meander, creek, or "more or less" distance, 
                    this calculated line is likely the actual chord that closes the boundary.
                  </p>
                </div>
              )}

              {/* Line Table Legend */}
              <div className="bg-gray-800 rounded-lg p-4 overflow-x-auto">
                <h3 className="text-sm text-gray-400 uppercase mb-3">Line Table</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-700">
                      <th className="pb-2 pr-2">Line</th>
                      <th className="pb-2 pr-2">Bearing</th>
                      <th className="pb-2 pr-2">Distance</th>
                      <th className="pb-2 pr-2 hidden md:table-cell">Original Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.parcels[activeParcel].calls?.map((call, i) => (
                      <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-2 pr-2">
                          <span className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-amber-600/20 text-amber-400 font-bold">
                            L{i + 1}
                          </span>
                        </td>
                        <td className="py-2 pr-2 font-mono text-gray-200">
                          {call.call_type === 'curve' 
                            ? <span className="text-blue-400">
                                Curve R={call.radius}' Δ={call.central_angle_degrees || call.delta_degrees || '?'}°
                                {call.chord_minutes > 60 && (
                                  <span className="block text-xs text-red-400">⚠️ Check chord: {call.chord_degrees}°{call.chord_minutes}'{call.chord_seconds}"</span>
                                )}
                              </span>
                            : <span>
                                <span className={call.quadrant?.startsWith('N') ? 'text-green-400' : 'text-red-400'}>
                                  {call.quadrant?.charAt(0) || '?'}
                                </span>
                                {call.degrees}°{call.minutes}'{call.seconds || 0}"
                                <span className={call.quadrant?.endsWith('E') ? 'text-green-400' : 'text-red-400'}>
                                  {call.quadrant?.charAt(1) || '?'}
                                </span>
                              </span>
                          }
                        </td>
                        <td className="py-2 pr-2 text-gray-300">
                          {(call.distance_feet || call.arc_length || call.chord_distance || 0).toFixed(2)}'
                          {call.distance_qualifier && <span className="text-amber-400 ml-1">±</span>}
                        </td>
                        <td className="py-2 pr-2 text-gray-500 text-xs hidden md:table-cell truncate max-w-[200px]" title={call.direction_text}>
                          {call.direction_text || call.along_description || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Tie lines if present */}
                {result.tie_lines && result.tie_lines.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <p className="text-xs text-cyan-400 uppercase mb-2">Tie Lines (POC → POB)</p>
                    <table className="w-full text-xs">
                      <tbody>
                        {result.tie_lines.map((tie, i) => (
                          <tr key={i} className="border-b border-gray-700/50">
                            <td className="py-2 pr-2">
                              <span className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-cyan-600/20 text-cyan-400 font-bold">
                                T{i + 1}
                              </span>
                            </td>
                            <td className="py-2 pr-2 font-mono text-gray-200">
                              {tie.quadrant?.charAt(0) || ''}{tie.degrees}°{tie.minutes}'{tie.seconds || 0}"{tie.quadrant?.charAt(1) || ''}
                            </td>
                            <td className="py-2 pr-2 text-gray-300">{tie.distance_feet}'</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase">Calculated Area</div>
                  <div className="text-xl font-bold text-amber-400">
                    {result.parcels[activeParcel].calculated_area_acres?.toFixed(3)} ac
                  </div>
                  <div className="text-sm text-gray-400">
                    {result.parcels[activeParcel].calculated_area_sqft?.toFixed(0)} sq ft
                  </div>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase">Closure</div>
                  <div className={`text-xl font-bold ${result.parcels[activeParcel].closure?.closes ? 'text-green-400' : 'text-red-400'}`}>
                    {result.parcels[activeParcel].closure?.precision_ratio || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-400">
                    Error: {result.parcels[activeParcel].closure?.error_distance || 0} ft
                  </div>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase">Perimeter</div>
                  <div className="text-xl font-bold text-gray-200">
                    {result.parcels[activeParcel].closure?.perimeter || 0} ft
                  </div>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase">Calls</div>
                  <div className="text-xl font-bold text-gray-200">
                    {result.parcels[activeParcel].calls?.length || 0}
                  </div>
                  <div className="text-sm text-gray-400">
                    {result.parcels[activeParcel].calls?.filter(c => c.call_type === 'curve').length || 0} curves
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {result.parcels[activeParcel].warnings?.length > 0 && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-red-400 uppercase mb-2">Warnings</h3>
                  {result.parcels[activeParcel].warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-red-400">⚠</span>
                      <span className={w.severity === 'error' ? 'text-red-300' : 'text-yellow-300'}>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Called vs Calculated Area */}
              {result.parcels[activeParcel].called_area_value && (
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-sm text-gray-400 uppercase mb-2">Area Comparison</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-sm text-gray-500">Called</div>
                      <div className="text-lg font-bold">{result.parcels[activeParcel].called_area_value} {result.parcels[activeParcel].called_area_unit}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Calculated</div>
                      <div className="text-lg font-bold">{result.parcels[activeParcel].calculated_area_acres?.toFixed(4)} acres</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Difference</div>
                      <div className={`text-lg font-bold ${result.parcels[activeParcel].area_discrepancy?.significant ? 'text-red-400' : 'text-green-400'}`}>
                        {result.parcels[activeParcel].area_discrepancy?.percent_difference?.toFixed(2) || 0}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CALLS TAB */}
          {activeTab === 'calls' && result && (
            <div className="space-y-4">
              {/* Parcel Selector for Calls */}
              {result.parcels.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {result.parcels.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveParcel(i)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        activeParcel === i 
                          ? 'bg-amber-600 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Parcel {p.parcel_id}
                    </button>
                  ))}
                </div>
              )}

              {/* POB */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 uppercase mb-2">Point of Beginning</h3>
                <p className="text-gray-200">{result.parcels[activeParcel].pob_description}</p>
              </div>

              {/* Line Calls Table */}
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-900 text-gray-400 text-left">
                        <th className="p-3">#</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Direction</th>
                        <th className="p-3">Distance</th>
                        <th className="p-3">Curve Data</th>
                        <th className="p-3">Monument</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.parcels[activeParcel].calls?.map((call, i) => (
                        <tr key={i} className="border-t border-gray-700 hover:bg-gray-700/50">
                          <td className="p-3 text-amber-400 font-bold">{call.call_number}</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              call.call_type === 'curve' ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-300'
                            }`}>
                              {call.call_type === 'curve' ? 'Curve' : 'Line'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-xs">{call.direction_text || call.chord_bearing_text || '-'}</td>
                          <td className="p-3 text-green-400">{call.distance_feet || call.arc_length || '-'} ft</td>
                          <td className="p-3 text-xs text-gray-400">
                            {call.call_type === 'curve' ? (
                              <span>R={call.radius}' Δ={call.delta_degrees}°{call.delta_minutes}'{call.delta_seconds}"</span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-xs">
                            {call.monument ? (
                              <span className="text-gray-300">
                                {call.monument} <span className="text-gray-500">({call.monument_condition})</span>
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Coordinates Table */}
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <h3 className="text-sm text-gray-400 uppercase p-4 pb-2">Coordinates (from 0,0)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-900 text-gray-400 text-left">
                        <th className="p-3">Point</th>
                        <th className="p-3">Northing</th>
                        <th className="p-3">Easting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.parcels[activeParcel].coordinates?.map((coord, i) => (
                        <tr key={i} className="border-t border-gray-700">
                          <td className="p-3 text-amber-400 font-bold">{coord.label}</td>
                          <td className="p-3 font-mono">{coord.n.toFixed(3)}</td>
                          <td className="p-3 font-mono">{coord.e.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* EXPORT TAB */}
          {activeTab === 'export' && result && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-200">Export Options</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* DXF Export */}
                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-amber-600/20 rounded-lg flex items-center justify-center">
                      <span className="text-amber-400 font-bold">DXF</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-200">CAD Drawing</h3>
                      <p className="text-sm text-gray-400">Open in AutoCAD, Carlson, Civil 3D</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={() => handleExportDXF(false)}
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2 rounded font-medium transition-colors"
                    >
                      Download DXF
                    </button>
                    {result.parcels.length > 1 && (
                      <button
                        onClick={() => handleExportDXF(true)}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 rounded font-medium transition-colors"
                      >
                        Download Combined DXF
                      </button>
                    )}
                  </div>
                </div>

                {/* Word Export */}
                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center">
                      <span className="text-blue-400 font-bold">DOC</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-200">Word Document</h3>
                      <p className="text-sm text-gray-400">Legal text + calls table for copying</p>
                    </div>
                  </div>
                  <button
                    onClick={handleExportWord}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-medium transition-colors"
                  >
                    Download Word (.docx)
                  </button>
                </div>

                {/* CSV Export */}
                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center">
                      <span className="text-green-400 font-bold">CSV</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-200">Spreadsheet</h3>
                      <p className="text-sm text-gray-400">Line calls for Excel or import</p>
                    </div>
                  </div>
                  <button
                    onClick={handleExportCSV}
                    className="w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded font-medium transition-colors"
                  >
                    Download CSV
                  </button>
                </div>

                {/* Copy Text */}
                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-200">Copy Text</h3>
                      <p className="text-sm text-gray-400">Cleaned legal description to clipboard</p>
                    </div>
                  </div>
                  <button
                    onClick={handleCopyText}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded font-medium transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              </div>

              {/* Raw Text Preview */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 uppercase mb-2">Cleaned Legal Description</h3>
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{result.raw_text_cleaned}</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
      `}</style>
    </>
  );
}
