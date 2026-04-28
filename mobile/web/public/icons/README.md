# PWA icons

Drop the following PNGs here before publishing the PWA. The Vite manifest
(see `mobile/web/vite.config.ts`) references them by these exact names.

- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `maskable-512.png` (512x512, with safe-zone padding for maskable)

Until they exist, mobile browsers fall back to no install icon, but the PWA
still works and installs.
