#!/usr/bin/env node

import { createScanner, utils } from './index.js';
import { exec } from 'child_process';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

const emoji = {
  search: '🔍',
  scan: '📊',
  compare: '⚖️',
  package: '📦',
  install: '⬇️',
  update: '🔄',
  audit: '🛡️',
  stats: '📈',
  deps: '🔗',
  outdated: '⏰',
  size: '📏',
  history: '📜',
  export: '💾',
  backup: '💿',
  validate: '✔️',
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  deprecated: '💀',
  rocket: '🚀',
  fire: '🔥',
  star: '⭐',
  clock: '🕐',
  author: '👤',
  license: '📄',
  version: '🏷️',
  dependencies: '🔗',
  downloads: '📥',
  issues: '🐛',
  security: '🔒'
};

class ArgParser {
  constructor(args) {
    this.args = args;
    this.command = args[0];
    this.flags = new Map();
    this.positional = [];
    this.parse();
  }

  parse() {
    for (let i = 1; i < this.args.length; i++) {
      const arg = this.args[i];
      
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        this.flags.set(key, value || true);
      } else if (arg.startsWith('-')) {
        this.flags.set(arg.slice(1), true);
      } else {
        this.positional.push(arg);
      }
    }
  }

  has(flag) {
    return this.flags.has(flag);
  }

  get(flag, defaultValue = null) {
    return this.flags.get(flag) || defaultValue;
  }

  getPositional(index, defaultValue = null) {
    return this.positional[index] || defaultValue;
  }
}

class OutputFormatter {
  static formatSize(bytes) {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  static formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }

  static formatNumber(num) {
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  }

  static getHealthColor(status) {
    const colorMap = {
      excellent: 'green',
      good: 'green',
      fair: 'yellow',
      poor: 'yellow',
      critical: 'red',
      deprecated: 'red',
      vulnerable: 'red',
      high: 'green',
      medium: 'yellow',
      low: 'red'
    };
    return colorMap[status] || 'gray';
  }

  static getHealthEmoji(status) {
    const emojiMap = {
      excellent: '🟢',
      good: '✅',
      fair: '🟡',
      poor: '⚠️',
      critical: '🔴',
      deprecated: '💀',
      vulnerable: '🚨',
      high: '🟢',
      medium: '🟡',
      low: '🔴'
    };
    return emojiMap[status] || '⚪';
  }

