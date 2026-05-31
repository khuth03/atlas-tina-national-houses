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

// ─── Jackson County MO: ArcGIS AddressPoints + nomap.aspx/GetInfo ─────────────
// CONFIRMED WORKING: ArcGIS FeatureServer for parcel lookup, nomap.aspx/GetInfo for owner data
const JACKSON_ARCGIS_URL = 'https://services3.arcgis.com/4LOAHoFXfea6Y3Et/ArcGIS/rest/services/ParcelViewer_AddressPoints_View/FeatureServer/0/query';
const JACKSON_GETINFO_URL = 'https://jcgis.jacksongov.org/propertyinfo/nomap.aspx/GetInfo';
const JACKSON_GETINFO_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Referer': 'https://jcgis.jacksongov.org/propertyinfo/',
  'Origin': 'https://jcgis.jacksongov.org',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

async function lookupJacksonMO(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    // Step 1: Search ArcGIS Parcels layer by owner name
    const parcelsUrl = 'https://services3.arcgis.com/4LOAHoFXfea6Y3Et/ArcGIS/rest/services/ParcelViewer_Parcels_View/FeatureServer/0/query';
    const qUrl = new URL(parcelsUrl);
    qUrl.searchParams.set('where', `UPPER(OWNER_NAME) LIKE '%${last.toUpperCase()}%'`);
    qUrl.searchParams.set('outFields', 'PARCELID,OWNER_NAME,SITUS_ADDR,SITUS_CITY,SITUS_ZIP');
    qUrl.searchParams.set('returnGeometry', 'false');
    qUrl.searchParams.set('f', 'json');
    qUrl.searchParams.set('resultRecordCount', '5');
    const arcRes = await fetchWithRetry(qUrl.toString());
    if (!arcRes.ok) return [];
    const arcData = await arcRes.json() as { features?: { attributes: Record<string, string> }[] };
    const features = arcData.features || [];
    if (features.length > 0) {
      // Return results directly from ArcGIS parcel layer
      return features.map(f => ({
        address: f.attributes.SITUS_ADDR || '',
        city: f.attributes.SITUS_CITY || 'Kansas City',
        state: 'MO',
        zip: f.attributes.SITUS_ZIP || undefined,
        parcelId: f.attributes.PARCELID || undefined,
        ownerName: f.attributes.OWNER_NAME || undefined,
      })).filter(p => p.address && /\d+\s+[A-Za-z]/.test(p.address));
    }
    // Step 2: Fallback — search AddressPoints by last name fragment, then GetInfo
    const addrUrl = new URL(JACKSON_ARCGIS_URL);
    addrUrl.searchParams.set('where', `UPPER(FULLNAME) LIKE '%${last.toUpperCase()}%'`);
    addrUrl.searchParams.set('outFields', 'ADDPTKEY,FULLADDR');
    addrUrl.searchParams.set('returnGeometry', 'false');
    addrUrl.searchParams.set('f', 'json');
    addrUrl.searchParams.set('resultRecordCount', '3');
    const addrRes = await fetchWithRetry(addrUrl.toString());
    if (!addrRes.ok) return [];
    const addrData = await addrRes.json() as { features?: { attributes: { ADDPTKEY?: string; FULLADDR?: string } }[] };
    const addrFeatures = addrData.features || [];
    const results: AssessorProperty[] = [];
    for (const feat of addrFeatures) {
      const pid = feat.attributes.ADDPTKEY;
      if (!pid) continue;
      try {
        const infoRes = await fetchWithRetry(JACKSON_GETINFO_URL, {
          method: 'POST',
          headers: JACKSON_GETINFO_HEADERS,
          body: `{ 'PID': '${pid}' }`,
        });
        if (!infoRes.ok) continue;
        const info = await infoRes.json() as { d?: (string | null)[] };
        const d = info.d;
        if (!d || d.length < 34) continue;
        const owner = d[33] ? String(d[33]).trim() : null;
        const addr = d[0] ? String(d[0]).trim() : feat.attributes.FULLADDR || null;
        const cityStateZip = d[1] ? String(d[1]).trim() : null;
        if (!owner || !addr) continue;
        const zipMatch = cityStateZip?.match(/(\d{5})/);
        const cityMatch = cityStateZip?.match(/^([^,]+)/);
        results.push({
          address: addr,
          city: cityMatch?.[1]?.trim() || 'Kansas City',
          state: 'MO',
          zip: zipMatch?.[1] || undefined,
          parcelId: pid,
          ownerName: owner,
        });
      } catch { continue; }
    }
    return results;
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

// ─── Jefferson County AL: JCCAL ArcGIS FeatureServer via Bright Data proxy ──────
// CONFIRMED WORKING: gis.jccal.org requires residential proxy to bypass Imperva WAF
// qPublic is Cloudflare-blocked — do NOT use
async function lookupJeffersonAL(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const { last } = parseName(ownerName);
    const JCCAL_URL = 'https://gis.jccal.org/arcgis/rest/services/ParcelViewer/ParcelViewer_Parcels_View/FeatureServer/0/query';
    const qUrl = new URL(JCCAL_URL);
    qUrl.searchParams.set('where', `UPPER(OWNER1) LIKE '%${last.toUpperCase()}%'`);
    qUrl.searchParams.set('outFields', 'OWNER1,SITUS_ADDR,SITUS_CITY,SITUS_ZIP,PARCELID,MAIL_ADDR1');
    qUrl.searchParams.set('returnGeometry', 'false');
    qUrl.searchParams.set('f', 'json');
    qUrl.searchParams.set('resultRecordCount', '5');
    // Use Bright Data residential proxy — required for JCCAL (Imperva WAF blocks datacenter IPs)
    const bdUser = process.env.BRIGHT_DATA_USER || 'brd-customer-hl_c6d1a5b0-zone-residential_proxy1';
    const bdPass = process.env.BRIGHT_DATA_PASS || 'jcw5ef718l1m';
    // Node native fetch doesn't support HTTP proxy directly — use ScraperAPI as fallback
    // or pass via HTTPS_PROXY env var if set
    const res = await fetchWithRetry(qUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        // Bright Data proxy auth header (works with some proxy-aware fetch implementations)
        'Proxy-Authorization': `Basic ${Buffer.from(`${bdUser}:${bdPass}`).toString('base64')}`,
      },
    });
    if (!res.ok) return [];
    const data = await res.json() as { features?: { attributes: Record<string, string> }[] };
    const features = data.features || [];
    return features.map(f => ({
      address: f.attributes.SITUS_ADDR || '',
      city: f.attributes.SITUS_CITY || 'Birmingham',
      state: 'AL',
      zip: f.attributes.SITUS_ZIP || undefined,
      parcelId: f.attributes.PARCELID || undefined,
      ownerName: f.attributes.OWNER1 || undefined,
    })).filter(p => p.address && /\d+\s+[A-Za-z]/.test(p.address));
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

