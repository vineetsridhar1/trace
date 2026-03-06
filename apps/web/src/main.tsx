import React from "react";
import ReactDOM from "react-dom/client";
import { ApolloProvider } from "@apollo/client";
import { BrowserRouter } from "react-router-dom";
import { apolloClient } from "./graphql/client";
import { setServerUrl } from "@trace/shared-ui";
import App from "./App";
import "./styles/globals.css";
import "@trace/shared-ui/src/styles/thread.css";

// Configure shared-ui server URL for attachment URLs etc.
const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3100";
setServerUrl(serverUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApolloProvider client={apolloClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApolloProvider>
  </React.StrictMode>,
);
