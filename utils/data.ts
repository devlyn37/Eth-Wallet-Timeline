import axios from "axios";
import { ethers } from "ethers";
const etherScanAPIKey = "K14P3TW12QCI2VDR3YIDY7XA9Y5XP2D232";

export type Action = "Minted" | "Bought" | "Sold" | "Sent" | "Received";

export interface NFTEvent {
  assetName: string;
  assetDescription: string;
  assetImgUrl: string;
  assetUrl: string;
  collectionName: string;
  collectionImgUrl: string;
  collectionUrl: string;
  collectionDescription: string;
  date: string;
  from: string;
  to: string;
  action: Action;
  key: string;
  transactionHash: string; // event's from opensea can have the same transaction hash, can't just store this in key (ex. mintpass transaction)
  price?: number;
}

export interface CollectionInfo {
  name: string;
  slug: string;
  imgUrl: string;
  contractAddress: string;
  holding: string;
  floor?: string;
}

export const getCollections = async (
  address: string
): Promise<CollectionInfo[]> => {
  const collectionUrl = `https://api.opensea.io/api/v1/collections?${
    "asset_owner=" + address
  }&offset=0&limit=300`;
  const eventUrl = `https://api.opensea.io/api/v1/events?account_address=${address}&only_opensea=false&offset=0&limit=300`;

  const [holding, recent] = await Promise.all([
    axios.get(collectionUrl),
    axios.get(eventUrl),
  ]);

  const eventToCollectionInfo = (d: any): CollectionInfo => {
    // Account for bundle sales To-do expand this
    const asset = d.asset ?? d.asset_bundle.assets[0];

    return {
      name: asset.collection.name,
      slug: asset.collection.slug,
      imgUrl: asset.collection.image_url,
      contractAddress: asset.asset_contract.address,
      holding: "0",
    };
  };

  const collectionToCollectionInfo = (c: any): CollectionInfo => ({
    name: c.name,
    slug: c.slug,
    imgUrl: c.image_url,
    contractAddress: c.primary_asset_contracts.length
      ? c.primary_asset_contracts[0].address
      : "",
    holding: c.owned_asset_count,
    floor: c.stats.floor_price,
  });

  const fromHeld: CollectionInfo[] = holding.data.map(
    collectionToCollectionInfo
  );
  let fromEvents: CollectionInfo[] = recent.data.asset_events.map(
    eventToCollectionInfo
  );

  // Filter duplicate data from events for held collections
  let hash = {};
  fromHeld.forEach((c) => {
    hash[c.slug] = true;
  });
  fromEvents = fromEvents.filter((c) => {
    if (hash[c.slug]) {
      return false;
    } else {
      hash[c.slug] = true;
      return true;
    }
  });

  console.log(fromHeld);

  return [...fromHeld, ...fromEvents];
};

export const getCollection = async (
  contractAddress: string
): Promise<CollectionInfo> => {
  const url = `https://api.opensea.io/api/v1/asset/${contractAddress}/1`;
  console.log(url);
  const results = await axios.get(url);
  const asset = results.data;

  console.log(asset);

  return {
    name: asset.collection.name,
    slug: asset.collection.slug,
    imgUrl: asset.collection.image_url,
    contractAddress: asset.asset_contract.address,
    holding: "0",
    floor: asset.collection.stats.floor_price,
  };
};

export const getEvents = async (
  address: string,
  limit: number,
  offset: number,
  startDate?: string,
  endDate?: string,
  contractAddress?: string,
  filter?: string
): Promise<NFTEvent[]> => {
  let url = `https://api.opensea.io/api/v1/events?account_address=${address}&only_opensea=false&offset=${offset}&limit=${limit}`;

  // To-do lets use query string here

  if (startDate) {
    url += "&occurred_after=" + startDate + "T00:00:00";
  }

  if (endDate) {
    url += "&occurred_before=" + endDate + "T00:00:00";
  }

  if (contractAddress) {
    url += "&asset_contract_address=" + contractAddress;
  }

  if (filter) {
    url += "&event_type=" + filter;
  }

  //console.log(url);
  const results = await axios.get(url);
  const data = results.data.asset_events;

  return openseaDataToEvents(data, address);
};

const determineAction = (openseaData: any, address: string): Action => {
  if (
    openseaData.event_type !== "successful" &&
    openseaData.event_type !== "transfer"
  ) {
    throw new Error(
      "Opensea events that aren't of the type transfer or successful should be filtered out before determining type"
    );
  }

  if (openseaData.event_type === "successful") {
    return openseaData.winner_account.address.toUpperCase() ===
      address.toUpperCase()
      ? "Bought"
      : "Sold";
  }

  const transactionStarter = openseaData.transaction.from_account;
  const transactionParticipant = openseaData.transaction.to_account;
  const reciever = openseaData.to_account;
  const sender = openseaData.from_account;

  // This needs to be improved as I understand the data and different cases better
  // For example a case that is currently broken is nfts being purchased from other marketplaces
  // http://localhost:3000/?wallet=0x1eb59fb4c8b6675ba2a8f4153f99bdef6ca24696&contract_address=rarible&filter=transfer
  if (
    transactionParticipant &&
    transactionStarter.address.toUpperCase() ===
      reciever.address.toUpperCase() &&
    transactionStarter.address.toUpperCase() === address.toUpperCase() &&
    transactionParticipant.address !== reciever.address &&
    transactionParticipant.address !== sender.address
  ) {
    return "Minted";
  } else if (sender.address.toUpperCase() === address.toUpperCase()) {
    return "Sent";
  } else {
    return "Received";
  }
};

