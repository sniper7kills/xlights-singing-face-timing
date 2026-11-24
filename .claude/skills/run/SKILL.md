---
name: run
description: Start the app locally for manual checks. Use when asked to run, launch,
  open or screenshot the app.
allowed-tools: Bash, Read
---

# Run the app

1. If `node_modules/` does not exist, run `npm ci`.
2. Run `npm run dev` in the background.
3. Wait for the line that contains `http://localhost:5173`.
4. Open `http://localhost:5173` in the browser.
5. Select "Try the demo song". The demo song needs no speech model download.

The app is up when the song library shows the app name and the drop zone.

The app has no backend, no environment file and no seed step. All data is in the
IndexedDB of the browser profile. To start clean, clear the site data for
`localhost:5173`.

To check the production build, run `npm run build`, then `npx vite preview`.
