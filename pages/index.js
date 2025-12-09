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
  const fileInputRef = useRef(null);

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

  const PlotView = ({ parcel, showCombinedView, allParcels }) => {
    const coords = showCombinedView ? 
      (result.combined_coordinates || parcel.coordinates) : 
      parcel.coordinates;
    
    if (!coords || coords.length < 2) return null;
    
    const padding = 60;
    const width = 500;
    const height = 400;
    
    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;
    const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);
    
    const toSvg = (c) => ({
      x: padding + (c.x - minX) * scale,
      y: height - padding - (c.y - minY) * scale,
    });
    
    // Group coordinates by parcel for coloring
    const parcelColors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];
    
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full bg-gray-950 rounded-lg border border-gray-700">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" fill="#f59e0b" />
          </marker>
        </defs>
        
        {/* Grid */}
        <g stroke="#374151" strokeWidth="0.5" opacity="0.5">
          {[...Array(11)].map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * height/10} x2={width} y2={i * height/10} />
          ))}
          {[...Array(11)].map((_, i) => (
            <line key={`v${i}`} x1={i * width/10} y1={0} x2={i * width/10} y2={height} />
          ))}
        </g>
        
        {/* Draw polygon(s) */}
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
                {pCoords.map((c, i) => (
                  <g key={i}>
                    <circle cx={c.x} cy={c.y} r={i === 0 ? 6 : 4} fill={i === 0 ? "#10b981" : color} stroke="#fff" strokeWidth="1" />
                    <text x={c.x + 8} y={c.y - 5} fill="#e5e7eb" fontSize="10" fontWeight="bold">
                      {i === 0 ? `P${p.parcel_id}-POB` : `${p.parcel_id}-${i}`}
                    </text>
                  </g>
                ))}
              </g>
            );
          })
        ) : (
          <>
            <polygon
              points={coords.map(c => toSvg(c)).map(c => `${c.x},${c.y}`).join(' ')}
              fill="rgba(251,191,36,0.15)"
              stroke="#f59e0b"
              strokeWidth="2"
            />
            {coords.map((c, i) => {
              const svgC = toSvg(c);
              return (
                <g key={i}>
                  <circle cx={svgC.x} cy={svgC.y} r={i === 0 ? 8 : 5} 
                    fill={i === 0 ? "#10b981" : c.isCurve ? "#3b82f6" : "#f59e0b"} 
                    stroke="#fff" strokeWidth="2" />
                  <text x={svgC.x + 10} y={svgC.y - 8} fill="#e5e7eb" fontSize="11" fontWeight="bold">
                    {c.label}
                  </text>
                </g>
              );
            })}
          </>
        )}
        
        {/* North arrow */}
        <g transform="translate(35, 35)">
          <polygon points="0,-20 -8,5 0,0 8,5" fill="#9ca3af" />
          <text x="-5" y="20" fill="#9ca3af" fontSize="12" fontWeight="bold">N</text>
        </g>
        
        {/* Closure indicator */}
        {parcel.closure && (
          <g transform={`translate(${width - 100}, 20)`}>
            <rect x="0" y="0" width="90" height="24" rx="4" 
              fill={parcel.closure.closes ? "#065f4620" : "#7f1d1d20"} 
              stroke={parcel.closure.closes ? "#10b981" : "#ef4444"} />
            <text x="45" y="16" textAnchor="middle" fill={parcel.closure.closes ? "#10b981" : "#ef4444"} fontSize="11" fontWeight="bold">
              {parcel.closure.closes ? "CLOSES" : "NO CLOSE"}
            </text>
          </g>
        )}
      </svg>
    );
  };

  return (
    <>
      <Head>
        <title>Legal Description Plotter | Survey Copilot</title>
        <meta name="description" content="AI-powered legal description parser and CAD exporter" />
      </Head>
      
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
              {/* Parcel Selector */}
              {result.parcels.length > 1 && (
                <div className="flex gap-2 flex-wrap items-center">
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
                </div>
              )}

              {/* Plot */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 uppercase mb-3">
                  {showCombined ? 'Combined Plot' : `Parcel ${result.parcels[activeParcel].parcel_id} Plot`}
                </h3>
                <PlotView 
                  parcel={result.parcels[activeParcel]} 
                  showCombinedView={showCombined}
                  allParcels={result.parcels}
                />
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
