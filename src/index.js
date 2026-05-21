import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";

import App from "./App";
import AdminPage from "./AdminPage";
import BoardPage from "./BoardPage";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

const root = ReactDOM.createRoot(document.getElementById("root"));

if (window.location.pathname.startsWith("/board")) {
    root.render(<BoardPage />);
} else if (window.location.pathname.startsWith("/admin")) {
    root.render(<AdminPage />);
} else {
    root.render(
    <BrowserRouter>
        <React.StrictMode>
            <App />
        </React.StrictMode>
    </BrowserRouter>
);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(() => console.log("✅ Service Worker 등록 완료"))
      .catch((err) => console.log("❌ Service Worker 등록 실패", err));
  });
}

serviceWorkerRegistration.unregister();