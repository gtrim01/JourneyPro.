import React from "react";
import { createRoot } from "react-dom/client";
import JourneyPro from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <JourneyPro />
  </React.StrictMode>
);

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
