import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Index from "./components/Index";

import "./main.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Index />
  </StrictMode>,
);