  static createProgressBar(current, total, width = 20) {
    const percentage = Math.min(current / total, 1);
    const filled = Math.floor(percentage * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${bar} ${(percentage * 100).toFixed(1)}%`;
  }

  static createTable(headers, rows) {
    const colWidths = headers.map(header => header.length);
    
    rows.forEach(row => {
      row.forEach((cell, i) => {
        const cleanCell = cell.replace(/\x1b\[[0-9;]*m/g, '');
        colWidths[i] = Math.max(colWidths[i], cleanCell.length);
      });
    });

    const separator = '─'.repeat(colWidths.reduce((a, b) => a + b + 3, 0) - 2);
    const headerRow = headers.map((header, i) => header.padEnd(colWidths[i])).join(' │ ');
    
    let table = `┌${separator}┐\n`;
    table += `│ ${headerRow} │\n`;
    table += `├${separator}┤\n`;
    
    rows.forEach(row => {
      const rowStr = row.map((cell, i) => {
        const cleanCell = cell.replace(/\x1b\[[0-9;]*m/g, '');
        const padding = colWidths[i] - cleanCell.length;
        return cell + ' '.repeat(padding);
      }).join(' │ ');
      table += `│ ${rowStr} │\n`;
    });
    
    table += `└${separator}┘`;
    return table;
  }
}

class NPMCli {
  constructor() {
    this.scanner = createScanner({
      timeout: 10000,
      retries: 3,
      cacheTtl: 5 * 60 * 1000
    });
  }

  async run(args) {
    const parser = new ArgParser(args);
    
    if (!parser.command || parser.has('help') || parser.has('h')) {
      this.showHelp();
      return;
    }

    if (parser.has('version') || parser.has('v')) {
      await this.showVersion();
      return;
    }

    try {
      switch (parser.command) {
        case 'search':
        case 's':
          await this.handleSearch(parser);
          break;
        case 'scan':
        case 'info':
        case 'i':
          await this.handleScan(parser);
          break;
        case 'compare':
        case 'comp':
        case 'c':
          await this.handleCompare(parser);
          break;
        case 'trending':
        case 't':
          await this.handleTrending(parser);
          break;
        case 'audit':
        case 'a':
          await this.handleAudit(parser);
          break;
        case 'deps':
        case 'd':
          await this.handleDeps(parser);
          break;
        case 'outdated':
        case 'o':
          await this.handleOutdated(parser);
          break;
        case 'size':
          await this.handleSize(parser);
          break;
        case 'history':
        case 'h':
          await this.handleHistory(parser);
          break;
        case 'stats':
          await this.handleStats(parser);
          break;
        case 'export':
        case 'e':
          await this.handleExport(parser);
          break;
        case 'validate':
          await this.handleValidate(parser);
          break;
        case 'backup':
          await this.handleBackup(parser);
          break;
        default:
          console.error(c('red', `${emoji.error} Unknown command: ${parser.command}`));
          console.log(c('gray', 'Use --help to see available commands'));
          process.exit(1);
      }
    } catch (error) {
      console.error(c('red', `${emoji.error} ${error.message}`));
      if (parser.has('debug')) {
        console.error(c('gray', error.stack));
      }
      process.exit(1);
    }
  }

  showHelp() {
    console.log(c('blue', `${emoji.package} pckgi - Modern NPM Package Scanner\n`));
    
    console.log(c('bold', 'CORE COMMANDS:'));
    console.log(`  ${c('cyan', 'search, s')} <query>     ${c('gray', 'Search for packages')}`);
    console.log(`  ${c('cyan', 'scan, i')} <package>    ${c('gray', 'Detailed package analysis')}`);
    console.log(`  ${c('cyan', 'compare, c')} <pkg1,pkg2> ${c('gray', 'Compare multiple packages')}`);
    console.log(`  ${c('cyan', 'trending, t')}           ${c('gray', 'Show trending packages')}\n`);
    
    console.log(c('bold', 'ANALYSIS COMMANDS:'));
    console.log(`  ${c('cyan', 'audit, a')} [package]   ${c('gray', 'Security audit analysis')}`);
    console.log(`  ${c('cyan', 'deps, d')} <package>    ${c('gray', 'Dependency tree analysis')}`);
    console.log(`  ${c('cyan', 'outdated, o')} [package] ${c('gray', 'Check for outdated packages')}`);
    console.log(`  ${c('cyan', 'size')} <package>       ${c('gray', 'Bundle size analysis')}`);
    console.log(`  ${c('cyan', 'stats')} <package>      ${c('gray', 'Detailed package statistics')}`);
    console.log(`  ${c('cyan', 'history')} <package>    ${c('gray', 'Version history and changelog')}\n`);
    
    console.log(c('bold', 'UTILITY COMMANDS:'));
    console.log(`  ${c('cyan', 'export, e')} [format]   ${c('gray', 'Export data (json, csv, md)')}`);
    console.log(`  ${c('cyan', 'validate')} <package>   ${c('gray', 'Validate package integrity')}`);
    console.log(`  ${c('cyan', 'backup')}              ${c('gray', 'Backup package.json dependencies')}\n`);
    
    console.log(c('bold', 'OPTIONS:'));
    console.log(`  ${c('yellow', '--json')}              ${c('gray', 'Output in JSON format')}`);
    console.log(`  ${c('yellow', '--csv')}               ${c('gray', 'Output in CSV format')}`);
    console.log(`  ${c('yellow', '--markdown, --md')}    ${c('gray', 'Output in Markdown format')}`);
    console.log(`  ${c('yellow', '--limit=N')}           ${c('gray', 'Limit results (default: 10)')}`);
    console.log(`  ${c('yellow', '--depth=N')}           ${c('gray', 'Dependency depth (default: 3)')}`);
    console.log(`  ${c('yellow', '--no-cache')}          ${c('gray', 'Skip cache')}`);
    console.log(`  ${c('yellow', '--include-dev')}       ${c('gray', 'Include dev dependencies')}`);
    console.log(`  ${c('yellow', '--include-unstable')}  ${c('gray', 'Include pre-release versions')}`);
    console.log(`  ${c('yellow', '--output=file')}       ${c('gray', 'Save output to file')}`);
    console.log(`  ${c('yellow', '--verbose')}           ${c('gray', 'Show detailed information')}`);
    console.log(`  ${c('yellow', '--debug')}             ${c('gray', 'Show debug information')}`);
    console.log(`  ${c('yellow', '--help, -h')}          ${c('gray', 'Show this help')}`);
    console.log(`  ${c('yellow', '--version, -v')}       ${c('gray', 'Show version')}\n`);
    
    console.log(c('bold', 'EXAMPLES:'));
    console.log(c('gray', '  pckgi search react --limit=5'));
    console.log(c('gray', '  pckgi scan lodash --json --output=report.json'));
    console.log(c('gray', '  pckgi compare react,vue,angular --md'));
    console.log(c('gray', '  pckgi audit express --verbose'));
    console.log(c('gray', '  pckgi deps webpack --depth=2'));
    console.log(c('gray', '  pckgi size react --include-dev'));
    console.log(c('gray', '  pckgi trending --limit=20'));
    console.log(c('gray', '  pckgi export csv --output=packages.csv'));
  }

  async showVersion() {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const packageJson = JSON.parse(await readFile(join(__dirname, 'package.json'), 'utf-8'));
      console.log(c('blue', `${emoji.info} pckgi v${packageJson.version}`));
    } catch {
      console.log(c('blue', `${emoji.info} pckgi v2.0.0`));
    }
  }

  async handleSearch(parser) {
    const query = parser.getPositional(0);
    if (!query) throw new Error('Missing search query');
    
    const options = {
      limit: parseInt(parser.get('limit', '10')),
      includeUnstable: parser.has('include-unstable'),
      quality: parseFloat(parser.get('quality', '0.5')),
      popularity: parseFloat(parser.get('popularity', '0.5')),
      maintenance: parseFloat(parser.get('maintenance', '0.5'))
    };

    if (parser.has('no-cache')) this.scanner.clearCache();
    
    console.log(c('blue', `${emoji.search} Searching: ${query}`));
    const results = await this.scanner.search(query, options);
    
    await this.outputResults(results, parser, 'search');
  }

  async handleScan(parser) {
    const packageName = parser.getPositional(0);
    if (!packageName) throw new Error('Missing package name');
    
    const options = {
      includeDownloads: true,
      includeDependencies: !parser.has('no-deps'),
      includeVulnerabilities: true
    };

    if (parser.has('no-cache')) this.scanner.clearCache();
    
    console.log(c('blue', `${emoji.scan} Analyzing: ${packageName}`));
    const info = await this.scanner.scan(packageName, options);
    
    await this.outputResults(info, parser, 'scan');
  }

  async handleCompare(parser) {
    const packagesList = parser.getPositional(0);
    if (!packagesList) throw new Error('Missing package names (use comma-separated list)');
    
    const packages = packagesList.split(',').map(p => p.trim());
    if (packages.length < 2) throw new Error('Need at least 2 packages to compare');
    
    console.log(c('blue', `${emoji.compare} Comparing: ${packages.join(', ')}`));
    const results = await this.scanner.compare(packages);
    
    await this.outputResults(results, parser, 'compare');
  }

  async handleTrending(parser) {
    const limit = parseInt(parser.get('limit', '10'));
    const trendingQueries = ['react', 'vue', 'angular', 'nodejs', 'typescript', 'javascript'];
    const allResults = [];
    
    console.log(c('blue', `${emoji.fire} Fetching trending packages...`));
    
    for (const query of trendingQueries) {
      try {
        const results = await this.scanner.search(query, { limit: 5 });
        allResults.push(...results);
      } catch {}
    }
    
    const unique = new Map();
    allResults.forEach(pkg => {
      if (!unique.has(pkg.name)) unique.set(pkg.name, pkg);
    });
    
    const trending = Array.from(unique.values())
      .sort((a, b) => b.score.final - a.score.final)
      .slice(0, limit);
    
    await this.outputResults(trending, parser, 'trending');
  }

  async handleAudit(parser) {
    const packageName = parser.getPositional(0);
    console.log(c('blue', `${emoji.audit} Security audit${packageName ? `: ${packageName}` : ''}...`));
    
    if (packageName) {
      const auditInfo = await this.scanner.auditPackage(packageName);
      await this.outputResults(auditInfo, parser, 'audit');
    } else {
      try {
        const { stdout } = await execAsync('npm audit --json');
        const auditData = JSON.parse(stdout);
        await this.outputResults(auditData, parser, 'audit');
      } catch (error) {
        console.log(c('yellow', `${emoji.warning} No package.json found or npm audit failed`));
        console.log(c('gray', 'Try: pckgi audit <package-name>'));
      }
    }
  }

  async handleDeps(parser) {
    const packageName = parser.getPositional(0);
    if (!packageName) throw new Error('Missing package name');
    
    const depth = parseInt(parser.get('depth', '3'));
    const includeDev = parser.has('include-dev');
    
    console.log(c('blue', `${emoji.deps} Analyzing dependencies: ${packageName}`));
    const depsTree = await this.scanner.getDependencyTree(packageName, { depth, includeDev });
    
    await this.outputResults(depsTree, parser, 'deps');
  }

  async handleOutdated(parser) {
    const packageName = parser.getPositional(0);
    console.log(c('blue', `${emoji.outdated} Checking outdated packages${packageName ? `: ${packageName}` : ''}...`));
    
    if (packageName) {
      const outdatedInfo = await this.scanner.checkOutdated(packageName);
      await this.outputResults(outdatedInfo, parser, 'outdated');
    } else {
      try {
        const { stdout } = await execAsync('npm outdated --json');
        const outdatedData = JSON.parse(stdout);
        await this.outputResults(outdatedData, parser, 'outdated');
      } catch (error) {
        console.log(c('green', `${emoji.success} All packages are up to date!`));
      }
    }
  }

  async handleSize(parser) {
    const packageName = parser.getPositional(0);
    if (!packageName) throw new Error('Missing package name');
    
    console.log(c('blue', `${emoji.size} Analyzing bundle size: ${packageName}`));
    const sizeInfo = await this.scanner.getBundleSize(packageName, {
      includeDev: parser.has('include-dev')
    });
    
    await this.outputResults(sizeInfo, parser, 'size');
  }

  async handleHistory(parser) {
    const packageName = parser.getPositional(0);
    if (!packageName) throw new Error('Missing package name');
    
    const limit = parseInt(parser.get('limit', '10'));
    
    console.log(c('blue', `${emoji.history} Fetching version history: ${packageName}`));
    const history = await this.scanner.getVersionHistory(packageName, { limit });
    
    await this.outputResults(history, parser, 'history');
  }

  async handleStats(parser) {
    const packageName = parser.getPositional(0);
    if (!packageName) throw new Error('Missing package name');
    
    console.log(c('blue', `${emoji.stats} Collecting statistics: ${packageName}`));
    const stats = await this.scanner.getDetailedStats(packageName);
    
    await this.outputResults(stats, parser, 'stats');
  }

  async handleExport(parser) {
    const format = parser.getPositional(0) || 'json';
    const output = parser.get('output', `export.${format}`);
    
    console.log(c('blue', `${emoji.export} Exporting data in ${format} format...`));
    
    const data = await this.scanner.exportData(format);
    await writeFile(output, data);
    
    console.log(c('green', `${emoji.success} Data exported to: ${output}`));
  }

  async handleValidate(parser) {
    const packageName = parser.getPositional(0);
    if (!packageName) throw new Error('Missing package name');
    
    console.log(c('blue', `${emoji.validate} Validating package integrity: ${packageName}`));
    const validation = await this.scanner.validatePackage(packageName);
    
    await this.outputResults(validation, parser, 'validate');
  }

  async handleBackup(parser) {
    const output = parser.get('output', 'package-backup.json');
    
    console.log(c('blue', `${emoji.backup} Creating dependencies backup...`));
    
    try {
      const packageJson = JSON.parse(await readFile('package.json', 'utf-8'));
      const backup = {
        name: packageJson.name,
        version: packageJson.version,
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {},
        peerDependencies: packageJson.peerDependencies || {},
        timestamp: new Date().toISOString()
      };
      
      await writeFile(output, JSON.stringify(backup, null, 2));
      console.log(c('green', `${emoji.success} Backup created: ${output}`));
    } catch (error) {
      throw new Error('No package.json found in current directory');
    }
  }

  async outputResults(results, parser, type) {
    const format = this.getOutputFormat(parser);
    const output = parser.get('output');
    
    let formattedOutput;
    
    switch (format) {
      case 'json':
        formattedOutput = JSON.stringify(results, null, 2);
        break;
      case 'csv':
        formattedOutput = this.formatAsCSV(results, type);
        break;
      case 'markdown':
        formattedOutput = this.formatAsMarkdown(results, type);
        break;
      default:
        this.displayResults(results, type, parser);
        return;
    }
    
    if (output) {
      await writeFile(output, formattedOutput);
      console.log(c('green', `${emoji.success} Output saved to: ${output}`));
    } else {
      console.log(formattedOutput);
    }
  }

  getOutputFormat(parser) {
    if (parser.has('json')) return 'json';
    if (parser.has('csv')) return 'csv';
    if (parser.has('markdown') || parser.has('md')) return 'markdown';
    return 'console';
  }

  formatAsCSV(results, type) {
    if (!Array.isArray(results)) results = [results];
    
    const headers = Object.keys(results[0] || {});
    const rows = results.map(item => 
      headers.map(header => `"${String(item[header] || '').replace(/"/g, '""')}"`).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }

