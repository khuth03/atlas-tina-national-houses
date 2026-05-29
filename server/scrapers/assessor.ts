/**
 * County Assessor Cross-Reference Module
 *
 * Given an owner name + county + state, queries the county assessor's
 * public property search portal and returns all matching property addresses.
 *
 * Used to cross-reference bankruptcy/probate/divorce/obituary leads
 * (which only have a debtor/decedent name) against actual property ownership.
 *
 * Only leads where at least one property address is found are saved to the DB.
 */

import { fetchWithRetry, fetchRendered } from './base.js';

export interface AssessorProperty {
  address: string;
  city: string;
  state: string;
  zip?: string;
  parcelId?: string;
  ownerName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cleanName(name: string): string {
  return name
    .replace(/\b(JR|SR|II|III|IV|TRUST|LLC|INC|ESTATE|ET AL)\b/gi, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .trim()
    .toUpperCase();
}

function parseName(fullName: string): { last: string; first: string } {
  const clean = cleanName(fullName);
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { last: parts[0], first: '' };
  // Assume "FIRST LAST" format from PACER/court filings
  return { last: parts[parts.length - 1], first: parts[0] };
}

async function getText(url: string, options: RequestInit = {}): Promise<string> {
  const res = await fetchWithRetry(url, options);
  return res.text();
}

async function getTextRendered(url: string): Promise<string> {
  const res = await fetchRendered(url);
  return res.text();
}

// ─────────────────────────────────────────────────────────────────────────────
// Missouri Counties
// ─────────────────────────────────────────────────────────────────────────────

async function lookupJacksonMO(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const pageHtml = await getText(
      'https://www.jacksongov.org/government/departments/assessment/property-search'
    );
    const vsMatch = pageHtml.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
    const vsgMatch = pageHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
    const evMatch = pageHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);
    if (!vsMatch) return [];

    const params = new URLSearchParams({
      __VIEWSTATE: vsMatch[1],
      __VIEWSTATEGENERATOR: vsgMatch?.[1] ?? '',
      __EVENTVALIDATION: evMatch?.[1] ?? '',
      'ctl00$ContentPlaceHolder1$txtOwnerName': last,
      'ctl00$ContentPlaceHolder1$btnSearch': 'Search',
    });

    const resultHtml = await getText(
      'https://www.jacksongov.org/government/departments/assessment/property-search',
      {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return parseGenericTable(resultHtml, 'MO', 'Kansas City', 1, 2);
  } catch {
    return [];
  }
}

async function lookupClayMO(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getText(
      'https://www.claycountymo.gov/property_search/results',
      {
        method: 'POST',
        body: new URLSearchParams({ owner_last: last, owner_first: '' }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    return parseGenericTable(html, 'MO', 'Clay County', 2, 3);
  } catch {
    return [];
  }
}

async function lookupCassMO(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getText(
      `https://www.casscounty.com/property/search?owner=${encodeURIComponent(last)}`
    );
    return parseGenericTable(html, 'MO', 'Cass County', 2, 3);
  } catch {
    return [];
  }
}

async function lookupPlatteMO(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://www.plattecountymo.gov/assessor/search?name=${encodeURIComponent(last)}`
    );
    return parseGenericTable(html, 'MO', 'Platte County', 1, 2);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alabama Counties
// ─────────────────────────────────────────────────────────────────────────────

async function lookupMadisonAL(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last, first } = parseName(ownerName);
    const pageHtml = await getText(
      'https://madisonproperty.countygovservices.com/Property/Property/Search'
    );
    const tokenMatch = pageHtml.match(/name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"/);
    if (!tokenMatch) return [];

    const resultHtml = await getText(
      'https://madisonproperty.countygovservices.com/Property/Property/Search',
      {
        method: 'POST',
        body: new URLSearchParams({
          PropertySearchYear: '2025',
          PropertySearchType: 'name',
          UseContains: 'False',
          'SearchCriteria.Criteria1': last,
          'SearchCriteria.Criteria2': first,
          SelectedParcels: '',
          __RequestVerificationToken: tokenMatch[1],
        }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://madisonproperty.countygovservices.com/Property/Property/Search',
        },
      }
    );

    const results: AssessorProperty[] = [];
    // Each result row has a DESCRIPTION cell with "OWNER\nADDRESS"
    const cellRegex = /<td[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = cellRegex.exec(resultHtml)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const lines = text.split(/\s{2,}|\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (/^\d+\s+[A-Z]/.test(line)) {
          results.push({ address: line, city: 'Huntsville', state: 'AL' });
          break;
        }
      }
    }
    // Fallback: generic table parse
    if (results.length === 0) {
      return parseGenericTable(resultHtml, 'AL', 'Huntsville', 1, 2);
    }
    return results;
  } catch {
    return [];
  }
}

async function lookupLimestoneAL(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://qpublic.schneidercorp.com/Application.aspx?AppID=830&LayerID=14957&PageTypeID=4&PageID=7084&KeyValue=${encodeURIComponent(last)}`
    );
    return parseQPublicResults(html, 'AL');
  } catch {
    return [];
  }
}

