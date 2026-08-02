import "@patternfly/react-core/dist/styles/base.css";
import "./app.scss";

import { createRoot } from "react-dom/client";

import { Application } from "./app";

const container = document.getElementById("app");
if (container === null)
    throw new Error("cockpit-lxc: #app mount point is missing from index.html");

createRoot(container).render(<Application />);
