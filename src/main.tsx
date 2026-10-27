import { createRoot } from "react-dom/client";
import App from "./App";
import "@applemusic-like-lyrics/core/style.css";
import "./style.css";
import "./responsive.css";
import "./floating.css";

createRoot(document.getElementById("root")!).render(<App />);