async function lookupMorganAL(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://qpublic.schneidercorp.com/Application.aspx?AppID=1002&LayerID=20079&PageTypeID=4&PageID=9316&KeyValue=${encodeURIComponent(last)}`
    );
    return parseQPublicResults(html, 'AL');
  } catch {
    return [];
  }
}

async function lookupJeffersonAL(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://qpublic.schneidercorp.com/Application.aspx?AppID=770&LayerID=14109&PageTypeID=4&PageID=6749&KeyValue=${encodeURIComponent(last)}`
    );
    return parseQPublicResults(html, 'AL');
  } catch {
    return [];
  }
}

async function lookupShelbyAL(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://esearch.shelbyal.com/search/result?keywords=OwnerName%3A%22${encodeURIComponent(last)}%22`
    );
    return parseEsearchResults(html, 'AL');
  } catch {
    return [];
  }
}

async function lookupMontgomeryAL(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://qpublic.schneidercorp.com/Application.aspx?AppID=1026&LayerID=20683&PageTypeID=4&PageID=9581&KeyValue=${encodeURIComponent(last)}`
    );
    return parseQPublicResults(html, 'AL');
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ohio Counties
// ─────────────────────────────────────────────────────────────────────────────

async function lookupHamiltonOH(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const clean = cleanName(ownerName);
    const lastName = clean.split(/\s+/).pop() || clean;

    // Step 1: POST to /execute to establish session cookie
    await fetchWithRetry('https://wedge1.hcauditor.org/execute', {
      method: 'POST',
      body: new URLSearchParams({
        search_type: 'Owner',
        sort_column: 'Owner',
        owner_name_begins: lastName,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    // Step 2: GET /results_ajax — DataTables JSON endpoint
    const jsonText = await getText(
      'https://wedge1.hcauditor.org/results_ajax?sEcho=1&iColumns=5&iDisplayStart=0&iDisplayLength=100&iSortCol_0=1&sSortDir_0=asc'
    );

    let data: any;
    try { data = JSON.parse(jsonText); } catch { return []; }

    const results: AssessorProperty[] = [];
    for (const row of (data.aaData || [])) {
      const address = typeof row[2] === 'string' ? row[2].replace(/<[^>]+>/g, '').trim() : '';
      if (address && /\d+\s+[A-Za-z]/.test(address)) {
        results.push({ address, city: 'Cincinnati', state: 'OH', parcelId: String(row[0]) });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wisconsin Counties
// ─────────────────────────────────────────────────────────────────────────────

async function lookupDaneWI(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getText(
      `https://landonline.countyofdane.com/LandRecords/protected/LRSearch.aspx?searchType=owner&ownerName=${encodeURIComponent(last)}`
    );
    return parseGenericTable(html, 'WI', 'Dane County', 2, 3);
  } catch {
    return [];
  }
}

async function lookupRockWI(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://qpublic.schneidercorp.com/Application.aspx?AppID=1017&LayerID=20421&PageTypeID=4&PageID=9494&KeyValue=${encodeURIComponent(last)}`
    );
    return parseQPublicResults(html, 'WI');
  } catch {
    return [];
  }
}

async function lookupDoorWI(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://qpublic.schneidercorp.com/Application.aspx?AppID=1060&LayerID=21426&PageTypeID=4&PageID=9872&KeyValue=${encodeURIComponent(last)}`
    );
    return parseQPublicResults(html, 'WI');
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// South Carolina Counties
// ─────────────────────────────────────────────────────────────────────────────

async function lookupHorrySC(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://www.horrycountysc.gov/departments/assessor/property-search/?owner=${encodeURIComponent(last)}`
    );
    return parseGenericTable(html, 'SC', 'Horry County', 2, 3);
  } catch {
    return [];
  }
}

async function lookupGeorgetownSC(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://qpublic.schneidercorp.com/Application.aspx?AppID=830&LayerID=14957&PageTypeID=4&PageID=7084&KeyValue=${encodeURIComponent(last)}`
    );
    return parseQPublicResults(html, 'SC');
  } catch {
    return [];
  }
}

