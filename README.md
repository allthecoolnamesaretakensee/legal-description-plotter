# Legal Description Plotter v49

AI-powered legal description parser and CAD exporter for land surveyors.

## What's New in v49

### 🔄 TANGENT CURVE SUPPORT! 
When a curve has "Point of Curvature" (PC) indicator, we can now **calculate the chord bearing** from the incoming line!

**How it works:**
1. Detects "PC", "P.C.", "point of curvature" in curve text
2. Finds the previous line's bearing (the tangent to the curve)
3. Calculates chord bearing = incoming_bearing + (delta/2) × turn_direction
4. Calculates chord distance = 2 × R × sin(delta/2)

**Example Legal (now plots correctly!):**
```
"...S4°03'48"W along the East right-of-way line a distance of 1203.22 feet 
to the Point of Beginning. Said point being the PC of a curve, concaved 
Northeasterly, having a central angle of 90° and a radius of 50 feet, 
thence Southeasterly along the arc of said curve a distance of 78.54 feet 
to the P.T. of said curve..."
```

**What gets calculated:**
- Incoming bearing: S4°03'48"W (from previous line)
- Turn direction: Determined from "concaved Northeasterly"
- Chord bearing: Calculated from incoming + delta/2
- Chord distance: 70.71' (from 2 × 50 × sin(45°))

### 📚 Knowledge Base Updated
Added comprehensive tangent curve documentation to `docs/SURVEY_KNOWLEDGE.md`:
- PC/PT terminology explained
- Concave direction → turn direction mapping table
- Chord calculation formulas
- Detection keywords

### ✅ From v48
- Fixed parcel combining logic (different subdivisions = no combine)
- Better error messages for long legals

## Time Savings 📊
- Manual plotting with tangent curves: 15-20+ minutes per curve
- Survey Copilot: **Automatic calculation!**

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
