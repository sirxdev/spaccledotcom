# Spaccle

Spaccle is a hybrid laundry pickup and delivery app built with Apache Cordova. The repository contains the customer-facing app, rider/admin interfaces, and some website/backend content.

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

## Running the app locally

# If Cordova CLI is not installed globally, run:
> npm install -g cordova

# Or use npx if you prefer not to install it globally
> npx cordova prepare browser

Install dependencies:

```bash
npm install
```

Run in browser mode:

```bash
npm run dev
```

This starts an http-server and watches for file changes via chokidar.

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

- `www/js/config.defaults.js` contains dev/test credentials and is committed. For production, create `www/js/config.js` (gitignored) with overrides — see the file for the merge pattern.
- `www/js/config.js` is gitignored and was removed from git tracking. Existing clones should recreate it from `config.defaults.js` with production values.
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