const openseaDataToEvents = (data: any[], address: string): NFTEvent[] => {
  /* Data Mapping
		*	Related events are linked by transaction hashes, a standard sale of an NFT
		* will have a "successful" event and a "transfer" event each with the same
		* transaction hash.

		* To determine if something was purchased/sold rather than minted look at
		* the transaction.to_account property. From what I've seen so far, mint
		* events have the contract address, while sale events have the "OpenSea-Orders"
		* user name
	*/

  const events: NFTEvent[] = data
    // Filter out tranfer events corresponing to sales
    .filter((d) => {
      const transfer = d.event_type === "transfer";
      const sale = d.event_type === "successful";

      // Just filter out until more is known about these cases
      if (!d.transaction || !d.asset) {
        return false;
      }

      if (sale) {
        return true;
      }

      if (transfer) {
        const saleTransfer =
          d.transaction.to_account &&
          d.transaction.to_account.user &&
          d.transaction.to_account.user.username === "OpenSea-Orders";
        return !saleTransfer;
      }
    })
    .map((d) => {
      const action: Action = determineAction(d, address);

      if (action === "Bought" || action === "Sold") {
        return {
          assetName: d.asset.name ?? d.asset.token_id,
          assetDescription: d.asset.description,
          assetImgUrl: d.asset.image_url,
          assetUrl: `https://opensea.io/assets/${d.asset.asset_contract.address}/${d.asset.token_id}`,
          collectionName: d.asset.collection.name,
          collectionUrl:
            d.asset.collection.external_url ??
            `https://opensea.io/collection/${d.asset.collection.slug}}`,
          collectionDescription: d.asset.collection.description,
          collectionImgUrl:
            d.asset.collection.featured_image_url ??
            d.asset.collection.image_url ??
            d.asset.collection.banner_image_url,
          date: new Date(d.transaction.timestamp).toUTCString(),
          from: d.seller.address,
          to: d.winner_account.address,
          action: action,
          key: d.transaction.transaction_hash + d.asset.id,
          transactionHash: d.transaction.transaction_hash,
          price: Number.parseInt(d.total_price),
        };
      } else if (d.event_type === "transfer") {
        return {
          assetName: d.asset.name ?? d.asset.token_id,
          assetDescription: d.asset.description,
          assetImgUrl: d.asset.image_url,
          assetUrl: `https://opensea.io/assets/${d.asset.asset_contract.address}/${d.asset.token_id}`,
          collectionName: d.asset.collection.name,
          collectionUrl:
            d.asset.collection.external_url ??
            `https://opensea.io/collection/${d.asset.collection.slug}}`,
          collectionDescription: d.asset.collection.description,
          collectionImgUrl:
            d.asset.collection.featured_image_url ??
            d.asset.collection.image_url ??
            d.asset.collection.banner_image_url,
          date: new Date(d.transaction.timestamp).toUTCString(),
          from: d.from_account.address.toUpperCase(),
          to: d.to_account.address.toUpperCase(),
          action: action,
          key: d.transaction.transaction_hash + d.asset.id,
          transactionHash: d.transaction.transaction_hash,
        };
      }
    });

  return events;
};

export const groupEvents = (events: NFTEvent[]): NFTEvent[][] => {
  let prevCollection: string;
  let prevAction: string;
  let prevBucket: NFTEvent[];
  const groups: NFTEvent[][] = [];

  for (const event of events) {
    const collection = event.collectionName;
    const action = event.action;

    if (prevCollection !== collection || prevAction !== action) {
      prevBucket = [event];
      groups.push(prevBucket);
    } else {
      prevBucket.push(event);
    }

    prevCollection = collection;
    prevAction = action;
  }

  return groups;
};

export const resolveWallet = async (
  input: string
): Promise<[string, string]> => {
  const provider = new ethers.providers.EtherscanProvider(1, etherScanAPIKey);
  let address;
  let ens;

  // Todo this is hacky, use a regex or something
  // If the input is a normal address, otherwise its an ens address
  if (input.length === 42) {
    address = input;
    ens = await provider.lookupAddress(address);
  } else {
    ens = input;
    if (ens.slice(-4) !== ".eth") {
      ens += ".eth";
    }

    address = await provider.resolveName(ens);
  }

  if (address === null) {
    throw new Error("Provided ENS name does not have an associated wallet");
  }

  return [address, ens];
};
