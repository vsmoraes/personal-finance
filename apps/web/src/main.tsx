import "./i18n.ts";
import "antd/dist/reset.css";
import "./styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { App } from "./app.tsx";
const element = document.getElementById("root");
if (!element) throw new Error("ROOT_MISSING");
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 } },
});
createRoot(element).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
