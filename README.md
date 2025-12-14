# Legal Description Plotter

AI-powered legal description parser and CAD exporter for land surveyors.

## Features

- **Multiple Input Methods**: Paste text, upload images (photos, scans), or PDFs
- **AI-Powered Parsing**: Extracts bearings, distances, curves, and monuments
- **Multiple Parcel Support**: Parse descriptions with multiple parcels, view separately or combined
- **Closure Analysis**: Calculates error distance and precision ratio
- **Area Calculation**: Computes area and compares to called area
- **Visual Plot**: Interactive boundary visualization
- **Multiple Export Formats**:
  - DXF for CAD software (AutoCAD, Carlson, Civil 3D)
  - Word document with legal text and calls table
  - CSV spreadsheet of line calls
  - Copy cleaned text to clipboard

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