  formatAsMarkdown(results, type) {
    if (!Array.isArray(results)) results = [results];
    
    let md = `# Package Analysis Report\n\n`;
    md += `Generated: ${new Date().toISOString()}\n\n`;
    
    results.forEach((item, index) => {
      md += `## ${item.name || `Item ${index + 1}`}\n\n`;
      
      Object.entries(item).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          md += `**${key}:** ${JSON.stringify(value, null, 2)}\n\n`;
        } else {
          md += `**${key}:** ${value}\n\n`;
        }
      });
    });
    
    return md;
  }

  displayResults(results, type, parser) {
    switch (type) {
      case 'search':
        this.displaySearchResults(results, parser);
        break;
      case 'scan':
        this.displayPackageInfo(results);
        break;
      case 'compare':
        this.displayComparison(results);
        break;
      case 'trending':
        this.displayTrendingResults(results, parser);
        break;
      case 'audit':
        this.displayAuditResults(results);
        break;
      case 'deps':
        this.displayDependencyTree(results);
        break;
      case 'outdated':
        this.displayOutdatedResults(results);
        break;
      case 'size':
        this.displaySizeResults(results);
        break;
      case 'history':
        this.displayHistoryResults(results);
        break;
      case 'stats':
        this.displayStatsResults(results);
        break;
      case 'validate':
        this.displayValidationResults(results);
        break;
      default:
        console.log(JSON.stringify(results, null, 2));
    }
  }

  displaySearchResults(results, parser) {
    if (results.length === 0) {
      console.log(c('yellow', `${emoji.warning} No packages found`));
      return;
    }
    
    console.log(c('green', `\n${emoji.success} Found ${results.length} packages:\n`));
    
    results.forEach((pkg, i) => {
      const rank = c('dim', `${i + 1}.`.padEnd(3));
      const name = c('bold', pkg.name);
      const version = c('gray', `v${pkg.version}`);
      const score = this.formatScore(pkg.score);
      const author = pkg.author ? c('gray', ` by ${pkg.author}`) : '';
      
      console.log(`${rank} ${name} ${version} ${score}${author}`);
      console.log(c('dim', `   ${pkg.description?.slice(0, 80) || 'No description'}${pkg.description?.length > 80 ? '...' : ''}`));
      
      if (pkg.keywords?.length > 0) {
        const keywords = pkg.keywords.slice(0, 3).map(k => c('cyan', `#${k}`)).join(' ');
        console.log(c('dim', `   ${keywords}`));
      }
      
      if (parser.has('verbose')) {
        console.log(c('dim', `   ${emoji.downloads} ${OutputFormatter.formatNumber(pkg.downloads || 0)} weekly downloads`));
        console.log(c('dim', `   ${emoji.clock} Updated ${OutputFormatter.formatDate(pkg.date)}`));
      }
      
      console.log();
    });
  }

  displayPackageInfo(info) {
    const { name, version, description, date, health, popularity, maintenance, license, author, links } = info;
    
    console.log(`\n${c('bold', name)} ${c('gray', `v${version}`)}`);
    if (description) console.log(description);
    
    console.log('\n' + c('bold', 'Package Information:'));
    if (author) console.log(`${emoji.author} Author: ${author}`);
    if (license) console.log(`${emoji.license} License: ${license}`);
    if (date) console.log(`${emoji.clock} Updated: ${OutputFormatter.formatDate(date)}`);
    
    if (links) {
      console.log('\n' + c('bold', 'Links:'));
      if (links.homepage) console.log(`🏠 Homepage: ${links.homepage}`);
      if (links.repository) console.log(`📂 Repository: ${links.repository}`);
      if (links.npm) console.log(`📦 NPM: ${links.npm}`);
    }

    if (health) {
      console.log('\n' + c('bold', 'Health Metrics:'));
      console.log(`  Quality:     ${c(OutputFormatter.getHealthColor(health.quality), health.quality)} ${OutputFormatter.getHealthEmoji(health.quality)}`);
      console.log(`  Popularity:  ${c(OutputFormatter.getHealthColor(health.popularity), health.popularity)} ${OutputFormatter.getHealthEmoji(health.popularity)}`);
      console.log(`  Maintenance: ${c(OutputFormatter.getHealthColor(health.maintenance), health.maintenance)} ${OutputFormatter.getHealthEmoji(health.maintenance)}`);
    }

    if (info.dependencies?.length > 0) {
      console.log(`\n${c('bold', 'Dependencies')} (${info.dependencies.length}):`);
      info.dependencies.slice(0, 10).forEach(dep => {
        console.log(`  ${emoji.dependencies} ${dep.name} ${c('gray', `v${dep.version}`)}`);
      });
      
      if (info.dependencies.length > 10) {
        console.log(c('dim', `  ... and ${info.dependencies.length - 10} more`));
      }
    }

    if (info.vulnerabilities?.length > 0) {
      console.log(`\n${c('bold', 'Security Vulnerabilities')} (${info.vulnerabilities.length}):`);
      info.vulnerabilities.forEach(vuln => {
        const severity = c(OutputFormatter.getHealthColor(vuln.severity), vuln.severity.toUpperCase());
        console.log(`  ${emoji.security} ${vuln.title} - ${severity}`);
      });
    }
  }

  displayComparison(results) {
    console.log(`\n${c('bold', 'Package Comparison:')}\n`);
    
    const headers = ['Package', 'Version', 'Quality', 'Popularity', 'Maintenance', 'Score'];
    const rows = results.map(pkg => [
      c('bold', pkg.name),
      c('gray', `v${pkg.version}`),
      c(OutputFormatter.getHealthColor(pkg.score?.quality || 0), `${((pkg.score?.quality || 0) * 100).toFixed(1)}%`),
      c(OutputFormatter.getHealthColor(pkg.score?.popularity || 0), `${((pkg.score?.popularity || 0) * 100).toFixed(1)}%`),
      c(OutputFormatter.getHealthColor(pkg.score?.maintenance || 0), `${((pkg.score?.maintenance || 0) * 100).toFixed(1)}%`),
      c('yellow', `${((pkg.score?.final || 0) * 100).toFixed(1)}%`)
    ]);
    
    console.log(OutputFormatter.createTable(headers, rows));
    
    results.forEach(pkg => {
      console.log(`\n${c('bold', pkg.name)}:`);
      console.log(`  ${pkg.description?.slice(0, 100) || 'No description'}${pkg.description?.length > 100 ? '...' : ''}`);
      if (pkg.downloads) {
        console.log(`  ${emoji.downloads} ${OutputFormatter.formatNumber(pkg.downloads)} weekly downloads`);
      }
      if (pkg.size) {
        console.log(`  ${emoji.size} Bundle size: ${OutputFormatter.formatSize(pkg.size)}`);
      }
    });
  }

  displayTrendingResults(results, parser) {
    console.log(c('green', `\n${emoji.star} Trending packages:\n`));
    
    results.forEach((pkg, i) => {
      const rank = c('dim', `${i + 1}.`.padEnd(3));
      const name = c('bold', pkg.name);
      const version = c('gray', `v${pkg.version}`);
      const score = this.formatScore(pkg.score);
      
      console.log(`${rank} ${name} ${version} ${score}`);
      console.log(c('dim', `   ${pkg.description?.slice(0, 80) || 'No description'}${pkg.description?.length > 80 ? '...' : ''}`));
      
      if (pkg.keywords?.length > 0) {
        const keywords = pkg.keywords.slice(0, 3).map(k => c('cyan', `#${k}`)).join(' ');
        console.log(c('dim', `   ${keywords}`));
      }
      
      console.log();
    });
  }

  displayAuditResults(results) {
    console.log(`\n${c('bold', 'Security Audit Results:')}\n`);
    
    if (results.vulnerabilities?.length === 0) {
      console.log(c('green', `${emoji.success} No vulnerabilities found!`));
      return;
    }
    
    if (results.vulnerabilities) {
      const groupedVulns = results.vulnerabilities.reduce((acc, vuln) => {
        acc[vuln.severity] = (acc[vuln.severity] || 0) + 1;
        return acc;
      }, {});
      
      console.log(c('bold', 'Vulnerability Summary:'));
      Object.entries(groupedVulns).forEach(([severity, count]) => {
        const color = OutputFormatter.getHealthColor(severity);
        const emoji_type = OutputFormatter.getHealthEmoji(severity);
        console.log(`  ${emoji_type} ${severity.toUpperCase()}: ${c(color, count.toString())}`);
      });
      
      console.log(`\n${c('bold', 'Detailed Vulnerabilities:')}`);
      results.vulnerabilities.slice(0, 10).forEach((vuln, i) => {
        const severity = c(OutputFormatter.getHealthColor(vuln.severity), vuln.severity.toUpperCase());
        console.log(`\n${i + 1}. ${c('bold', vuln.title)} - ${severity}`);
        console.log(`   Package: ${vuln.module_name}`);
        console.log(`   Range: ${vuln.vulnerable_versions}`);
        if (vuln.recommendation) {
          console.log(`   Fix: ${c('green', vuln.recommendation)}`);
        }
      });
    }
  }

  displayDependencyTree(tree) {
    console.log(`\n${c('bold', 'Dependency Tree:')}\n`);
    
    const displayNode = (node, prefix = '', isLast = true) => {
      const connector = isLast ? '└── ' : '├── ';
      const name = c('bold', node.name);
      const version = c('gray', `@${node.version}`);
      
      console.log(`${prefix}${connector}${name}${version}`);
      
      if (node.dependencies && node.dependencies.length > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        node.dependencies.forEach((dep, index) => {
          const isLastDep = index === node.dependencies.length - 1;
          displayNode(dep, newPrefix, isLastDep);
        });
      }
    };
    
    if (Array.isArray(tree)) {
      tree.forEach((node, index) => {
        displayNode(node, '', index === tree.length - 1);
      });
    } else {
      displayNode(tree);
    }
  }

  displayOutdatedResults(results) {
    console.log(`\n${c('bold', 'Outdated Packages:')}\n`);
    
    if (Object.keys(results).length === 0) {
      console.log(c('green', `${emoji.success} All packages are up to date!`));
      return;
    }
    
    const headers = ['Package', 'Current', 'Wanted', 'Latest'];
    const rows = Object.entries(results).map(([name, info]) => [
      c('bold', name),
      c('red', info.current),
      c('yellow', info.wanted),
      c('green', info.latest)
    ]);
    
    console.log(OutputFormatter.createTable(headers, rows));
  }

  displaySizeResults(results) {
    console.log(`\n${c('bold', 'Bundle Size Analysis:')}\n`);
    
    console.log(`${emoji.size} Package: ${c('bold', results.name)}`);
    console.log(`📦 Minified: ${c('green', OutputFormatter.formatSize(results.size))}`);
    console.log(`🗜️  Gzipped: ${c('blue', OutputFormatter.formatSize(results.gzip))}`);
    
    if (results.dependencies) {
      console.log(`\n${c('bold', 'Size Breakdown:')}`);
      
      const sortedDeps = results.dependencies
        .sort((a, b) => b.size - a.size)
        .slice(0, 10);
      
      sortedDeps.forEach(dep => {
        const percentage = ((dep.size / results.size) * 100).toFixed(1);
        const bar = OutputFormatter.createProgressBar(dep.size, results.size, 15);
        console.log(`  ${c('bold', dep.name)}: ${OutputFormatter.formatSize(dep.size)} (${percentage}%)`);
        console.log(`    ${bar}`);
      });
    }
  }

  displayHistoryResults(results) {
    console.log(`\n${c('bold', 'Version History:')}\n`);
    
    if (results.versions) {
      results.versions.forEach((version, index) => {
        const isLatest = index === 0;
        const versionColor = isLatest ? 'green' : 'gray';
        const tag = isLatest ? c('green', ' [LATEST]') : '';
        
        console.log(`${emoji.version} ${c(versionColor, `v${version.version}`)}${tag}`);
        console.log(`   Released: ${OutputFormatter.formatDate(version.date)}`);
        
        if (version.changes && version.changes.length > 0) {
          console.log(`   Changes:`);
          version.changes.slice(0, 3).forEach(change => {
            console.log(`     • ${change}`);
          });
        }
        console.log();
      });
    }
  }

  displayStatsResults(results) {
    console.log(`\n${c('bold', 'Package Statistics:')}\n`);
    
    console.log(`${emoji.package} Package: ${c('bold', results.name)} v${results.version}`);
    console.log(`${emoji.downloads} Downloads: ${OutputFormatter.formatNumber(results.downloads?.weekly || 0)} weekly`);
    console.log(`${emoji.star} GitHub Stars: ${OutputFormatter.formatNumber(results.github?.stars || 0)}`);
    console.log(`${emoji.issues} Open Issues: ${results.github?.issues || 0}`);
    console.log(`${emoji.dependencies} Dependencies: ${results.dependenciesCount || 0}`);
    console.log(`${emoji.size} Bundle Size: ${OutputFormatter.formatSize(results.size?.minified || 0)}`);
    console.log(`${emoji.clock} Last Updated: ${OutputFormatter.formatDate(results.lastModified)}`);
    
    if (results.maintainers?.length > 0) {
      console.log(`\n${c('bold', 'Maintainers:')}`);
      results.maintainers.slice(0, 5).forEach(maintainer => {
        console.log(`  ${emoji.author} ${maintainer.name || maintainer.email}`);
      });
    }
    
    if (results.keywords?.length > 0) {
      console.log(`\n${c('bold', 'Keywords:')}`);
      const keywords = results.keywords.map(k => c('cyan', `#${k}`)).join(' ');
      console.log(`  ${keywords}`);
    }
  }

  displayValidationResults(results) {
    console.log(`\n${c('bold', 'Package Validation Results:')}\n`);
    
    const statusColor = results.valid ? 'green' : 'red';
    const statusEmoji = results.valid ? emoji.success : emoji.error;
    
    console.log(`${statusEmoji} Status: ${c(statusColor, results.valid ? 'VALID' : 'INVALID')}`);
    
    if (results.checks) {
      console.log(`\n${c('bold', 'Validation Checks:')}`);
      
      Object.entries(results.checks).forEach(([check, passed]) => {
        const checkEmoji = passed ? emoji.success : emoji.error;
        const checkColor = passed ? 'green' : 'red';
        const status = passed ? 'PASS' : 'FAIL';
        
        console.log(`  ${checkEmoji} ${check}: ${c(checkColor, status)}`);
      });
    }
    
    if (results.issues?.length > 0) {
      console.log(`\n${c('bold', 'Issues Found:')}`);
      results.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${c('red', issue)}`);
      });
    }
    
    if (results.suggestions?.length > 0) {
      console.log(`\n${c('bold', 'Suggestions:')}`);
      results.suggestions.forEach((suggestion, index) => {
        console.log(`  ${index + 1}. ${c('yellow', suggestion)}`);
      });
    }
  }

  formatScore(score) {
    if (!score) return '';
    const final = (score.final * 100).toFixed(1);
    const color = final >= 80 ? 'green' : final >= 60 ? 'yellow' : 'red';
    return c(color, `[${final}%]`);
  }
}

const cli = new NPMCli();
await cli.run(process.argv.slice(2));
