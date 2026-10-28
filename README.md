# PlayBox

PlayBox is a static, French-language film and TV discovery interface.

## Run locally

Open `index.html` from a local web server (for example, VS Code Live Server). In the app, select **TMDB**, enter a TMDB API v3 key, and choose **Vérifier et connecter**. The key is kept in this browser's local storage; it is not written to the project files.

This is a browser-only app, so any API key used by it is visible to the browser. Use a key intended for client-side use and follow TMDB's current API terms. Do not commit credentials.

The app loads daily trending titles, multi-search results, genre filters, movie/TV details, TV seasons and episodes, and links to available official YouTube trailers. It does not provide unauthorized streams.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys the repository root to GitHub Pages after a push to `main`. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source.

## TMDB attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
