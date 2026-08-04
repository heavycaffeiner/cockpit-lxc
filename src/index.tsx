import "@patternfly/react-core/dist/styles/base.css";
import "./app.scss";

import { createRoot } from "react-dom/client";

import { Application } from "./app";
import { followCockpitTheme } from "./theme";

// Before the first render, so the page never paints light and then flips.
followCockpitTheme();

const container = document.getElementById("app");
if (container === null)
    throw new Error("cockpit-lxc: #app mount point is missing from index.html");

createRoot(container).render(<Application />);