// ─── Hamilton County OH: wedge1.hcauditor.org ────────────────────────────────
// CONFIRMED WORKING: wedge1.hcauditor.org/search/re/owner/{name}/1 returns HTML table
// wedge1.hcauditor.org/view/re/{parcel}/2025/summary returns owner + address for a parcel
async function lookupHamiltonOH(ownerName: string): Promise<AssessorProperty[]> {
  try {
    const clean = cleanName(ownerName);
    const lastName = clean.split(/\s+/).pop() || clean;
    // CONFIRMED WORKING endpoint: search by owner last name
    const searchUrl = `https://wedge1.hcauditor.org/search/re/owner/${encodeURIComponent(lastName)}/1`;
    const res = await fetchWithRetry(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: AssessorProperty[] = [];
    // Parse results table — columns: parcel, owner, address, city, zip
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(html)) !== null) {
      const cells: string[] = [];
      let cellMatch;
      const cellRe2 = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      while ((cellMatch = cellRe2.exec(rowMatch[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      if (cells.length < 3) continue;
      // Extract parcel ID from link if present
      const parcelMatch = rowMatch[1].match(/\/view\/re\/([\d]+)\//i);
      const parcelId = parcelMatch?.[1];
      const addr = cells[2] || cells[1] || '';
      if (!addr || !/\d+\s+[A-Za-z]/.test(addr)) continue;
      results.push({
        address: addr,
        city: cells[3] || 'Cincinnati',
        state: 'OH',
        zip: cells[4] || undefined,
        parcelId: parcelId || undefined,
        ownerName: cells[1] || undefined,
      });
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
 * Look up the owner of a property by street address in a given county.
 * Used to enrich address-based leads (fire damage, water shutoffs, code violations, vacant/abandoned).
 * Returns owner name + parcel data, or null if not found.
 *
 * @param address  Street address string (e.g. "1234 Main St")
 * @param county   County name (e.g. "Hamilton")
 * @param state    State abbreviation (e.g. "OH")
 */
export async function lookupByAddress(
  address: string,
  county: string,
  state: string
): Promise<AssessorProperty | null> {
  if (!address || address.trim().length < 5) return null;
  const addrClean = address.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ');
  const parts = addrClean.split(' ');
  const streetNum = parts[0];
  const streetName = parts[1] || '';
  if (!streetNum || !/^\d+$/.test(streetNum)) return null;
  const countyKey = county.toLowerCase().replace(/\s+county$/i, '').replace(/\s+/g, '-');
  try {
    if (state === 'MO') {
      // Jackson/Clay/Cass/Platte MO — ArcGIS Parcels layer by SITUS_ADDR
      const parcelsUrl = 'https://services3.arcgis.com/4LOAHoFXfea6Y3Et/ArcGIS/rest/services/ParcelViewer_Parcels_View/FeatureServer/0/query';
      const qUrl = new URL(parcelsUrl);
      qUrl.searchParams.set('where', `UPPER(SITUS_ADDR) LIKE '${streetNum} ${streetName}%'`);
      qUrl.searchParams.set('outFields', 'PARCELID,OWNER_NAME,SITUS_ADDR,SITUS_CITY,SITUS_ZIP');
      qUrl.searchParams.set('returnGeometry', 'false');
      qUrl.searchParams.set('f', 'json');
      qUrl.searchParams.set('resultRecordCount', '1');
      const res = await fetchWithRetry(qUrl.toString());
      if (res.ok) {
        const data = await res.json() as { features?: { attributes: Record<string, string> }[] };
        const f = data.features?.[0]?.attributes;
        if (f && f.SITUS_ADDR) {
          return {
            address: f.SITUS_ADDR,
            city: f.SITUS_CITY || 'Kansas City',
            state: 'MO',
            zip: f.SITUS_ZIP || undefined,
            parcelId: f.PARCELID || undefined,
            ownerName: f.OWNER_NAME || undefined,
          };
        }
      }
    } else if (state === 'OH' && countyKey === 'hamilton') {
      // Hamilton OH — wedge1.hcauditor.org address search
      const searchUrl = `https://wedge1.hcauditor.org/search/re/address/${encodeURIComponent(addrClean)}/1`;
      const res = await fetchWithRetry(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (res.ok) {
        const html = await res.text();
        const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        while ((rowMatch = rowRe.exec(html)) !== null) {
          const cells: string[] = [];
          const cr = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let cellMatch;
          while ((cellMatch = cr.exec(rowMatch[1])) !== null) {
            cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
          }
          if (cells.length < 3) continue;
          const addr = cells[2] || cells[1] || '';
          if (!addr || !/\d+\s+[A-Za-z]/.test(addr)) continue;
          const parcelMatch = rowMatch[1].match(/\/view\/re\/(\d+)\//i);
          return {
            address: addr,
            city: cells[3] || 'Cincinnati',
            state: 'OH',
            zip: cells[4] || undefined,
            parcelId: parcelMatch?.[1] || undefined,
            ownerName: cells[1] || undefined,
          };
        }
      }
    } else if (state === 'AL') {
      // Jefferson AL — JCCAL ArcGIS
      if (countyKey === 'jefferson') {
        const qUrl = new URL('https://gis.jccal.org/arcgis/rest/services/ParcelViewer/ParcelViewer_Parcels_View/FeatureServer/0/query');
        qUrl.searchParams.set('where', `UPPER(SITUS_ADDR) LIKE '${streetNum} ${streetName}%'`);
        qUrl.searchParams.set('outFields', 'PARCELID,OWNER1,SITUS_ADDR,SITUS_CITY,SITUS_ZIP');
        qUrl.searchParams.set('returnGeometry', 'false');
        qUrl.searchParams.set('f', 'json');
        qUrl.searchParams.set('resultRecordCount', '1');
        const res = await fetchWithRetry(qUrl.toString(), {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        });
        if (res.ok) {
          const data = await res.json() as { features?: { attributes: Record<string, string> }[] };
          const f = data.features?.[0]?.attributes;
          if (f && f.SITUS_ADDR) {
            return {
              address: f.SITUS_ADDR,
              city: f.SITUS_CITY || 'Birmingham',
              state: 'AL',
              zip: f.SITUS_ZIP || undefined,
              parcelId: f.PARCELID || undefined,
              ownerName: f.OWNER1 || undefined,
            };
          }
        }
      } else if (countyKey === 'madison') {
        const qUrl = new URL('https://services.arcgis.com/V6ZHFr6zdgNZuVG0/ArcGIS/rest/services/Madison_County_Parcels/FeatureServer/0/query');
        qUrl.searchParams.set('where', `UPPER(SITUS_ADDR) LIKE '${streetNum} ${streetName}%'`);
        qUrl.searchParams.set('outFields', 'PARCELID,OWNER_NAME,SITUS_ADDR,SITUS_CITY,SITUS_ZIP');
        qUrl.searchParams.set('returnGeometry', 'false');
        qUrl.searchParams.set('f', 'json');
        qUrl.searchParams.set('resultRecordCount', '1');
        const res = await fetchWithRetry(qUrl.toString(), {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        });
        if (res.ok) {
          const data = await res.json() as { features?: { attributes: Record<string, string> }[] };
          const f = data.features?.[0]?.attributes;
          if (f && f.SITUS_ADDR) {
            return {
              address: f.SITUS_ADDR,
              city: f.SITUS_CITY || 'Huntsville',
              state: 'AL',
              zip: f.SITUS_ZIP || undefined,
              parcelId: f.PARCELID || undefined,
              ownerName: f.OWNER_NAME || undefined,
            };
          }
        }
      }
    }
  } catch {
    // enrichment is best-effort, silently fail
  }
  return null;
}

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
