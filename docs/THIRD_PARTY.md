# Documentation dependencies

The documentation vendors **marked 18.2.0**, licensed under MIT. Its unmodified UMD distribution, source map and [license](vendor/marked-LICENSE.md) are copied from the pinned development dependency by `scripts/sync-docs.js`.

The home page, the interactive playground and the live demos under `docs/demos/` use `docs/assets/crossbus.min.js` (the secure-channel demo also uses `docs/assets/plugins/encryption.min.js`), copied byte-for-byte from this checkout's built distribution. GitHub Pages publishes the `docs` folder, so the playground loads all required JavaScript from within that folder. No runtime npm dependency is added to the library.

The site pages load the IBM Plex Sans, IBM Plex Mono and Schibsted Grotesk fonts from Google Fonts (SIL Open Font License). Every page stays usable with system fonts if that request fails.

The repository's 0.1.5 benchmark input snapshot retains measured birpc, Penpal and Comlink distributions; their [original license texts](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/benchmarks/next-release/THIRD_PARTY_LICENSES.md) accompany that snapshot. These development comparison inputs are excluded from the npm package.
