/**
 * Moderní NPM balíček scanner s fetch API a lepším error handlingem
 */

/**
 * HTTP klient s retry logikou a timeout
 */
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
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { data, status: response.status };
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retries || error.name === 'AbortError') {
          break;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      } finally {
        clearTimeout(timeoutId);
      }
    }
    
    throw lastError;
  }
}

/**
 * Cache pro výsledky
 */
class ResultCache {
  constructor(ttl = 5 * 60 * 1000) { // 5 minut
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

/**
 * Utility funkce pro výpočty
 */
const utils = {
  /**
   * Vypočítá zdraví balíčku na základě různých metrik
   */
  calculateHealth(daysSinceUpdate, downloads, isDeprecated, hasVulnerabilities = false) {
    if (isDeprecated) return { status: 'deprecated', score: 0 };
    if (hasVulnerabilities) return { status: 'vulnerable', score: 20 };
    
    let score = 100;
    
    // Penalizace za staré balíčky
    if (daysSinceUpdate > 1095) score -= 60; // 3+ roky
    else if (daysSinceUpdate > 730) score -= 40; // 2+ roky  
    else if (daysSinceUpdate > 365) score -= 20; // 1+ rok
    
    // Penalizace za nízké stažení
    if (downloads < 10) score -= 30;
    else if (downloads < 100) score -= 15;
    else if (downloads < 1000) score -= 5;
    
    if (score >= 80) return { status: 'excellent', score };
    if (score >= 60) return { status: 'good', score };
    if (score >= 40) return { status: 'fair', score };
    if (score >= 20) return { status: 'poor', score };
    return { status: 'critical', score };
  },

  /**
   * Formátuje čísla pro lepší čitelnost
   */
  formatNumber(num) {
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  },

  /**
   * Parsuje a validuje semantic versioning
   */
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
      isStable: !match[4] // Bez prerelease tagu
    };
  }
};

/**
 * Hlavní NPM scanner třída
 */
class NPMScanner {
  constructor(options = {}) {
    this.client = new HttpClient(options.timeout, options.retries);
    this.cache = new ResultCache(options.cacheTtl);
    this.registryUrl = options.registryUrl || 'https://registry.npmjs.org';
    this.apiUrl = options.apiUrl || 'https://api.npmjs.org';
  }

  /**
   * Rychle vyhledá NPM balíčky s pokročilým filtrováním
   */
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
      url.searchParams.set('size', Math.min(limit, 250)); // NPM limit
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
          score: {
            final: Math.round(obj.score.final * 100),
            quality: Math.round(obj.score.detail.quality * 100),
            popularity: Math.round(obj.score.detail.popularity * 100),
            maintenance: Math.round(obj.score.detail.maintenance * 100)
          },
          links: pkg.links || {},
          publishedAt: pkg.date
        };
      }) || [];

      // Filtr nestabilních verzí
      if (!includeUnstable) {
        results = results.filter(pkg => pkg.versionInfo?.isStable !== false);
      }

      this.cache.set(cacheKey, results);
      return results;
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Detailní skenování balíčku s rozšířenými metrikami
   */
  async scan(packageName, options = {}) {
    const { includeDownloads = true, includeDependencies = true } = options;
    
    const cacheKey = `scan:${packageName}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      // Paralelní načtení dat
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

      // Časové výpočty
      const lastUpdate = new Date(packageData.time?.[latest]);
      const createdAt = new Date(packageData.time?.created);
      const daysSinceUpdate = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
      const packageAge = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      // Dependency analýza
      const dependencies = versionInfo.dependencies || {};
      const devDependencies = versionInfo.devDependencies || {};
      const peerDependencies = versionInfo.peerDependencies || {};
      
      // Zdraví balíčku
      const isDeprecated = Boolean(versionInfo.deprecated);
      const health = utils.calculateHealth(daysSinceUpdate, weekDownloads, isDeprecated);

      const result = {
        name: packageData.name,
        version: latest,
        versionInfo: utils.parseVersion(latest),
        description: packageData.description || versionInfo.description || 'No description',
        author: versionInfo?.author?.name || packageData.author?.name || 'Unknown',
        license: versionInfo?.license || packageData.license || 'Unknown',
        
        // Časové údaje
        createdAt: createdAt.toISOString().split('T')[0],
        lastUpdate: lastUpdate.toISOString().split('T')[0],
        daysSinceUpdate,
        packageAge,
        
        // Downloads
        downloads: {
          week: weekDownloads,
          month: monthDownloads,
          weekFormatted: utils.formatNumber(weekDownloads),
          monthFormatted: utils.formatNumber(monthDownloads)
        },
        
        // Zdraví a stav
        health: health.status,
        healthScore: health.score,
        deprecated: isDeprecated,
        deprecatedMessage: versionInfo.deprecated || null,
        
        // Verze a dependencies
        totalVersions: Object.keys(packageData.versions || {}).length,
        dependencies: {
          prod: Object.keys(dependencies).length,
          dev: Object.keys(devDependencies).length,
          peer: Object.keys(peerDependencies).length,
          total: Object.keys({...dependencies, ...devDependencies, ...peerDependencies}).length
        },
        
        // Metadata
        maintainers: packageData.maintainers?.length || 0,
        keywords: packageData.keywords || versionInfo.keywords || [],
        homepage: versionInfo.homepage || packageData.homepage,
        repository: versionInfo.repository || packageData.repository,
        bugs: versionInfo.bugs || packageData.bugs,
        
        // Bundle info
        bundleInfo: {
          hasTypes: Boolean(versionInfo.types || versionInfo.typings),
          main: versionInfo.main,
          module: versionInfo.module,
          exports: versionInfo.exports,
          files: versionInfo.files?.length || 0
        }
      };

      // Přidat dependency seznam pokud je požadován
      if (includeDependencies && Object.keys(dependencies).length > 0) {
        result.dependencyList = Object.entries(dependencies).map(([name, version]) => ({
          name,
          version,
          versionInfo: utils.parseVersion(version)
        }));
      }

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (error.message.includes('HTTP 404')) {
        throw new Error(`Package '${packageName}' not found in NPM registry`);
      }
      throw new Error(`Scan failed: ${error.message}`);
    }
  }

  /**
   * Porovná více balíčků najednou
   */
  async compare(packageNames, options = {}) {
    try {
      const results = await Promise.allSettled(
        packageNames.map(name => this.scan(name, options))
      );
      
      return packageNames.map((name, index) => {
        const result = results[index];
        return {
          name,
          success: result.status === 'fulfilled',
          data: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason.message : null
        };
      });
    } catch (error) {
      throw new Error(`Comparison failed: ${error.message}`);
    }
  }

  /**
   * Vyčistí cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Factory funkce pro jednodušší použití
const createScanner = (options = {}) => new NPMScanner(options);

// Exporty pro různé prostředí
export { NPMScanner, createScanner, utils };

// CommonJS kompatibilita
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NPMScanner, createScanner, utils };
}