import { Lead, CountyConfig } from "./base.js";
import * as suffolkNY from "./suffolk_ny.js";
import * as missouri from "./missouri.js";
import * as wisconsin from "./wisconsin.js";
import { scrapeAlabama } from "./alabama.js";
import { scrapeOhio } from "./ohio.js";

// Registry of scrapers by state+county
const SCRAPER_REGISTRY: Record<string, (fromDate: string, toDate: string) => Promise<Lead[]>> = {
  "Suffolk_NY": suffolkNY.scrapeAll,
  "Jackson_MO": async (f, t) => {
    const { scrapeAll } = await import("./missouri.js");
    return scrapeAll(f, t).then(leads => leads.filter(l => l.county === "Jackson"));
  },
  "Clay_MO": async (f, t) => {
    const { scrapeAll } = await import("./missouri.js");
    return scrapeAll(f, t).then(leads => leads.filter(l => l.county === "Clay"));
  },
  "Platte_MO": async (f, t) => {
    const { scrapeAll } = await import("./missouri.js");
    return scrapeAll(f, t).then(leads => leads.filter(l => l.county === "Platte"));
  },
  "Cass_MO": async (f, t) => {
    const { scrapeAll } = await import("./missouri.js");
    return scrapeAll(f, t).then(leads => leads.filter(l => l.county === "Cass"));
  },
  "Dane_WI": async (f, t) => {
    const { scrapeAll } = await import("./wisconsin.js");
    return scrapeAll(f, t).then(leads => leads.filter(l => l.county === "Dane"));
  },
  "Rock_WI": async (f, t) => {
    const { scrapeAll } = await import("./wisconsin.js");
    return scrapeAll(f, t).then(leads => leads.filter(l => l.county === "Rock"));
  },
  "Door_WI": async (f, t) => {
    const { scrapeAll } = await import("./wisconsin.js");
    return scrapeAll(f, t).then(leads => leads.filter(l => l.county === "Door"));
  },
};

// Run all scrapers for the configured counties
export async function runAllScrapers(
  counties: CountyConfig[],
  fromDate: string,
  toDate: string,
  onProgress?: (msg: string) => void
): Promise<{ leads: Lead[]; errors: string[] }> {
  const allLeads: Lead[] = [];
  const errors: string[] = [];
  
  // Deduplicate counties by state (e.g. all MO counties run together)
  const stateGroups = new Map<string, CountyConfig[]>();
  for (const county of counties) {
    const key = county.state;
    if (!stateGroups.has(key)) stateGroups.set(key, []);
    stateGroups.get(key)!.push(county);
  }
  
  for (const [state, stateCounties] of stateGroups) {
    // Run state-level scraper once (it handles all counties in that state)
    const stateKey = `ALL_${state}`;
    let stateScraper: ((f: string, t: string) => Promise<Lead[]>) | null = null;
    
    if (state === "MO") stateScraper = missouri.scrapeAll;
    else if (state === "WI") stateScraper = wisconsin.scrapeAll;
    else if (state === "NY") stateScraper = suffolkNY.scrapeAll;
    
    // AL and OH use county-by-county scrapers
    if (state === "AL" || state === "OH") {
      for (const county of stateCounties) {
        try {
          onProgress?.(`Scraping ${county.name} ${county.state}...`);
          const leads = state === "AL"
            ? await scrapeAlabama(county.name, fromDate, toDate)
            : await scrapeOhio(county.name, fromDate, toDate);
          allLeads.push(...leads);
          onProgress?.(`✓ ${county.name} ${county.state}: ${leads.length} leads`);
        } catch (e) {
          const msg = `Error scraping ${county.name} ${county.state}: ${(e as Error).message}`;
          errors.push(msg);
          onProgress?.(`✗ ${msg}`);
        }
      }
      continue;
    }
    
    if (stateScraper) {
      try {
        onProgress?.(`Scraping ${state} counties: ${stateCounties.map(c => c.name).join(", ")}...`);
        const leads = await stateScraper(fromDate, toDate);
        // Filter to only configured counties
        const configuredNames = new Set(stateCounties.map(c => c.name));
        const filtered = leads.filter(l => configuredNames.has(l.county));
        allLeads.push(...filtered);
        onProgress?.(`✓ ${state}: ${filtered.length} leads found`);
      } catch (e) {
        const msg = `Error scraping ${state}: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
    } else {
      // Try county-by-county
      for (const county of stateCounties) {
        const key = `${county.name}_${county.state}`;
        const scraper = SCRAPER_REGISTRY[key];
        if (!scraper) {
          const msg = `No scraper registered for ${county.name}, ${county.state}`;
          errors.push(msg);
          continue;
        }
        try {
          onProgress?.(`Scraping ${county.name} ${county.state}...`);
          const leads = await scraper(fromDate, toDate);
          allLeads.push(...leads);
          onProgress?.(`✓ ${county.name}: ${leads.length} leads`);
        } catch (e) {
          const msg = `Error scraping ${county.name} ${county.state}: ${(e as Error).message}`;
          errors.push(msg);
          onProgress?.(`✗ ${msg}`);
        }
      }
    }
  }
  
  return { leads: allLeads, errors };
}

export function getDefaultDateRange(): { fromDate: string; toDate: string } {
  const toDate = new Date().toISOString().split("T")[0];
  const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { fromDate, toDate };
}

export function getDateRange(daysBack: number): { fromDate: string; toDate: string } {
  const toDate = new Date().toISOString().split("T")[0];
  const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { fromDate, toDate };
}
