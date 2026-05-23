/// <reference types="vite/client" />

import type { Api } from "./src/types/api";

declare global {
  interface Window {
    api: Api;
  }
}
