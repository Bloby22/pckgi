class HttpClient {
  constructor(timeout = 5000, retries = 2) {
    this.timeout = timeout;
    this.retries = retries;
  }

  async get(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    const fetchOptions = {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'npm-scanner/1.0',
        ...options.headers
      }
    };

    let lastError;
    
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { data, status: response.status };
      } catch (error) {
        lastError = error;
        clearTimeout(timeoutId);
        
        if (attempt === this.retries || error.name === 'AbortError') {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
    
    throw lastError;
  }
}

class ResultCache {
  constructor(ttl = 5 * 60 * 1000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

const utils = {
  calculateHealth(daysSinceUpdate, downloads, isDeprecated, hasVulnerabilities = false) {
    if (isDeprecated) return { status: 'deprecated', score: 0 };
    if (hasVulnerabilities) return { status: 'vulnerable', score: 20 };
    
    let score = 100;
    
    if (daysSinceUpdate > 1095) score -= 60;
    else if (daysSinceUpdate > 730) score -= 40;  
    else if (daysSinceUpdate > 365) score -= 20;
    
    if (downloads < 10) score -= 30;
    else if (downloads < 100) score -= 15;
    else if (downloads < 1000) score -= 5;
    
    if (score >= 80) return { status: 'excellent', score };
    if (score >= 60) return { status: 'good', score };
    if (score >= 40) return { status: 'fair', score };
    if (score >= 20) return { status: 'poor', score };
    return { status: 'critical', score };
  },

  calculatePopularityScore(downloads) {
    if (downloads >= 1000000) return 100;
    if (downloads >= 100000) return 90;
    if (downloads >= 10000) return 80;
    if (downloads >= 1000) return 70;
    if (downloads >= 100) return 60;
    if (downloads >= 10) return 50;
    return 30;
  },

  calculateMaintenanceScore(daysSinceUpdate, totalVersions) {
    let score = 100;
    
    if (daysSinceUpdate > 730) score = 30;
    else if (daysSinceUpdate > 365) score = 60;
    else if (daysSinceUpdate > 180) score = 80;
    else if (daysSinceUpdate > 90) score = 90;
    
    if (totalVersions < 3) score -= 10;
    
    return Math.max(0, score);
  },

  formatNumber(num) {
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  },

  parseVersion(version) {
    const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?(?:\+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?$/;
    const match = version?.match(semverRegex);
    
    if (!match) return null;
    
    return {
      major: parseInt(match[1]),
      minor: parseInt(match[2]),
      patch: parseInt(match[3]),
      prerelease: match[4] || null,
      build: match[5] || null,
      isStable: !match[4]
    };
  }
};

class NPMScanner {
  constructor(options = {}) {
    this.client = new HttpClient(options.timeout, options.retries);
    this.cache = new ResultCache(options.cacheTtl);
    this.registryUrl = options.registryUrl || 'https://registry.npmjs.org';
    this.apiUrl = options.apiUrl || 'https://api.npmjs.org';
  }

  async search(query, options = {}) {
    const {
      limit = 10,
      quality = 0.5,
      popularity = 0.5,
      maintenance = 0.5,
      includeUnstable = false
    } = options;

    const cacheKey = `search:${query}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = new URL(`${this.registryUrl}/-/v1/search`);
      url.searchParams.set('text', query);
      url.searchParams.set('size', Math.min(limit, 250));
      url.searchParams.set('quality', quality);
      url.searchParams.set('popularity', popularity);
      url.searchParams.set('maintenance', maintenance);

      const { data } = await this.client.get(url.toString());
      
      let results = data.objects?.map(obj => {
        const pkg = obj.package;
        const versionInfo = utils.parseVersion(pkg.version);
        
        return {
          name: pkg.name,
          description: pkg.description || 'No description available',
          version: pkg.version,
          versionInfo,
          author: pkg.author?.name || pkg.publisher?.username || 'Unknown',
          keywords: pkg.keywords || [],
          license: pkg.license || 'Unknown',
          date: pkg.date,
          downloads: pkg.downloads || 0,
          score: {
            final: obj.score.final,
            quality: obj.score.detail.quality,
            popularity: obj.score.detail.popularity,
            maintenance: obj.score.detail.maintenance
          },
          links: pkg.links || {},
          publishedAt: pkg.date
        };
      }) || [];

      if (!includeUnstable) {
        results = results.filter(pkg => pkg.versionInfo?.isStable !== false);
      }

      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async scan(packageName, options = {}) {
    const { includeDownloads = true, includeDependencies = true } = options;
    
    const cacheKey = `scan:${packageName}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const promises = [
        this.client.get(`${this.registryUrl}/${encodeURIComponent(packageName)}`)
      ];

      if (includeDownloads) {
        promises.push(
          this.client.get(`${this.apiUrl}/downloads/point/last-week/${encodeURIComponent(packageName)}`).catch(() => null),
          this.client.get(`${this.apiUrl}/downloads/point/last-month/${encodeURIComponent(packageName)}`).catch(() => null)
        );
      }

      const results = await Promise.all(promises);
      const { data: packageData } = results[0];
      const weekDownloads = results[1]?.data?.downloads || 0;
      const monthDownloads = results[2]?.data?.downloads || 0;

      const latest = packageData['dist-tags']?.latest;
      const versionInfo = packageData.versions?.[latest];
      
      if (!latest || !versionInfo) {
        throw new Error('Package has no valid versions');
      }

      const lastUpdate = new Date(packageData.time?.[latest]);
      const createdAt = new Date(packageData.time?.created);
      const daysSinceUpdate = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
      const packageAge = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      const dependencies = versionInfo.dependencies || {};
      const devDependencies = versionInfo.devDependencies || {};
      const peerDependencies = versionInfo.peerDependencies || {};
      
      const isDeprecated = Boolean(versionInfo.deprecated);
      const totalVersions = Object.keys(packageData.versions || {}).length;
      const health = utils.calculateHealth(daysSinceUpdate, weekDownloads, isDeprecated);
      const popularityScore = utils.calculatePopularityScore(weekDownloads);
      const maintenanceScore = utils.calculateMaintenanceScore(daysSinceUpdate, totalVersions);
      const qualityScore = health.score;

      const result = {
        name: packageData.name,
        version: latest,
        versionInfo: utils.parseVersion(latest),
        description: packageData.description || versionInfo.description || 'No description',
        author: versionInfo?.author?.name || packageData.author?.name || 'Unknown',
        license: versionInfo?.license || packageData.license || 'Unknown',
        
        date: lastUpdate.toISOString(),
        createdAt: createdAt.toISOString().split('T')[0],
        lastUpdate: lastUpdate.toISOString().split('T')[0],
        daysSinceUpdate,
        packageAge,

        downloads: {
          weekly: weekDownloads,
          monthly: monthDownloads
        },

        health: {
          quality: qualityScore / 100,
          popularity: popularityScore / 100,
          maintenance: maintenanceScore / 100
        },


        size: 0,
        gzip: 0,
        vulnerabilities: [],

        score: {
          final: ((qualityScore + popularityScore + maintenanceScore) / 300),
          quality: qualityScore / 100,
          popularity: popularityScore / 100,
          maintenance: maintenanceScore / 100
        },
        
        deprecated: isDeprecated,
        deprecatedMessage: versionInfo.deprecated || null,

        totalVersions,
        dependencies: Object.keys(dependencies).length > 0 ? 
          Object.entries(dependencies).map(([name, version]) => ({
            name,
            version
          })) : [],

        maintainers: packageData.maintainers || [],
        keywords: packageData.keywords || versionInfo.keywords || [],
        homepage: versionInfo.homepage || packageData.homepage,
        repository: versionInfo.repository || packageData.repository,
        bugs: versionInfo.bugs || packageData.bugs,

        links: {
          npm: `https://www.npmjs.com/package/${packageData.name}`,
          homepage: versionInfo.homepage || packageData.homepage,
          repository: typeof (versionInfo.repository || packageData.repository) === 'object' 
            ? (versionInfo.repository || packageData.repository).url 
            : (versionInfo.repository || packageData.repository)
        },

        bundleInfo: {
          hasTypes: Boolean(versionInfo.types || versionInfo.typings),
          main: versionInfo.main,
          module: versionInfo.module,
          exports: versionInfo.exports,
          files: versionInfo.files?.length || 0
        }
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (error.message.includes('HTTP 404')) {
        throw new Error(`Package '${packageName}' not found in NPM registry`);
      }
      throw new Error(`Scan failed: ${error.message}`);
    }
  }

  async compare(packageNames, options = {}) {
    try {
      const results = await Promise.allSettled(
        packageNames.map(name => this.scan(name, options))
      );
      
      return results
        .map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          }
          console.error(`Failed to fetch ${packageNames[index]}: ${result.reason.message}`);
          return null;
        })
        .filter(Boolean);
    } catch (error) {
      throw new Error(`Comparison failed: ${error.message}`);
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

const createScanner = (options = {}) => new NPMScanner(options);

export { NPMScanner, createScanner, utils };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NPMScanner, createScanner, utils };
}
