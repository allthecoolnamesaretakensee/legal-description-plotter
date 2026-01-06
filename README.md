# Legal Description Plotter v40

AI-powered legal description parser and CAD exporter for land surveyors.

## What's New in v40

### Major Fix: TOGETHER WITH + LESS Handling

Now properly parses complex fractionals like:
```
The West 1/2 of the Southeast 1/4 of the Northwest 1/4 of the Northwest 1/4 of Section 9,
Less the South 441 feet thereof, 
together with the West 20 feet of the South 441 feet of the West 1/2 of the Southeast 1/4 
of the Northwest 1/4 of the Northwest 1/4, 
Less the South 18 feet for road right-of-way.
```

**Parcel 1:**
- Section 9 → NW 1/4 → NW 1/4 → SE 1/4 → W 1/2 = 330' × 660'
- LESS South 441' = **330' × 219'** (top rectangle)

**Parcel 2 (TOGETHER WITH):**
- Same base → S 441' → W 20' = 20' × 441'
- LESS South 18' = **20' × 423'** (left strip)

**Result:** L-shaped combined parcel! 🎯

### How It Works
1. **Split** by "TOGETHER WITH" to get separate parcels
2. **For each parcel:** Extract LESS clauses, parse aliquot parts (right-to-left)
3. **Apply** divisions then subtract LESS from final result
4. **Render** all parcels with different colors

## Full Feature List

### Input Methods
- **Text Input**: Paste legal descriptions directly
- **Image Upload**: Upload photos/scans of documents  
- **PDF Support**: Extract text from PDFs
- **OCR**: Paste images to extract text

### Parsing Capabilities
- **Metes & Bounds**: Bearings, distances, curves with chord data
- **Fractional/Aliquot**: "NW 1/4 of the SE 1/4" style descriptions
- **Strip Descriptions**: "North 200 feet of..." 
- **LESS/EXCEPT Clauses**: Detects and warns about exclusions
- **Multiple Parcels**: Parse descriptions with multiple parcels
- **POC/POB Detection**: Extracts Point of Commencement and tie lines
- **Curve Data**: Radius, delta, arc length, chord bearing/distance

### Visualization
- **Interactive Plot**: Zoom, pan, click lines for info
- **Draggable Info Boxes**: Reposition popup information anywhere
- **Section Grid**: Visual grid overlay for fractional descriptions
- **Bi-Directional View**: See both forward and reverse traversals
- **Closure Analysis**: Error distance and precision ratio

### Analysis
- **Aliquot Breakdown**: Step-by-step division display
- **Area Calculation**: Square feet and acres
- **Closure Ratio**: 1:X precision display
- **Bearing Error Detection**: Flags impossible values (>59 minutes)
- **Field Survey Warnings**: Identifies meander lines requiring survey

### Export Options
- **DXF**: AutoCAD/Civil 3D compatible format
- **Word Document**: Legal text with calls table
- **PNG Image**: Screenshot of current plot
- **Copy Coordinates**: X,Y list to clipboard

## Quick Deploy to Vercel

### Step 1: Fork or Clone This Repository

Click "Fork" on GitHub to copy this to your account, or clone it:
```bash
git clone https://github.com/YOUR_USERNAME/legal-description-plotter.git
```

### Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. **IMPORTANT**: Before deploying, add your environment variable:
   - Click "Environment Variables"
   - Add: `ANTHROPIC_API_KEY` = `your_api_key_here`
5. Click "Deploy"

### Step 3: Use Your App

Once deployed, you'll get a URL like `your-app.vercel.app`

## Local Development

1. Clone the repository
2. Copy `.env.example` to `.env.local` and add your API key
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key from console.anthropic.com |

## Tech Stack

- **Frontend**: Next.js, React
- **AI**: Anthropic Claude API (Vision + Text)
- **Document Generation**: docx library
- **Hosting**: Vercel

## Cost

- **Vercel Hosting**: Free tier (plenty for starting out)
- **Anthropic API**: ~$0.01-0.03 per legal description parsed

## Support

Built by Survey Copilot. Questions? Contact [your email]

## License

MIT
