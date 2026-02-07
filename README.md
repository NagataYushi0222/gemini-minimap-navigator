# Gemini Minimap Navigator

A Chrome extension that adds a minimap navigation sidebar to Google Gemini, making it easy to navigate through long conversations.

## Features

- 🗺️ **Visual Minimap** - Shows a visual overview of your conversation
- 🔍 **Quick Navigation** - Click any block to jump to that message
- 🎨 **Customizable Colors** - Set custom colors for user and AI messages
- 🎬 **GIF Backgrounds** - Add animated GIF backgrounds to message blocks (animates on hover)
- 🌓 **Dark/Light Mode** - Matches your Gemini theme
- 📏 **Adjustable Size** - Control width and opacity
- 💬 **Tooltip Preview** - Hover to see message preview

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/gemini-minimap-navigator.git
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Open Chrome and navigate to `chrome://extensions/`

4. Enable "Developer mode" (toggle in top right)

5. Click "Load unpacked" and select the `dist` folder

### Manual Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project folder

## Usage

1. Go to [gemini.google.com](https://gemini.google.com)
2. The minimap will appear on the right side of the screen
3. Click the extension icon to open settings
4. Customize colors, opacity, and GIF backgrounds

## Settings

| Setting | Description |
|---------|-------------|
| Dark Mode | Toggle dark/light theme |
| Width | Minimap width (40-120px) |
| Opacity | Minimap transparency (20-100%) |
| Tooltip Opacity | Message preview transparency (20-100%) |
| User Block Color | Color for user messages |
| AI Block Color | Color for AI responses |
| User GIF | GIF URL for user message hover effect |
| AI GIF | GIF URL for AI response hover effect |

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch for changes
npm run watch
```

## License

MIT License
