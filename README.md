# BrickyProcky

Games and a web proxy in one glassy site: **https://ad3333m.github.io/brickyprocky/**

- **Games**: 680 games that play inside the page (no redirects), taken from the
  [Drive U 7](https://sites.google.com/view/drive-u-7-home/home) Google Site plus
  [Poxel.io](https://poxel.io). Search, categories, favourites and "jump back in".
- **Proxy**: open any site inside BrickyProcky. Suggested apps include GeForce NOW,
  Discord, YouTube, Spotify, TikTok, Twitch and Reddit.

It's a static site (everything is in `docs/`), served by GitHub Pages from the
`docs` folder of `main`.

## How it works

| Piece | Detail |
|---|---|
| Games | `docs/games/catalog.json` lists every game and how it loads. `doc` games are a Google Gadget XML document on jsDelivr that `play.html` writes into its own page, exactly as the original embed did. `swf` games play in [Ruffle](https://ruffle.rs). `frame` games (Apps Script web apps, Scratch, Poxel.io) are framed directly. `html` games are saved in `docs/games/html/`. |
| Covers | From the Drive U 7 listings where they exist; otherwise CrazyGames, Poki, the Flashpoint archive, Steam or Scratch by title; otherwise a screenshot of the game itself. |
| Ad blocking | `play.html` loads `assets/adshield.js` before the game: requests to ad and tracking servers fail (the way a browser ad blocker makes them fail, so game SDKs skip the ad), pop-ups are refused, and the "Close (12)" banner many uploads carry is switched off. Poxel.io is framed as `poxel.io/?cg`, its CrazyGames mode, whose ad SDK shows nothing off crazygames.com. Apps Script and Scratch games are other sites' pages, so the shield can't reach inside them. |
| Proxy | [Scramjet](https://github.com/MercuryWorkshop/scramjet) in a service worker (`docs/sw.js`, everything under `go/`), with [bare-mux](https://github.com/MercuryWorkshop/bare-mux) and the libcurl.js or Epoxy transport. Pages are TLS-encrypted in the browser and tunnelled over a public [Wisp](https://github.com/MercuryWorkshop/wisp-protocol) relay (Mercury Workshop or Anura; Settings can point it at your own). |

## Updating

```
npm install
node tools/vendor.js          # copy the proxy runtime + app icons into docs/
node tools/build-catalog.js   # re-read the games site, rebuild the catalog
node tools/find-covers.js     # covers for new games from public catalogs
node tools/serve.js 8093      # preview at http://localhost:8093/brickyprocky/
node tools/snap-covers.js     # screenshot any game still without a cover
```

`build-catalog.js` and `make_covers.py` need Python with Pillow; `snap-covers.js`
needs Edge or Chrome and the preview server running.

## Credits

Scramjet (MIT), bare-mux (MIT), libcurl-transport and epoxy-transport (AGPL-3.0,
source at the links above), Ruffle (MIT/Apache-2.0), Simple Icons (CC0). Brand
icons belong to their owners. Games belong to their creators; BrickyProcky only
links to where the Drive U 7 site already loads them from.
