import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const isElectronDesktop =
  typeof window !== "undefined" &&
  (window.location.protocol === "app:" ||
    window.location.protocol === "file:" ||
    navigator.userAgent.includes("Electron"));

if (!isElectronDesktop) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(<App />);
