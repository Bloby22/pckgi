# 📦 pckgi — Modern NPM Package Scanner

![pckgi logo](https://raw.githubusercontent.com/your-repo/pckgi/master/assets/logo.png)

---

## 🚀 Status

- Current version: **v1.1.3**
- Stable & actively maintained
- Supports full package scanning, search, comparison, auditing, and more
- Designed for speed, usability & detailed insights
- No known critical vulnerabilities
- CLI tool for developers who want quick NPM package analysis

---

## 🛠️ Tech Stack

- Node.js
- NPM Registry API
- Custom caching & retry logic
- CLI interface with intuitive commands & flags
- JSON, CSV & Markdown output support
- Async operations for fast network requests

---

## 💡 Overview

`pckgi` is a modern CLI tool to scan, analyze, compare, and audit NPM packages.  
It helps developers get detailed insights about packages without leaving the terminal.

---

## 📖 Usage & Commands

Run the CLI with a command or `pckgi help` to see all options.

### Core Commands

| Command            | Description                    | Alias       |
|--------------------|-------------------------------|-------------|
| `search <query>`    | Search for packages            | `s`         |
| `scan <package>`    | Detailed package analysis      | `i`         |
| `compare <pkg1,pkg2>`| Compare multiple packages     | `c`         |
| `trending`          | Show trending packages         | `t`         |

### Analysis Commands

| Command              | Description                       | Alias       |
|----------------------|---------------------------------|-------------|
| `audit [package]`    | Security audit analysis           | `a`         |
| `deps <package>`     | Dependency tree analysis          | `d`         |
| `outdated [package]` | Check for outdated packages       | `o`         |
| `size <package>`     | Bundle size analysis              | —           |
| `stats <package>`    | Detailed package statistics       | —           |
| `history <package>`  | Version history and changelog     | —           |

### Utility Commands

| Command               | Description                         | Alias       |
|-----------------------|-----------------------------------|-------------|
| `export [format]`      | Export data (json, csv, md)        | `e`         |
| `validate <package>`   | Validate package integrity          | —           |
| `backup`              | Backup package.json dependencies    | —           |
| `help`                | Show this help message              | —           |

---

## ⚙️ Options

| Flag                      | Description                          | Default     |
|---------------------------|------------------------------------|-------------|
| `--json`                  | Output in JSON format               | false       |
| `--csv`                   | Output in CSV format                | false       |
| `--markdown`, `--md`      | Output in Markdown format           | false       |
| `--limit=N`               | Limit results                      | 10          |
| `--depth=N`               | Dependency depth                   | 3           |
| `--no-cache`              | Skip cache                        | false       |
| `--include-dev`           | Include dev dependencies          | false       |
| `--include-unstable`      | Include pre-release versions      | false       |
| `--output=file`           | Save output to file               | —           |
| `--verbose`               | Show detailed information          | false       |
| `--debug`                 | Show debug information             | false       |
| `--help`, `-h`            | Show help                        | false       |
| `--version`, `-v`         | Show version                     | false       |

---

## 📚 Examples

```bash
pckgi search react --limit=5
pckgi scan lodash --json --output=report.json
pckgi compare react,vue,angular --md
pckgi audit express --verbose
pckgi deps webpack --depth=2
pckgi size react --include-dev
pckgi trending --limit=20
pckgi export csv --output=packages.csv
pckgi help
```

---

## 🛫 Installation
```bash
npm install pckgi
```
