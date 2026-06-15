# Spaccle

Spaccle is a hybrid laundry pickup and delivery app built with Apache Cordova. The repository contains the customer-facing app, rider/admin interfaces, and some website/backend content.

## What this repo contains

- `package.json` — Cordova app package, dependencies, and scripts
- `config.xml` — Cordova app manifest and Android preferences
- `build.json` — Android release signing configuration
- `www/` — Cordova web app source
  - `index.html` — single-page app shell
  - `css/` — styles for app screens
  - `js/` — JavaScript app logic
  - `js/pages/` — page-specific scripts for home, auth, rider, admin, etc.
- `res/` — icon assets for Android
- `SpaccleWebsite/` — separate static website pages
- `api/` — backend PHP endpoints used by the website

## Stack

- Apache Cordova hybrid app
- Plain HTML, CSS, JavaScript frontend
- Local database: PouchDB
- Remote sync: CouchDB (`https://db.debtrecuva.com/spacclelaundry_spaccle`)
- Payment integration: Paystack
- Maps integration: Google Maps API

## Key features

- Customer order scheduling
- Local-first auth + signup using PouchDB
- Rider view and admin view in the same app shell
- Order status tracking and assignment status flow
- Support/chat thread handling
- Admin order management, rider assignment, broadcast/notifications

## How authentication and data sync work

- User signup/login are handled in `www/js/db.js`.
- A signup creates a local PouchDB user doc and stores hashed credentials.
- The app uses `SpaccleDB.startSync()` to sync local PouchDB data with remote CouchDB.
- The remote CouchDB connection is configured in `www/js/config.js`.
- Login will work across devices only after the user document has synced successfully to remote CouchDB.

## Running the app locally

Install dependencies:

```bash
npm install
```

Run in browser mode:

```bash
npm run dev
```

This starts a live-server and prepares the Cordova browser platform.

## Building for Android

Install Android platform locally if needed:

```bash
npx cordova platform add android
```

Build the APK:

```bash
npx cordova build android
```

For a signed release, ensure `release.keystore` exists and `build.json` is configured.

Note: `package.json` currently defines `build` as `cordova build browser`, so Android must be built explicitly or the script updated.

## Important security notes

- `www/js/config.js` currently contains CouchDB credentials and Paystack test keys.
- `build.json` contains Android signing details and should never be committed in a public repo.

## Project structure summary

- `www/` — Cordova app frontend and local app logic
- `www/js/db.js` — PouchDB data logic, auth, sync, orders, notifications
- `www/js/pages/` — page-specific screen logic
- `res/` — Android app icons
- `SpaccleWebsite/` — marketing site content
- `api/` — PHP web backend endpoints

## Notes

- For a production-ready deployment, move CouchDB access behind a secure backend and remove hardcoded credentials from the client.
