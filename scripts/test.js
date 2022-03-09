import Arweave from 'arweave'
import { ConsoleLogger, SmartWeaveWebFactory } from 'redstone-smartweave';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import detectContentType from 'detect-content-type'

const podcastsEndpoint = 'https://permacast-cache.herokuapp.com/feeds/podcasts';
const showId = 'PX7NknKqPnK03ZX8BakhX3aLpGUA0JcauBtfBBqvivY';

async function main() {

  const res = await fetch(podcastsEndpoint);
  const p = await res.json();
  const podcasts = p.res;
  let childOf;
  let index;
  
  for (let i = 0; i < podcasts.length; i++) {
    if (podcasts[i].pid == showId) {
      childOf = podcasts[i].childOf
      index = podcasts[i].index
    }
  }

}

await main();