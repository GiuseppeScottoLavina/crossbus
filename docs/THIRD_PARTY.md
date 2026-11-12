# Documentation dependencies

The documentation vendors **marked 18.2.0**, licensed under MIT. Its unmodified UMD distribution, source map and [license](vendor/marked-LICENSE.md) are copied from the pinned development dependency by `scripts/sync-docs.js`.

The interactive playground uses `docs/assets/crossbus.min.js`, copied byte-for-byte from this checkout's built distribution. GitHub Pages publishes the `docs` folder, so the playground loads all required JavaScript from within that folder. No runtime npm dependency is added to the library.