async function lookupMarionSC(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://esearch.marioncountysc.com/search/result?keywords=OwnerName%3A%22${encodeURIComponent(last)}%22`
    );
    return parseEsearchResults(html, 'SC');
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// New York Counties
// ─────────────────────────────────────────────────────────────────────────────

async function lookupSuffolkNY(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://www.suffolkcountyny.gov/Departments/Assessment/Property-Search?lastName=${encodeURIComponent(last)}`
    );
    return parseGenericTable(html, 'NY', 'Suffolk County', 2, 3);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Texas Counties
// ─────────────────────────────────────────────────────────────────────────────

async function lookupBexarTX(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getText(
      `https://bexar.trueautomation.com/clientdb/Property/PropertySearch.aspx?cid=110&ownername=${encodeURIComponent(last)}`
    );
    return parseTrueAutomationResults(html, 'TX');
  } catch {
    return [];
  }
}

async function lookupNuecesT(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getTextRendered(
      `https://esearch.nuecescad.net/search/result?keywords=OwnerName%3A%22${encodeURIComponent(last)}%22`
    );
    return parseEsearchResults(html, 'TX');
  } catch {
    return [];
  }
}

async function lookupKlebergTX(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getText(
      `https://kleberg.trueautomation.com/clientdb/Property/PropertySearch.aspx?cid=85&ownername=${encodeURIComponent(last)}`
    );
    return parseTrueAutomationResults(html, 'TX');
  } catch {
    return [];
  }
}

async function lookupJimWellsTX(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getText(
      `https://jimwells.trueautomation.com/clientdb/Property/PropertySearch.aspx?cid=90&ownername=${encodeURIComponent(last)}`
    );
    return parseTrueAutomationResults(html, 'TX');
  } catch {
    return [];
  }
}

