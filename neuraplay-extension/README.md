# NeuraPlay Browser Extension

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![AI Coaching](https://img.shields.io/badge/AI-Coaching-orange)

## 🎮 Overview

NeuraPlay Browser Extension automatically analyzes your gaming statistics from popular gaming websites and provides real-time AI coaching advice. Get instant feedback on your League of Legends and FIFA/EA FC gameplay without leaving your browser.

## ✨ Features

- 🤖 **Automatic Game Detection** - Recognizes League of Legends and FIFA stats pages
- 📊 **Real-time Analysis** - Instant AI coaching based on your game statistics
- 🎯 **Smart Scraping** - Extracts key metrics from gaming websites
- 📱 **In-Page Overlay** - Displays coaching advice directly on the page
- 🔗 **Multi-Site Support** - Works with OP.GG, U.GG, and Futbin

## 🚀 Installation

### Prerequisites

- Google Chrome browser (or any Chromium-based browser)
- NeuraPlay backend service running


## Manual Installation

```bash
    # Clone the repository
    git clone https://github.com/Oluwaseyi89/neuraplay-cloudrun.git
    cd neuraplay-cloudrun/neuraplay-extension
```
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked"
4. Select the `neuraplay-extension` folder
5. The extension will be installed and ready to use

## 🎯 Supported Websites

### League of Legends
- **OP.GG** - Match history and player statistics
- **U.GG** - Performance metrics and rankings

### FIFA/EA FC
- **Futbin.com** - Player stats and team analysis


## 🏗️ Extension Architecture

```
    neuraplay-extension/
    ├── manifest.json          # Extension configuration
    ├── popup/
    │   └── popup.html        # Extension popup interface
    ├── content/
    │   ├── content.js        # Page scraping & analysis
    │   └── content.css       # Overlay styling
    ├── background/
    │   └── background.js     # Background service worker
    └── icons/
        ├── icon16.png        # Extension icons
        ├── icon48.png
        └── icon128.png
```

## ⚙️ Permissions

The extension requires:

- **activeTab** - Access current tab for game data scraping
- **storage** - Store user preferences and settings
- **scripting** - Execute content scripts on gaming sites
- Host permissions for OP.GG, U.GG, and Futbin domains

## 🎮 How It Works

### Automatic Analysis
1. **Visit Supported Site** - Navigate to OP.GG, U.GG, or Futbin
2. **Auto-Detection** - Extension detects the game and page type
3. **Data Extraction** - Scrapes relevant game statistics
4. **AI Processing** - Sends data to NeuraPlay AI backend
5. **Coaching Display** - Shows analysis overlay with tips and rating

### Manual Analysis
1. **Click Extension Icon** - Open the NeuraPlay popup
2. **Trigger Analysis** - Manually start analysis for current page
3. **Get Results** - Receive AI coaching advice instantly

## 📊 Data Extraction

### League of Legends Metrics
- **KDA Ratio** - Kill/Death/Assist performance
- **CS Score** - Creep Score and farming efficiency
- **Vision Control** - Ward placement and map awareness
- **Damage Output** - Combat effectiveness
- **Gold Efficiency** - Resource management

### FIFA/EA FC Metrics
- **Possession** - Ball control and game dominance
- **Shooting** - Attack efficiency and finishing
- **Passing** - Build-up play and distribution
- **Defending** - Tackling and defensive organization
- **Match Score** - Overall performance rating

## 🎨 User Interface

### Analysis Overlay
- **Summary** - Overall performance assessment
- **Top Tips** - Actionable improvement suggestions
- **Performance Rating** - 1-10 score with confidence percentage
- **Auto-dismiss** - Closes after 30 seconds or manual close

### Styling Features
- **Non-intrusive** - Appears as overlay without disrupting browsing
- **Responsive Design** - Adapts to different screen sizes
- **Professional Look** - Matches NeuraPlay brand colors and design