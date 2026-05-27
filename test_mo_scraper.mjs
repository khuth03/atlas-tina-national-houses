// Test MO scraper locally
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Quick test of PACER MO RSS
const fetch = require('node-fetch');

async function test() {
  console.log("Testing PACER MO bankruptcy RSS...");
  try {
    const r = await fetch("https://ecf.mowb.uscourts.gov/cgi-bin/rss_outside.pl", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    console.log("Status:", r.status);
    const xml = await r.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    console.log("Items found:", items.length);
    if (items.length > 0) {
      const first = items[0];
      const title = (first.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || first.match(/<title>(.+?)<\/title>/))?.[1]?.trim() || "";
      console.log("First title:", title);
    }
  } catch(e) {
    console.error("Error:", e.message);
  }
}

test();
