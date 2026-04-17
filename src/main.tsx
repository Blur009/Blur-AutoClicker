import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// This is to Disable the Right Click Menu
document.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "F7") {
      event.preventDefault();
    }
  },
  { capture: true },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
