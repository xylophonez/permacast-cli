import Arweave from 'arweave'
import { desc, SmartWeaveWebFactory } from 'redstone-smartweave';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';

const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

const NFT_SRC = "-xoIBH2TxLkVWo6XWAjdwXZmTbUH09_hPYD6itHFeZY";

const smartweave = SmartWeaveWebFactory.memCached(arweave);
const parser = new XMLParser();
const showId = '';
const jwk = JSON.parse(	
	fs.readFileSync('../secrets/jwk.json', {encoding: 'utf8'})
)

async function downloadEpisode(url) { /* https://traffic.libsyn.com/secure/notrelated/S01E00_-_Not_Related_Introduction_and_on_Luke_Smith.mp3 */
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return arrayBuffer;
}

async function uploadEpisode(e, cover) {

  const link = e.link;
  const title = e.title;
  const description = e.description;

  const data = await downloadEpisode(link);

  const fileType = "audio/mpeg";
  const wallet = await arweave.wallets.jwkToAddress(jwk);
  
  const tx = await arweave.createTransaction( {data: data}, jwk);
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

      epObj.audio = tx.id;
      epObj.type = fileType;
      epObj.audioTxByteSize = data.size;
      addShowtoState(epObj);
}



async function main() {
  const response = await fetch("https://notrelated.libsyn.com/rss");
  const rssXml = await response.text();
  const rssJson = parser.parse(rssXml);
  const cover = rssJson.rss.channel.image.url;
  const episodes = rssJson.rss.channel.item.reverse();

  for (let i = 0; i < episodes.length; i++) {
    let e = episodes[i];
    await uploadEpisode(e, cover);
    break;
  }

}

main()