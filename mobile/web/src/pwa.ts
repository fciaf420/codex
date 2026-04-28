import { registerSW } from "virtual:pwa-register";

// `autoUpdate` registration: silently update on next page load.
registerSW({ immediate: true });
