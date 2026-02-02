import React, { useEffect, useState } from "react";
import BrowsePage from "./BrowsePage.jsx";
import AccountPage from "./AccountPage.jsx";
import WatchPage from "./WatchPage.jsx";
import SharedListPage from "./SharedListPage.jsx";
import InviteListPage from "./InviteListPage.jsx";
import RoomPage from "./RoomPage.jsx";
import RoomWatchPage from "./RoomWatchPage.jsx";
import ResetPasswordPage from "./ResetPasswordPage.jsx";
import ActorPage from "./ActorPage.jsx";

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
  if (hash.startsWith("#account")) {
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const tab = params.get("tab") || "rooms";
    return { page: "account", tab };
  }
  if (hash.startsWith("#actor")) {
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const id = params.get("id") || "0";
    return { page: "actor", personId: Number(id) || 0 };
  }
  if (hash.startsWith("#room-watch")) {
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const code = params.get("code") || "";
    return {
      page: "room-watch",
      code,
    };
  }
  if (hash.startsWith("#room")) {
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const id = params.get("id") || "550";
    const type = params.get("type") || "movie";
    return {
      page: "room",
      mediaId: id,
      mediaType: type === "tv" ? "tv" : "movie",
    };
  }
  if (hash.startsWith("#reset-password")) {
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const token = params.get("token") || "";
    return { page: "reset-password", token };
  }
  if (hash.startsWith("#list")) {
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const code = params.get("code") || "";
    return { page: "list", code };
  }
  if (hash.startsWith("#invite")) {
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const code = params.get("code") || "";
    return { page: "invite", code };
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

  if (route.page === "account") {
    return <AccountPage initialTab={route.tab} />;
  }

  if (route.page === "actor") {
    return <ActorPage personId={route.personId} />;
  }

  if (route.page === "room") {
    return <RoomPage mediaId={route.mediaId} mediaType={route.mediaType} />;
  }

  if (route.page === "room-watch") {
    return (
      <RoomWatchPage code={route.code} />
    );
  }

  if (route.page === "reset-password") {
    return <ResetPasswordPage token={route.token} />;
  }

  if (route.page === "list") {
    return <SharedListPage code={route.code} />;
  }
  if (route.page === "invite") {
    return <InviteListPage code={route.code} />;
  }

  return <BrowsePage />;
}

export default App;