async function lookupSanPatricioTX(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const html = await getText(
      `https://sanpatricio.trueautomation.com/clientdb/Property/PropertySearch.aspx?cid=203&ownername=${encodeURIComponent(last)}`
    );
    return parseTrueAutomationResults(html, 'TX');
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared parsers
// ─────────────────────────────────────────────────────────────────────────────

/** Generic table parser: addressCol is 0-indexed column index for address */
function parseGenericTable(
  html: string,
  state: string,
  defaultCity: string,
  addressCol: number,
  cityCol?: number
): AssessorProperty[] {
  const results: AssessorProperty[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = m[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const text = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
    const addr = text[addressCol];
    if (addr && /^\d+\s+[A-Za-z]/.test(addr)) {
      results.push({
        address: addr,
        city: (cityCol !== undefined ? text[cityCol] : '') || defaultCity,
        state,
      });
    }
  }
  return results;
}

function parseQPublicResults(html: string, state: string): AssessorProperty[] {
  const results: AssessorProperty[] = [];
  const rowRegex = /<tr[^>]*class="[^"]*SearchResultRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = m[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const text = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
    // qPublic: [parcel, owner, address, city, zip]
    if (text.length >= 3 && text[2] && /^\d+\s+[A-Za-z]/.test(text[2])) {
      results.push({
        address: text[2],
        city: text[3] || '',
        state,
        zip: text[4] || '',
        parcelId: text[0],
        ownerName: text[1],
      });
    }
  }
  return results;
}

function parseEsearchResults(html: string, state: string): AssessorProperty[] {
  const results: AssessorProperty[] = [];
  // esearch renders a table; try multiple row class patterns
  const patterns = [
    /<tr[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
    /<tr[^>]*class="[^"]*odd[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
    /<tr[^>]*class="[^"]*even[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const cells = m[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      const text = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
      if (text.length >= 3 && text[2] && /^\d+\s+[A-Za-z]/.test(text[2])) {
        results.push({ address: text[2], city: text[3] || '', state });
      }
    }
    if (results.length > 0) break;
  }
  return results;
}

function parseTrueAutomationResults(html: string, state: string): AssessorProperty[] {
  const results: AssessorProperty[] = [];
  const rowRegex = /<tr[^>]*class="[^"]*SearchResultRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = m[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const text = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
    if (text.length >= 3 && text[2] && /^\d+\s+[A-Za-z]/.test(text[2])) {
      results.push({ address: text[2], city: text[3] || '', state, parcelId: text[0] });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export type CountyKey =
  | 'jackson-mo' | 'clay-mo' | 'cass-mo' | 'platte-mo'
  | 'madison-al' | 'limestone-al' | 'morgan-al' | 'jefferson-al' | 'shelby-al'
  | 'autauga-al' | 'elmore-al' | 'montgomery-al'
  | 'hamilton-oh'
  | 'dane-wi' | 'rock-wi' | 'door-wi'
  | 'horry-sc' | 'georgetown-sc' | 'marion-sc'
  | 'suffolk-ny'
  | 'bexar-tx' | 'nueces-tx' | 'kleberg-tx' | 'jim-wells-tx' | 'san-patricio-tx';

const LOOKUP_MAP: Record<CountyKey, (name: string) => Promise<AssessorProperty[]>> = {
  'jackson-mo': lookupJacksonMO,
  'clay-mo': lookupClayMO,
  'cass-mo': lookupCassMO,
  'platte-mo': lookupPlatteMO,
  'madison-al': lookupMadisonAL,
  'limestone-al': lookupLimestoneAL,
  'morgan-al': lookupMorganAL,
  'jefferson-al': lookupJeffersonAL,
  'shelby-al': lookupShelbyAL,
  'autauga-al': lookupMontgomeryAL,
  'elmore-al': lookupMontgomeryAL,
  'montgomery-al': lookupMontgomeryAL,
  'hamilton-oh': lookupHamiltonOH,
  'dane-wi': lookupDaneWI,
  'rock-wi': lookupRockWI,
  'door-wi': lookupDoorWI,
  'horry-sc': lookupHorrySC,
  'georgetown-sc': lookupGeorgetownSC,
  'marion-sc': lookupMarionSC,
  'suffolk-ny': lookupSuffolkNY,
  'bexar-tx': lookupBexarTX,
  'nueces-tx': lookupNuecesT,
  'kleberg-tx': lookupKlebergTX,
  'jim-wells-tx': lookupJimWellsTX,
  'san-patricio-tx': lookupSanPatricioTX,
};

/**
 * Look up all properties owned by a person in a given county.
 * Returns an empty array if no properties found or lookup fails.
 *
 * @param ownerName  Full name from court filing (e.g. "John Smith" or "SMITH JOHN")
 * @param county     County name (e.g. "Hamilton")
 * @param state      State abbreviation (e.g. "OH")
 */
export async function lookupOwnerProperties(
  ownerName: string,
  county: string,
  state: string
): Promise<AssessorProperty[]> {
  if (!ownerName || ownerName.trim().length < 2) return [];
  const key = `${county.toLowerCase().replace(/\s+county$/i, '').replace(/\s+/g, '-')}-${state.toLowerCase()}` as CountyKey;
  const fn = LOOKUP_MAP[key];
  if (!fn) return [];
  try {
    const results = await fn(ownerName);
    return results.filter(r => r.address && /\d+\s+[A-Za-z]/.test(r.address));
  } catch {
    return [];
  }
}
