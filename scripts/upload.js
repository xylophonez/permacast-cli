import Arweave from "arweave";
import axios from "axios";
import parseString from "xml2js";
import bufferToArrayBuffer from "buffer-to-arraybuffer";
import { sleep, SmartWeaveWebFactory } from "redstone-smartweave";
import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import detectContentType from "detect-content-type";
import { stripHtml } from "string-strip-html";

const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
  timeout: 100000,
});

const CONTRACT_SRC = "KrMNSCljeT0sox8bengHf0Z8dxyE0vCTLEAOtkdrfjM";
const NFT_SRC = "-xoIBH2TxLkVWo6XWAjdwXZmTbUH09_hPYD6itHFeZY";

const smartweave = SmartWeaveWebFactory.memCached(arweave);
const parser = new XMLParser();
const RSS_URL = "https://terraspaces.org/feed/podcast/";
const SHOW_ID = "IKsjaUBJiKNDtLPIOyobkUM6iPtTKAK2bMDBu30KdmE"; // TERRASPACE.ORG PODCAST ID
const podcastsEndpoint =
  "https://whispering-retreat-94540.herokuapp.com/feeds/podcasts"; // PERMACAST CACHE NODE ENDPOINT

const jwk = JSON.parse("YOUR JWK");

async function downloadEpisode(url) {

  const res = (
    await axios.get(url, {
      responseType: "arraybuffer",
    })
  ).data;

  return bufferToArrayBuffer(res);
}

function sanitizeMime(fileType) {
  if (fileType.includes("ogg")) {
    return "audio/ogg";
  } else if (fileType.includes("mpeg")) {
    return "audio/mpeg";
  } else if (fileType.includes("mp4")) {
    return "audio/mp4";
  } else if (fileType.includes("wav")) {
    return "audio/wav";
  } else if (fileType.includes("aiff")) {
    return "audio/aiff";
  } else if (fileType.includes("flac")) {
    return "audio/flac";
  } else if (fileType.includes("mp3")) {
    return "audio/mp3";
  } else {
    return false;
  }
}

async function uploadEpisode(e, cover) {
  const link = e.enclosure[0]["$"].url;
  const fileType = e.enclosure[0]["$"].type;
  const title = e.title[0];
  const description = stripHtml(e.description[0]).result;
  console.log({ link, fileType, title, description });

  const wallet = await arweave.wallets.jwkToAddress(jwk);
  console.log("\n\ndownloading a new episode...\n\n");
  const data = await downloadEpisode(link);

  if (true) {
    const tx = await arweave.createTransaction({ data: data }, jwk);
    const initState = `{"issuer": "${wallet}","owner": "${wallet}","name": "${title}","ticker": "PANFT","description": 'episode from ${title}',"thumbnail": "${cover}","balances": {"${wallet}": 1}}`;

    tx.addTag("Content-Type", "audio/mp3");
    tx.addTag("App-Name", "SmartWeaveContract");
    tx.addTag("App-Version", "0.3.0");
    tx.addTag("Contract-Src", NFT_SRC);
    tx.addTag("Init-State", initState);
    // Verto aNFT listing
    tx.addTag("Exchange", "Verto");
    tx.addTag("Action", "marketplace/create");
    tx.addTag("Thumbnail", cover);

    tx.reward = (+tx.reward * 3).toString();

    const audioTxId = await arweave.transactions.sign(tx, jwk);
    const uploader = await arweave.transactions.getUploader(tx);

    while (!uploader.isComplete) {
      await uploader.uploadChunk();
      console.log(
        `${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`
      );
    }
    console.log("\n\n\nEPISODE AUDIO TXID:");
    console.log(tx.id);

    let epObj = {};

    epObj.name = title;
    epObj.desc = description;
    epObj.verto = false;
    epObj.audio = tx.id;
    epObj.type = fileType;
    epObj.audioTxByteSize = data.byteLength;
    await addShowtoState(epObj);
  }
}

async function getMetadata() {
  const p = (await axios.get(podcastsEndpoint)).data;

  const podcasts = p.res;
  let childOf, index, episodes, pid, cover;

  for (let i = 0; i < podcasts.length; i++) {
    if (podcasts[i].pid == SHOW_ID) {
      pid = podcasts[i].pid;
      childOf = podcasts[i].childOf;
      index = podcasts[i].index;
      episodes = podcasts[i].episodes;
      cover = podcasts[i].cover;
    }
  }
  return { childOf, index, episodes, pid, cover };
}

const addShowtoState = async (show) => {
  const metadata = await getMetadata();
  const contractId = metadata.childOf;
  const pid = metadata.pid;

  let input = {
    function: "addEpisode",
    pid: pid,
    name: show.name,
    desc: show.desc,
    content: show.audio,
  };

  let tags = {
    Contract: contractId,
    "App-Name": "SmartWeaveAction",
    "App-Version": "0.3.0",
    "Content-Type": "text/plain",
    Input: JSON.stringify(input),
  };

  const interaction = await arweave.createTransaction({ data: show.desc });
  for (const key in tags) {
    interaction.addTag(key, tags[key]);
  }

  await arweave.transactions.sign(interaction, jwk);
  await arweave.transactions.post(interaction);

  console.log("\n\naddEpisode txid:");
  console.log(interaction.id);
};

function parseTitles(uploadedEpisodes) {
  let titles = [];
  for (let i = 0; i < uploadedEpisodes.length; i++) {
    titles.push(uploadedEpisodes[i].episodeName);
  }
  return titles;
}


async function main() {
  let rssJson;
  const rssXml = (await axios.get(RSS_URL)).data;
  const json = parseString.parseString(
    rssXml,
    (err, result) => (rssJson = result.rss)
  );

  const cover = rssJson.channel[0]["itunes:image"];
  const episodes = rssJson.channel[0].item;

  const metadata = await getMetadata();

  const uploadedEpisodes = (await metadata).episodes;
  const existingTitles = parseTitles(uploadedEpisodes);

  for (let i = 0; i < episodes.length; i++) {
    // console.log(episodes[i])
    let e = episodes[i];

    if (!existingTitles.includes(e.title[0])) {
      await uploadEpisode(e, metadata.cover);
      // console.log('sleep ended');
    }
  }
}

main();
