import { Lead, CountyConfig } from "./base.js";
import * as suffolkNY from "./suffolk_ny.js";
import * as missouri from "./missouri.js";
import * as wisconsin from "./wisconsin.js";
import * as alabama from "./alabama.js";
import * as ohio from "./ohio.js";
import * as southCarolina from "./south_carolina.js";
import * as texas from "./texas.js";

// Run all scrapers for the configured counties
export async function runAllScrapers(
  counties: CountyConfig[],
  fromDate: string,
  toDate: string,
  onProgress?: (msg: string) => void
): Promise<{ leads: Lead[]; errors: string[] }> {
  const allLeads: Lead[] = [];
  const errors: string[] = [];

  // Group counties by state
  const stateGroups = new Map<string, CountyConfig[]>();
  for (const county of counties) {
    const key = county.state;
    if (!stateGroups.has(key)) stateGroups.set(key, []);
    stateGroups.get(key)!.push(county);
  }

  for (const [state, stateCounties] of stateGroups) {
    // States with a single scrapeAll function (all 11 lead types)
    if (state === "MO") {
      try {
        onProgress?.(`Scraping Missouri (all 11 lead types)...`);
        const leads = await missouri.scrapeAll(fromDate, toDate);
        allLeads.push(...leads);
        onProgress?.(`✓ MO: ${leads.length} leads found`);
      } catch (e) {
        const msg = `Error scraping MO: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
      continue;
    }
    if (state === "WI") {
      try {
        onProgress?.(`Scraping Wisconsin (all 11 lead types)...`);
        const leads = await wisconsin.scrapeAll(fromDate, toDate);
        allLeads.push(...leads);
        onProgress?.(`✓ WI: ${leads.length} leads found`);
      } catch (e) {
        const msg = `Error scraping WI: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
      continue;
    }
    if (state === "TX") {
      try {
        onProgress?.(`Scraping Texas (all 11 lead types)...`);
        const leads = await texas.scrapeAll(fromDate, toDate);
        allLeads.push(...leads);
        onProgress?.(`✓ TX: ${leads.length} leads found`);
      } catch (e) {
        const msg = `Error scraping TX: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
      continue;
    }
    if (state === "NY") {
      try {
        onProgress?.(`Scraping NY (all lead types)...`);
        const leads = await suffolkNY.scrapeAll(fromDate, toDate);
        allLeads.push(...leads);
        onProgress?.(`✓ NY: ${leads.length} leads found`);
      } catch (e) {
        const msg = `Error scraping NY: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
      continue;
    }

    // States with county-by-county scrapers (AL, OH, SC)
    for (const county of stateCounties) {
      try {
        onProgress?.(`Scraping ${county.name}, ${county.state} (all 11 lead types)...`);
        let leads: Lead[] = [];
        if (state === "AL") {
          leads = await alabama.scrapeAlabama(county.name, fromDate, toDate);
        } else if (state === "OH") {
          leads = await ohio.scrapeOhio(county.name, fromDate, toDate);
        } else if (state === "SC") {
          leads = await southCarolina.scrapeSC(county.name, fromDate, toDate);
        } else {
          const msg = `No scraper registered for ${county.name}, ${county.state}`;
          errors.push(msg);
          onProgress?.(`✗ ${msg}`);
          continue;
        }
        allLeads.push(...leads);
        onProgress?.(`✓ ${county.name} ${county.state}: ${leads.length} leads`);
      } catch (e) {
        const msg = `Error scraping ${county.name} ${county.state}: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
    }

    // State-wide scrapers (run once per state, after county loop)
    // These call functions that are NOT county-specific
    if (state === "AL") {
      const stateWideFns: Array<[string, () => Promise<Lead[]>]> = [
        ["AL Bankruptcy", () => alabama.scrapeBankruptcy(fromDate, toDate)],
        ["AL Code Violations", () => alabama.scrapeCodeViolations(fromDate, toDate)],
        ["AL Divorce/Eviction", () => alabama.scrapeDivorce(fromDate, toDate)],
        ["AL Out-of-State Owners", () => alabama.scrapeOutOfStateOwners(fromDate, toDate)],
        ["AL Vacant/Abandoned", () => alabama.scrapeVacantAbandoned(fromDate, toDate)],
      ];
      for (const [label, fn] of stateWideFns) {
        try {
          onProgress?.(`Scraping ${label}...`);
          const leads = await fn();
          allLeads.push(...leads);
          onProgress?.(`✓ ${label}: ${leads.length} leads`);
        } catch (e) {
          const msg = `Error scraping ${label}: ${(e as Error).message}`;
          errors.push(msg);
          onProgress?.(`✗ ${msg}`);
        }
      }
    }
    if (state === "OH") {
      const stateWideFns: Array<[string, () => Promise<Lead[]>]> = [
        ["OH Bankruptcy", () => ohio.scrapeBankruptcy(fromDate, toDate)],
        ["OH Obituaries", () => ohio.scrapeObituaries(fromDate, toDate)],
        ["OH Code Violations", () => ohio.scrapeCodeViolations(fromDate, toDate)],
        ["OH Divorce/Eviction", () => ohio.scrapeDivorce(fromDate, toDate)],
        ["OH Out-of-State Owners", () => ohio.scrapeOutOfStateOwners(fromDate, toDate)],
        ["OH Vacant/Abandoned", () => ohio.scrapeVacantAbandoned(fromDate, toDate)],
      ];
      for (const [label, fn] of stateWideFns) {
        try {
          onProgress?.(`Scraping ${label}...`);
          const leads = await fn();
          allLeads.push(...leads);
          onProgress?.(`✓ ${label}: ${leads.length} leads`);
        } catch (e) {
          const msg = `Error scraping ${label}: ${(e as Error).message}`;
          errors.push(msg);
          onProgress?.(`✗ ${msg}`);
        }
      }
    }
    if (state === "SC") {
      const stateWideFns: Array<[string, () => Promise<Lead[]>]> = [
        ["SC Bankruptcy", () => southCarolina.scrapeBankruptcy(fromDate, toDate)],
        ["SC Obituaries", () => southCarolina.scrapeObituaries(fromDate, toDate)],
        ["SC FSBO", () => southCarolina.scrapeFSBO(fromDate, toDate)],
        ["SC Code Violations", () => southCarolina.scrapeCodeViolations(fromDate, toDate)],
        ["SC Divorce/Eviction", () => southCarolina.scrapeDivorce(fromDate, toDate)],
        ["SC Out-of-State Owners", () => southCarolina.scrapeOutOfStateOwners(fromDate, toDate)],
        ["SC Vacant/Abandoned", () => southCarolina.scrapeVacantAbandoned(fromDate, toDate)],
      ];
      for (const [label, fn] of stateWideFns) {
        try {
          onProgress?.(`Scraping ${label}...`);
          const leads = await fn();
          allLeads.push(...leads);
          onProgress?.(`✓ ${label}: ${leads.length} leads`);
        } catch (e) {
          const msg = `Error scraping ${label}: ${(e as Error).message}`;
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
