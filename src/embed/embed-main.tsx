import { createRoot } from "react-dom/client";
import { EmbedApp } from "./EmbedApp";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

createRoot(container).render(<EmbedApp />);
