#!/usr/bin/env node

import { createScanner, utils } from './index.js';
import { exec } from 'child_process';
import { readFile, mkdir } from 'fs/promises';
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
  dependencies: '🔗'
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

  static getHealthColor(status) {
    const colorMap = {
      excellent: 'green',
      good: 'green',
      fair: 'yellow',
      poor: 'yellow',
      critical: 'red',
      deprecated: 'red',
      vulnerable: 'red'
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
      vulnerable: '🚨'
    };
    return emojiMap[status] || '⚪';
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
    console.log(c('bold', 'COMMANDS:'));
    console.log(`  ${c('cyan', 'search, s')} <query>     ${c('gray', 'Search for packages')}`);
    console.log(`  ${c('cyan', 'scan, i')} <package>    ${c('gray', 'Detailed package analysis')}`);
    console.log(`  ${c('cyan', 'compare, c')} <pkg1,pkg2> ${c('gray', 'Compare multiple packages')}`);
    console.log(`  ${c('cyan', 'trending, t')}           ${c('gray', 'Show trending packages')}\n`);
    console.log(c('bold', 'OPTIONS:'));
    console.log(`  ${c('yellow', '--json')}              ${c('gray', 'Output in JSON format')}`);
    console.log(`  ${c('yellow', '--limit=N')}           ${c('gray', 'Limit search results (default: 10)')}`);
    console.log(`  ${c('yellow', '--no-cache')}          ${c('gray', 'Skip cache')}`);
    console.log(`  ${c('yellow', '--include-unstable')}  ${c('gray', 'Include pre-release versions')}`);
    console.log(`  ${c('yellow', '--debug')}             ${c('gray', 'Show debug information')}`);
    console.log(`  ${c('yellow', '--help, -h')}          ${c('gray', 'Show this help')}`);
    console.log(`  ${c('yellow', '--version, -v')}       ${c('gray', 'Show version')}\n`);
    console.log(c('bold', 'EXAMPLES:'));
    console.log(c('gray', '  pckgi search react --limit=5'));
    console.log(c('gray', '  pckgi scan lodash --json'));
    console.log(c('gray', '  pckgi compare react,vue,angular'));
    console.log(c('gray', '  pckgi trending --limit=20'));
  }

  async showVersion() {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const packageJson = JSON.parse(await readFile(join(__dirname, 'package.json'), 'utf-8'));
      console.log(c('blue', `${emoji.info} pckgi v${packageJson.version}`));
    } catch {
      console.log(c('blue', `${emoji.info} pckgi v1.0.0`));
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
    if (parser.has('json')) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    if (results.length === 0) {
      console.log(c('yellow', `${emoji.warning} No packages found for "${query}"`));
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
      console.log(c('dim', `   ${pkg.description.slice(0, 80)}${pkg.description.length > 80 ? '...' : ''}`));
      if (pkg.keywords?.length > 0) {
        const keywords = pkg.keywords.slice(0, 3).map(k => c('cyan', `#${k}`)).join(' ');
        console.log(c('dim', `   ${keywords}`));
      }
      console.log();
    });
  }

  async handleScan(parser) {
    const packageName = parser.getPositional(0);
    if (!packageName) throw new Error('Missing package name');
    const options = {
      includeDownloads: true,
      includeDependencies: !parser.has('no-deps')
    };
    if (parser.has('no-cache')) this.scanner.clearCache();
    console.log(c('blue', `${emoji.scan} Analyzing: ${packageName}`));
    const info = await this.scanner.scan(packageName, options);
    if (parser.has('json')) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }
    this.displayPackageInfo(info);
  }

  async handleCompare(parser) {
    const packagesList = parser.getPositional(0);
    if (!packagesList) throw new Error('Missing package names (use comma-separated list)');
    const packages = packagesList.split(',').map(p => p.trim());
    if (packages.length < 2) throw new Error('Need at least 2 packages to compare');
    console.log(c('blue', `${emoji.compare} Comparing: ${packages.join(', ')}`));
    const results = await this.scanner.compare(packages);
    if (parser.has('json')) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    this.displayComparison(results);
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
    if (parser.has('json')) {
      console.log(JSON.stringify(trending, null, 2));
      return;
    }
    console.log(c('green', `\n${emoji.star} Trending packages:\n`));
    trending.forEach((pkg, i) => {
      const rank = c('dim', `${i + 1}.`.padEnd(3));
      const name = c('bold', pkg.name);
      const version = c('gray', `v${pkg.version}`);
      const score = this.formatScore(pkg.score);
      console.log(`${rank} ${name} ${version} ${score}`);
      console.log(c('dim', `   ${pkg.description.slice(0, 80)}${pkg.description.length > 80 ? '...' : ''}`));
      if (pkg.keywords?.length > 0) {
        const keywords = pkg.keywords.slice(0, 3).map(k => c('cyan', `#${k}`)).join(' ');
        console.log(c('dim', `   ${keywords}`));
      }
      console.log();
    });
  }

  formatScore(score) {
    if (!score) return '';
    const final = (score.final * 100).toFixed(1);
    return c('yellow', `[${final}%]`);
  }

  displayPackageInfo(info) {
    const { name, version, description, date, health, popularity, maintenance, license, author, links } = info;
    console.log(`${c('bold', name)} ${c('gray', `v${version}`)}`);
    if (description) console.log(description);
    if (author) console.log(`${emoji.author} Author: ${author}`);
    if (license) console.log(`${emoji.license} License: ${license}`);
    if (date) console.log(`${emoji.clock} Updated: ${OutputFormatter.formatDate(date)}`);
    if (links?.homepage) console.log(`🏠 Homepage: ${links.homepage}`);
    if (links?.repository) console.log(`📂 Repository: ${links.repository}`);
    if (links?.npm) console.log(`📦 NPM: ${links.npm}`);

    console.log('\nHealth:');
    console.log(`  Quality:     ${c(OutputFormatter.getHealthColor(health.quality), health.quality)} ${OutputFormatter.getHealthEmoji(health.quality)}`);
    console.log(`  Popularity:  ${c(OutputFormatter.getHealthColor(health.popularity), health.popularity)} ${OutputFormatter.getHealthEmoji(health.popularity)}`);
    console.log(`  Maintenance: ${c(OutputFormatter.getHealthColor(health.maintenance), health.maintenance)} ${OutputFormatter.getHealthEmoji(health.maintenance)}`);

    if (info.dependencies) {
      console.log(`\nDependencies (${info.dependencies.length}):`);
      info.dependencies.forEach(dep => {
        console.log(`  - ${dep.name} v${dep.version}`);
      });
    }
  }

  displayComparison(results) {
    results.forEach(pkg => {
      console.log(`${c('bold', pkg.name)} v${pkg.version}`);
      console.log(`  Quality:     ${c(OutputFormatter.getHealthColor(pkg.score.quality), (pkg.score.quality * 100).toFixed(1) + '%')}`);
      console.log(`  Popularity:  ${c(OutputFormatter.getHealthColor(pkg.score.popularity), (pkg.score.popularity * 100).toFixed(1) + '%')}`);
      console.log(`  Maintenance: ${c(OutputFormatter.getHealthColor(pkg.score.maintenance), (pkg.score.maintenance * 100).toFixed(1) + '%')}`);
      console.log();
    });
  }
}

(async () => {
  const cli = new NPMCli();
  await cli.run(process.argv.slice(2));
})();
