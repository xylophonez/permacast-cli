import Arweave from 'arweave'
import { sleep, SmartWeaveWebFactory } from 'redstone-smartweave';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import detectContentType from 'detect-content-type'
import { stripHtml } from "string-strip-html";

const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

const CONTRACT_SRC = "KrMNSCljeT0sox8bengHf0Z8dxyE0vCTLEAOtkdrfjM"
const NFT_SRC = "-xoIBH2TxLkVWo6XWAjdwXZmTbUH09_hPYD6itHFeZY";

const smartweave = SmartWeaveWebFactory.memCached(arweave);
const parser = new XMLParser();
const RSS_URL = ''
const showId = 'PX7NknKqPnK03ZX8BakhX3aLpGUA0JcauBtfBBqvivY'; // replace with an arg to the API call
const podcastsEndpoint = 'https://permacast-cache.herokuapp.com/feeds/podcasts'

const jwk = JSON.parse(	
	fs.readFileSync('../secrets/jwk.json', {encoding: 'utf8'}) // replace with arconnect?
);

async function downloadEpisode(url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return arrayBuffer;
}

function sanitizeMime(fileType) {
  if (fileType.includes('ogg')) {
    return 'audio/ogg';
  } else if (fileType.includes('mpeg')) {
    return 'audio/mpeg';
  } else if (fileType.includes('mp4')) {
    return 'audio/mp4';
  } else if (fileType.includes('wav')) {
    return 'audio/wav';
  } else if (fileType.includes('aiff')) {
    return 'audio/aiff';
  } else if (fileType.includes('flac')) {
    return 'audio/flac';
  } else {
    return false;
  }
}

async function uploadEpisode(e, cover) {

  const link = e.link;
  const title = e.title;
  const description = stripHtml(e.description).result.substring(0, 247) + '...';
  const data = await downloadEpisode(link);

  const fileType = sanitizeMime(detectContentType(Buffer.from(data)));
  const wallet = await arweave.wallets.jwkToAddress(jwk);
  
  const tx = fileType && await arweave.createTransaction( {data: data}, jwk);
      const initState = `{"issuer": "${wallet}","owner": "${wallet}","name": "${title}","ticker": "PANFT","description": '${description}',"thumbnail": "${cover}","balances": {"${wallet}": 1}}`;
      tx.addTag("Content-Type", fileType);
      tx.addTag("App-Name", "SmartWeaveContract");
      tx.addTag("App-Version", "0.3.0");
      tx.addTag("Contract-Src", NFT_SRC);
      tx.addTag("Init-State", initState);
      // Verto aNFT listing
      tx.addTag("Exchange", "Verto");
      tx.addTag("Action", "marketplace/create");
      tx.addTag("Thumbnail", cover);

      const audioTxId = await arweave.transactions.sign(tx, jwk);
      const uploader = await arweave.transactions.getUploader(tx);

      while (!uploader.isComplete) {
        await uploader.uploadChunk();
        console.log(
          `${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`
        );
      }

      console.log(audioTxId);

      let epObj = {}

      epObj.name = title;
      epObj.desc = description;
      epObj.verto = false;
      epObj.audio = tx.id;
      epObj.type = fileType;
      epObj.audioTxByteSize = data.byteLength;
      await addShowtoState(epObj);
}

async function getMetadata() {
  const res = await fetch(podcastsEndpoint);
  const p = await res.json();
  const podcasts = p.res;
  let childOf;
  let index;
  let episodes;
  
  for (let i = 0; i < podcasts.length; i++) {
    if (podcasts[i].pid == showId) {
      childOf = podcasts[i].childOf;
      index = podcasts[i].index;
      episodes = podcasts[i].episodes;
    }
  }
  return {childOf: childOf, index: index, episodes: episodes};
}

const addShowtoState = async (show) => {

  const metadata = await getMetadata();
  const contractId = metadata.childOf;
  const index = metadata.index;

  let input = {
    'function': 'addEpisode',
    'index': index,
    'name': show.name,
    'desc': show.desc,
    'audio': show.audio,
    'audioTxByteSize': show.audioTxByteSize,
    'type': show.type
  }

  console.log(input)

  let tags = { "Contract-Src": CONTRACT_SRC, "App-Name": "SmartWeaveAction", "App-Version": "0.3.0", "Content-Type": "text/plain" }
  let contract = smartweave.contract(contractId).connect(jwk);
  let txId = await contract.writeInteraction(input, tags);
  console.log('addEpisode txid:');
  console.log(txId)
  if (show.verto) {
    console.log('pushing to Verto')
    await this.listEpisodeOnVerto(txId)
  } else {
    console.log('skipping Verto')
  }
}

function parseTitles(uploadedEpisodes) {
  let titles = [];
  for (let i = 0; i < uploadedEpisodes.length; i++) {
    titles.push(uploadedEpisodes[i].episodeName);
  }
  return titles;
}

async function main() {
  const response = await fetch(RSS_URL);
  const rssXml = await response.text();
  const rssJson = parser.parse(rssXml);
  const cover = rssJson.rss.channel.image.url;
  const episodes = rssJson.rss.channel.item.reverse();
  const metadata = getMetadata();
  const uploadedEpisodes = ((await metadata).episodes);
  const existingTitles = parseTitles(uploadedEpisodes);

  for (let i = 0; i < episodes.length; i++) {
    let e = episodes[i];
    ! existingTitles.includes(e.title) && await uploadEpisode(e, cover);
    sleep(10000)
    console.log('sleep ended');
  }

}

main()