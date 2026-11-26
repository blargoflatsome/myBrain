# My Brain TV launcher

The small app installed on the Samsung TV (Tizen 5.0 and later). It fills the screen with My Brain's TV page (`/tv/`
on the site) and keeps the TV awake (no screen saver) the whole time My Brain shows, so the night screen stays on
overnight, which the page can't do by itself (docs/SPEC.md §9 The launcher). Updates to the TV page arrive with a
normal deploy; this app only needs installing again if these files change.

Nothing in the website's build or tests uses this folder.

- `config.xml`: the app's name, icon and permissions, and the site it may reach.
- `index.html`, `launcher.js`: the full-screen frame, and the screen-saver calls once the TV page has loaded.

## Install it on the TV

You need [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
with the **Samsung TV Extension** and **Samsung Certificate Extension** (from its Package Manager), and the TV and
computer on the same network.

1. **Developer Mode on the TV:** open Apps, press 1 2 3 4 5 on the remote, turn Developer mode on, type your
   computer's IP address, then restart the TV (hold the power button until it turns off and on).
2. **Connect:** in Tizen Studio's Device Manager, add the TV by its IP address (Settings → General → Network →
   Network Status → IP Settings on the TV), or run:

   ```powershell
   C:\tizen-studio\tools\sdb.exe connect <TV IP address>
   ```

3. **Certificate (once):** in Tizen Studio's Certificate Manager, create a **Samsung** certificate profile for **TV**
   (name it `mybrain`), signing in with a Samsung account and choosing the connected TV for its device ID. The
   certificate and its password stay in Tizen Studio's own folder; never copy them into this repo.
4. **Build and install** from the repo's folder:

   ```powershell
   C:\tizen-studio\tools\ide\bin\tizen.bat package -t wgt -s mybrain -- tv-launcher
   ```

   ```powershell
   C:\tizen-studio\tools\ide\bin\tizen.bat install -n "My Brain.wgt" -- tv-launcher
   ```

5. **Pair:** open **My Brain** from the TV's Apps, then scan the QR code with your phone (or type the code on
   Account → Paired devices). The launcher keeps its own storage, so a TV paired in the TV's browser pairs once more
   here.

The built `.wgt` and Tizen Studio's signature files are ignored by git.

## Point it at another site

The site address is in two places: `SITE` in `launcher.js` and the first `access` line in `config.xml`. To try a
deploy preview, set both to its address (for example `https://deploy-preview-12--myadhdbrain.netlify.app`), build and
install again, then set them back. The TV page must be allowed in a frame there, which `public/_headers` does for `/tv/*`.

## If something's wrong

- **Black or error screen at start:** My Brain was out of reach. The launcher tries again every 30 seconds and when the
  network comes back.
- **The TV dims or the screen saver starts:** the TV refused the screen-saver call, or the page couldn't reach the
  launcher. Check the TV page loads in the launcher (not the TV's browser), and that `SITE` matches the address exactly.
- **The TV turns itself off overnight:** that's the TV's Auto Power Off, which apps can't stop. Turn it off in
  Settings → General → Eco Solution → Auto Power Off.
- **The page refuses to load in the frame:** the site's `/tv/*` headers must allow framing (`frame-ancestors 'self'
  file:`). Check them with `curl -I <site>/tv/`.
