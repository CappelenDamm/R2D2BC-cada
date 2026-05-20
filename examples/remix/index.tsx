import React from "react";
import { createRoot } from "react-dom/client";
import EpubReader from "./EpubReader";

createRoot(document.getElementById("root")!).render(
  <EpubReader manifestUrl="https://alice.dita.digital/manifest.json" />
);
