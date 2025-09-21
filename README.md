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

### Compare packages
```bash
pckgi compare react,vue,angular
pckgi compare lodash,underscore,ramda --json
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
| `compare <pkg1,pkg2,...>` | `comp`, `c` | Compare multiple packages |
| `trending` | `t` | Show trending packages |

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output results in JSON format |
| `--limit=N` | Limit number of results (default: 10) |
| `--no-cache` | Skip cache and fetch fresh data |
| `--include-unstable` | Include pre-release versions |
| `--debug` | Show debug information |
| `--help`, `-h` | Show help information |
| `--version`, `-v` | Show version |

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

### Package comparison
```bash
$ pckgi compare react,vue,angular

⚖️ Comparing: react, vue, angular

Package │ Version │ Health      │ Downloads/week │ Last Update │ Dependencies
────────┼─────────┼─────────────┼────────────────┼─────────────┼─────────────
react   │ v19.1.1 │ 🟢 excellent│ 44.5M          │ 1 month ago │ 0
vue     │ v3.5.13 │ 🟢 excellent│ 4.8M           │ 2 weeks ago │ 5
angular │ v19.1.5 │ 🟢 excellent│ 3.2M           │ 1 week ago  │ 0
```

### JSON output for automation
```bash
$ pckgi scan express --json | jq '.health'
"excellent"

$ pckgi search "test framework" --json --limit=3 | jq '.[].name'
"jest"
"mocha" 
"jasmine"
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
# Clone repository
git clone https://github.com/bloby22/pckgi.git
cd pckgi

# Install dependencies
npm install

# Link for development
npm link

# Run tests
npm test

# Debug mode
pckgi search react --debug
```

## Requirements

- Node.js >= 14.0.0
- NPM or Yarn

## Performance

- **Fast searches** - Parallel API calls with intelligent caching
- **Optimized output** - Minimal dependencies, native terminal colors
- **Memory efficient** - Streaming JSON parsing, garbage collection friendly
- **Network resilient** - Automatic retries, timeout handling

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Changelog

### v1.0.0
- Initial release
- Package search and analysis
- Health scoring system
- Package comparison
- Trending packages discovery
- JSON export support
- Modern ES modules architecture

---

**Built with ❤️ for the JavaScript community**

For issues and feature requests, please visit [GitHub Issues](https://github.com/bloby22/pckgi/issues).