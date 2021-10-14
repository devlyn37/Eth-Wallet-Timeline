import React, { useState, useEffect } from "react";
import {
  CollectionInfo,
  resolveWallet,
  getCollections,
  getCollection,
} from "../utils/data";
import Timeline from "../components/timeline";
import { Search } from "../components/search";
import { useRouter } from "next/dist/client/router";
import { Filter } from "../components/filter";
import { Header } from "../components/header";
import { ParsedUrlQueryInput } from "querystring";

export type Filter = "successful" | "transfer" | "";

export interface SearchCriteria {
  address: string;
  ens: string;
  startDate: string;
  endDate: string;
  filter: Filter;
  page: number;
  contractAddress: string;
}

interface Params extends ParsedUrlQueryInput {
  wallet?: string;
  startDate?: string;
  endDate?: string;
  contractAddress?: string;
  filter?: Filter;
}

export default function Home() {
  const router = useRouter();

  const [search, setSearch] = useState<SearchCriteria>({
    address: "",
    ens: "",
    startDate: "",
    endDate: "",
    filter: "",
    contractAddress: "",
    page: 1,
  });
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [loadingWallet, setLoadingWallet] = useState<boolean>(false);
  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [loadingCollection, setLoadingCollection] = useState<boolean>(false);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [loadingCollections, setLoadingCollections] = useState<boolean>(false);

  const loadMore = () => {
    setSearch({ ...search, page: search.page + 1 });
  };

  const handleSearch = async (
    input: string,
    setUrl: boolean = true,
    startDate?: string,
    endDate?: string,
    filter?: Filter,
    contractAddress?: string
  ) => {
    let address, ens;

    setCollection(null);
    setLoadingCollections(false);
    setLoadingWallet(true);
    setLoadingCollections(true);

    try {
      [address, ens] = await resolveWallet(input); // Add loading here

      const s: SearchCriteria = {
        address: address,
        ens: ens,
        startDate: startDate ?? "",
        endDate: endDate ?? "",
        filter: filter ?? "",
        page: 1,
        contractAddress: contractAddress ?? "",
      };
      setSearch(s);

      if (setUrl) {
        updateUrl(s);
      }

      setErrorMsg("");
    } catch (e) {
      setErrorMsg(e.message);
    }

    setLoadingWallet(false);

    try {
      const usersCollections = await getCollections(address);
      setCollections(usersCollections);

      // User arriving from shared link or refreshing etc
      if (contractAddress) {
        setLoadingCollection(true);

        // Search for collection based on asset contract
        let collection = usersCollections.find(
          (c: CollectionInfo) =>
            c.contractAddress.toUpperCase() === contractAddress.toUpperCase()
        );

        // If not found fetch data
        if (!collection) {
          collection = await getCollection(contractAddress);
        }

        setCollection(collection);
      }

      setErrorMsg("");
    } catch (e) {
      setErrorMsg(e.message);
    }

    setLoadingCollection(false);
    setLoadingCollections(false);
  };

  const updateUrl = (s: SearchCriteria) => {
    const query: Params = {};

    if (s.ens || s.address) {
      query.wallet = s.ens ?? s.address;
    }

    if (s.startDate) {
      query.startDate = s.startDate;
    }

    if (s.endDate) {
      query.endDate = s.endDate;
    }

    if (s.contractAddress) {
      query.contractAddress = s.contractAddress;
    }

    if (s.filter) {
      query.filter = s.filter;
    }

    router.push({ pathname: "/", query: query }, undefined, { shallow: true });
  };

  const handleStartDateChange = (startDate: string) => {
    const s = { ...search, startDate: startDate };
    setSearch(s);
    updateUrl(s);
  };

  const handleEndDateChange = (endDate: string) => {
    const s = { ...search, endDate: endDate };
    setSearch(s);
    updateUrl(s);
  };

  const handleCollectionChange = (collection: CollectionInfo) => {
    const s = {
      ...search,
      contractAddress: collection ? collection.contractAddress : "",
    };
    setCollection(collection);

    if (collection && !collection.floor) {
      const loadData = async () => {
        setLoadingCollection(true);
        const c = await getCollection(collection.contractAddress);
        setCollection(c);
        setLoadingCollection(false);
      };

      loadData();
    }

    setSearch(s);
    updateUrl(s);
  };

  const handleFilterChange = (filter: Filter) => {
    const s = { ...search, filter: filter };
    setSearch(s);
    updateUrl(s);
  };

  useEffect(() => {
    const validateParams = (query: ParsedUrlQueryInput): string => {
      let err = "";
      const paramWL = [
        "wallet",
        "startDate",
        "endDate",
        "contractAddress",
        "filter",
      ];

      Object.keys(query).forEach((param: string) => {
        const val = query[param];

        if (paramWL.includes(param) && typeof val !== "string") {
          err += `Invalid ${param} parameter\n`;
        }

        val as string;

        if (
          param === "filter" &&
          val !== "" &&
          val !== "successful" &&
          val != "transfer"
        ) {
          err += `filter ${val} is not valid`;
        }
      });

      return err;
    };

    const matchingParamAndState = (
      search: SearchCriteria,
      query: Params
    ): boolean => {
      const startMatch =
        query.startDate === search.startDate ||
        (!query.startDate && !search.startDate);
      const endMatch =
        query.endDate === search.endDate || (!query.endDate && !search.endDate);
      const filterMatch =
        search.filter === query.filter || (!query.filter && !search.filter);
      const collectionMatch =
        (!search.contractAddress && !query.contractAddress) ||
        query.contractAddress === search.contractAddress;

      const walletMatch =
        (!search.address && !query.wallet) ||
        search.address === query.wallet ||
        search.ens.includes(query.wallet as string);

      return (
        walletMatch && startMatch && endMatch && collectionMatch && filterMatch
      );
    };

    const handleParams = async () => {
      const err = validateParams(router.query);
      if (err) {
        setErrorMsg(err);
        return;
      }

      const { wallet, startDate, endDate, contractAddress, filter } =
        router.query as Params;

      // If the state matches the url already, that means that this change in query params
      // was caused in the client after a user adjusted the search of the filtering
      if (matchingParamAndState(search, router.query)) {
        return;
      }

      if (!wallet && search.address) {
        // The user has navigated back to base page
        setSearch({
          address: "",
          ens: "",
          startDate: "",
          endDate: "",
          filter: "",
          page: 1,
          contractAddress: "",
        });
        return;
      }

      // Past this point its actions like url changes and pressing back
      await handleSearch(
        wallet,
        false,
        startDate ?? "",
        endDate ?? "",
        filter,
        contractAddress
      );
    };

    handleParams();
  }, [router.query]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "stretch",
        minHeight: "100vh",
      }}
    >
      <Search
        handleSearch={handleSearch}
        wallet={router.query.wallet as string}
      />
      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: "1vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          padding: "0px 20px",
        }}
      >
        {errorMsg ? (
          <div>{errorMsg}</div>
        ) : loadingWallet || search.address ? (
          <>
            <Header
              address={search.address}
              ens={search.ens}
              endDate={search.endDate}
              startDate={search.startDate}
              collection={collection}
              loadingCollection={loadingCollection}
              loadingWallet={loadingWallet}
            />
            <Filter
              collections={collections}
              startDate={search.startDate}
              endDate={search.endDate}
              collection={collection}
              loadingWallet={loadingWallet}
              loadingCollections={loadingCollections}
              handleCollectionChange={handleCollectionChange}
              handleEndDateChange={handleEndDateChange}
              handleStartDateChange={handleStartDateChange}
              handleFilterChange={handleFilterChange}
            />
            <Timeline
              search={search}
              loadMore={loadMore}
              loadingWallet={loadingWallet}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
