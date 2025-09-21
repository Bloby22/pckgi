# pckgi

> Modern NPM package scanner and analyzer CLI tool

A fast, intelligent command-line tool for searching, analyzing, and comparing NPM packages with advanced health scoring and beautiful terminal output.

## Features

- **Smart Search** - Find packages with quality, popularity, and maintenance scoring
- **Health Analysis** - Comprehensive package health evaluation with scoring system
- **Package Comparison** - Side-by-side comparison of multiple packages
- **Trending Packages** - Discover popular and trending packages
- **Rich Output** - Beautiful terminal output with colors and emojis
- **JSON Export** - Machine-readable output for automation
- **Fast & Cached** - Intelligent caching for improved performance
- **Modern Architecture** - Built with ES modules and native fetch API

## Installation

```bash
npm install -g pckgi
```

## Usage

### Search packages
```bash
pckgi search react
pckgi search "date manipulation" --limit=5
pckgi search typescript --include-unstable
```

### Analyze package health
```bash
pckgi scan lodash
pckgi info express --json
```

### Discover trending packages
```bash
pckgi trending
pckgi trending --limit=20
```

## Commands

| Command | Alias | Description |
|---------|--------|-------------|
| `search <query>` | `s` | Search for packages |
| `scan <package>` | `info`, `i` | Analyze package health |
| `trending` | `t` | Show trending packages |

## Examples

### Basic search
```bash
$ pckgi search lodash

🔍 Searching: lodash

✅ Found 10 packages:

1.  lodash v4.17.21 95%
    A modern JavaScript utility library delivering modularity, performance & extras.
    #util #functional #server #client #browser

2.  lodash.get v4.4.2 78%
    The lodash method `_.get` exported as a module.
    #lodash-modularized
```

### Package analysis
```bash
$ pckgi scan react

📊 Analyzing: react

📦 Package Analysis

HEALTH STATUS:
🟢 EXCELLENT (100/100)

BASIC INFO:
📦 react v19.1.1
ℹ️ React is a JavaScript library for building user interfaces.
👤 Meta
📄 MIT

STATISTICS:
📥 44.5M downloads/week
📥 194.4M downloads/month
🕐 Last update: 1 month ago
🏷️ 2507 total versions
🔗 0 dependencies (0 prod)

VERSION INFO:
🏷️ 19.1.1
✅ Stable release

BUNDLE INFO:
❌ TypeScript definitions
📄 Main: index.js
📦 ESM: index.js
```

### JSON output for automation
```bash
$ pckgi scan express --json
```

## Health Scoring System

Packages are evaluated based on multiple factors:

- **Download Statistics** - Weekly/monthly download counts
- **Maintenance** - Last update recency and frequency
- **Version Stability** - Semantic versioning compliance
- **Dependencies** - Dependency count and health
- **Community** - GitHub stars, maintainer count

### Health Levels

- 🟢 **Excellent** (80-100) - Actively maintained, popular, stable
- ✅ **Good** (60-79) - Well maintained, reliable
- 🟡 **Fair** (40-59) - Acceptable but may have issues
- ⚠️ **Poor** (20-39) - Outdated or low usage
- 🔴 **Critical** (0-19) - Deprecated or abandoned
- 💀 **Deprecated** - Officially deprecated
- 🚨 **Vulnerable** - Known security vulnerabilities

## API Integration

The scanner uses official NPM registry APIs:

- NPM Registry API - Package metadata
- NPM Download API - Download statistics
- Intelligent caching with 5-minute TTL
- Retry logic with exponential backoff
- Rate limiting and error handling

## Development

```bash
npm install pckgi
```

## Requirements

- Node.js >= 14.0.0
- NPM or Yarn

**Built with ❤️ for the JavaScript community**

For issues and feature requests, please visit [GitHub Issues](https://github.com/bloby22/pckgi/issues).
