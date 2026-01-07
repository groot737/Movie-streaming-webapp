import React, { useEffect, useState } from "react";
import BrowsePage from "./BrowsePage.jsx";
import WatchPage from "./WatchPage.jsx";

const parseHash = () => {
  const hash = window.location.hash || "";
  if (hash.startsWith("#watch")) {
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const id = params.get("id") || "550";
    const type = params.get("type") || "movie";
    return {
      page: "watch",
      mediaId: Number(id) || 550,
      mediaType: type === "tv" ? "tv" : "movie",
    };
  }
  return { page: "browse" };
};

function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route.page === "watch") {
    return (
      <WatchPage mediaId={route.mediaId} mediaType={route.mediaType} />
    );
  }

  return <BrowsePage />;
}

export default App;
