import { createRoot } from "react-dom/client";
import App from "./App";
import {startRendererDiagnostics} from '../shared/debug-diagnostics.mjs';
import "@applemusic-like-lyrics/core/style.css";
import "./style.css";
import "./responsive.css";
import "./floating.css";
import "./pill.css";
import "./glass.css";

startRendererDiagnostics();
createRoot(document.getElementById("root")!).render(<App />);
