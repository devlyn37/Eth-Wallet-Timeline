import React, { useState, useEffect } from "react";
import { CollectionInfo, resolveWallet } from "../utils/data";
import Timeline from "../components/timeline";
import { Search } from "../components/search";
import { useRouter } from "next/dist/client/router";
import { Filter } from "../components/filter";
import { Header } from "../components/header";
import { ParsedUrlQueryInput } from "querystring";

export interface SearchCriteria {
  address: string;
  ens: string;
  startDate: string;
  endDate: string;
  page: number;
  collection: CollectionInfo | null;
}

interface Params extends ParsedUrlQueryInput {
  wallet?: string;
  startDate?: string;
  endDate?: string;
  collectionSlug?: string;
}

export default function Home() {
  const router = useRouter();

  const [search, setSearch] = useState<SearchCriteria>({
    address: "",
    ens: "",
    startDate: "",
    endDate: "",
    collection: null,
    page: 1,
  });
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [loadingWallet, setLoadingWallet] = useState<boolean>(false);

  const loadMore = () => {
    setSearch({ ...search, page: search.page + 1 });
  };

  const handleSearch = async (input: string) => {
    console.log("Handle Search");

    try {
      setLoadingWallet(true);
      const [address, ens] = await resolveWallet(input); // Add loading here

      const s: SearchCriteria = {
        address: address,
        ens: ens,
        startDate: "",
        endDate: "",
        page: 1,
        collection: null,
      };

      setSearch(s);
      updateUrl(s);

      setErrorMsg("");
    } catch (e) {
      setErrorMsg(e.message);
    }

    setLoadingWallet(false);
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

    if (s.collection) {
      query.collectionSlug = s.collection.slug;
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
    const s = { ...search, collection: collection };
    setSearch(s);
    updateUrl(s);
  };

  useEffect(() => {
    const validateParams = (query: ParsedUrlQueryInput): string => {
      let err = "";
      const paramWL = ["wallet", "startDate", "endDate", "collectionSlug"];

      Object.keys(query).forEach((param) => {
        if (paramWL.includes(param) && typeof query[param] !== "string") {
          err += `Invalid ${param} parameter\n`;
        }
      });

      return err;
    };

    const matchingParamAndState = (
      search: SearchCriteria,
      query: Params
    ): boolean => {
      const walletMatch =
        (!search.address && !query.wallet) ||
        search.address === query.wallet ||
        search.ens.includes(query.wallet as string);

      const startMatch =
        (!search.startDate && !query.startDate) ||
        query.startDate === search.startDate;

      const endMatch =
        (!search.endDate && !query.endDate) || query.endDate === search.endDate;

      const collectionMatch =
        (!search.collection && !query.collectionSlug) ||
        (search.collection && query.collectionSlug === search.collection.slug);

      return walletMatch && startMatch && endMatch && collectionMatch;
    };

    const handleParams = async () => {
      const err = validateParams(router.query);
      if (err) {
        setErrorMsg(err);
        return;
      }

      const { wallet, startDate, endDate, collectionSlug } =
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
          page: 1,
          collection: null,
        });
        return;
      }

      // Past this point its actions like url changes and pressing back
      console.log("Current state: ");
      console.log(search);

      console.log("Current url: ");
      console.log(router.query);

      const [address, ens] = await resolveWallet(wallet);
      setSearch({
        address: address,
        ens: ens,
        startDate: startDate ?? "",
        endDate: endDate ?? "",
        page: 1,
        collection: collectionSlug
          ? { name: collectionSlug, slug: collectionSlug } // To-do fix this
          : null,
      });
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
        ) : search.address ? (
          <>
            <Header
              address={search.address}
              ens={search.ens}
              endDate={search.endDate}
              startDate={search.startDate}
              collectionSlug={search.collection ? search.collection.slug : ""}
              loading={loadingWallet}
            />
            <Filter
              address={search.address}
              startDate={search.startDate}
              endDate={search.endDate}
              collection={search.collection}
              loadingWallet={loadingWallet}
              handleCollectionChange={handleCollectionChange}
              handleEndDateChange={handleEndDateChange}
              handleStartDateChange={handleStartDateChange}
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
