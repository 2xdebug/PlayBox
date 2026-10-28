const TMDB_API_ROOT = "https://api.themoviedb.org/3";
const TMDB_IMAGE_ROOT = "https://image.tmdb.org/t/p/";
const API_KEY_STORAGE = "playbox.tmdb.apiKey";

const searchInput = document.querySelector("#search-input");
const searchBox = document.querySelector(".search-box");
const movieGrid = document.querySelector("#catalogue");
const genreFilters = document.querySelector("#genre-filters");
const catalogStatus = document.querySelector("#catalog-status");
const emptyState = document.querySelector("#empty-state");
const apiDialog = document.querySelector("#api-dialog");
const apiForm = document.querySelector("#api-form");
const apiKeyInput = document.querySelector("#tmdb-key");
const apiError = document.querySelector("#api-error");
const detailDialog = document.querySelector("#detail-dialog");
const detailError = document.querySelector("#detail-error");
const seasonSelect = document.querySelector("#season-select");
const episodeSelect = document.querySelector("#episode-select");
const episodeOverview = document.querySelector("#episode-overview");

let apiKey = "";
let genresById = new Map();
let catalogItems = [];
let activeGenreName = null;
let activeMediaType = "all";
let searchTimer;
let searchSequence = 0;
let seasonSequence = 0;

function setCatalogStatus(message, isError = false) {
  catalogStatus.replaceChildren(document.createTextNode(message));
  catalogStatus.classList.toggle("is-error", isError);
  if (!apiKey) {
    const configureButton = document.createElement("button");
    configureButton.className = "inline-action";
    configureButton.type = "button";
    configureButton.textContent = "Configurer TMDB";
    configureButton.addEventListener("click", openApiDialog);
    catalogStatus.append(" ", configureButton);
  }
}

function openApiDialog() {
  apiError.hidden = true;
  apiKeyInput.value = apiKey;
  apiDialog.showModal();
  apiKeyInput.focus();
}

function formatApiError(error) {
  return error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
}

async function fetchTmdb(path, params = {}, key = apiKey) {
  if (!key) {
    throw new Error("Clé TMDB manquante. Configurez votre clé API pour continuer.");
  }

  const url = new URL(`${TMDB_API_ROOT}${path}`);
  url.search = new URLSearchParams({
    api_key: key,
    language: "fr-FR",
    ...params,
  });

  let response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("TMDB ne répond pas. Réessayez dans quelques instants.");
    }
    throw new Error("TMDB est inaccessible. Vérifiez votre connexion Internet.");
  } finally {
    window.clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("TMDB a renvoyé une réponse illisible.");
  }

  if (!response.ok) {
    throw new Error(payload.status_message || `Erreur TMDB (${response.status}).`);
  }

  return payload;
}

async function connectTmdb(key, persistKey) {
  setCatalogStatus("Connexion à TMDB…");
  const [trending, movieGenres, tvGenres] = await Promise.all([
    fetchTmdb("/trending/all/day", {}, key),
    fetchTmdb("/genre/movie/list", {}, key),
    fetchTmdb("/genre/tv/list", {}, key),
  ]);

  if (persistKey) {
    try {
      localStorage.setItem(API_KEY_STORAGE, key);
    } catch {
      throw new Error("Le navigateur ne permet pas de conserver la clé TMDB localement.");
    }
  }

  apiKey = key;
  genresById = new Map(
    [...movieGenres.genres, ...tvGenres.genres].map((genre) => [genre.id, genre.name]),
  );
  catalogItems = trending.results.filter((item) => item.media_type === "movie" || item.media_type === "tv");
  renderGenreFilters();
  renderCatalog();
  setCatalogStatus(`${catalogItems.length} titres tendance chargés depuis TMDB.`);
  updateHero(catalogItems[0]);
}

function getTitle(item) {
  return item.title || item.name || "Titre sans nom";
}

function getYear(item) {
  const date = item.release_date || item.first_air_date;
  return date ? date.slice(0, 4) : "—";
}

function getItemGenres(item) {
  return (item.genre_ids || []).map((id) => genresById.get(id)).filter(Boolean);
}

function renderGenreFilters() {
  genreFilters.replaceChildren();
  const allButton = createGenreButton(null, "Tout voir");
  allButton.classList.add("is-selected");
  allButton.setAttribute("aria-pressed", "true");
  genreFilters.append(allButton);

  const uniqueGenres = [...new Set(genresById.values())].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  uniqueGenres.forEach((name) => genreFilters.append(createGenreButton(name)));
}

function createGenreButton(genreName, label = genreName || "Tout voir") {
  const button = document.createElement("button");
  button.className = "filter-chip";
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    activeGenreName = genreName;
    genreFilters.querySelectorAll(".filter-chip").forEach((chip) => {
      const selected = chip === button;
      chip.classList.toggle("is-selected", selected);
      chip.setAttribute("aria-pressed", String(selected));
    });
    renderCatalog();
  });
  return button;
}

function renderCatalog() {
  const visibleItems = catalogItems.filter((item) => {
    const matchesType = activeMediaType === "all" || item.media_type === activeMediaType;
    const matchesGenre = activeGenreName === null || getItemGenres(item).includes(activeGenreName);
    return matchesType && matchesGenre;
  });

  movieGrid.replaceChildren(...visibleItems.map(createMovieCard));
  emptyState.hidden = visibleItems.length > 0;
  movieGrid.hidden = visibleItems.length === 0;
  movieGrid.querySelectorAll(".movie-card").forEach((card, index) => {
    card.style.animationDelay = `${Math.min(index, 8) * 45}ms`;
    card.classList.add("is-visible");
  });
}

function createMovieCard(item) {
  const title = getTitle(item);
  const mediaType = item.media_type;
  const genreNames = getItemGenres(item);
  const article = document.createElement("article");
  article.className = "movie-card reveal";

  const posterButton = document.createElement("button");
  posterButton.className = "poster tmdb-poster";
  posterButton.type = "button";
  posterButton.setAttribute("aria-label", `Découvrir ${title}`);
  posterButton.dataset.id = String(item.id);
  posterButton.dataset.mediaType = mediaType;

  if (item.poster_path) {
    const image = document.createElement("img");
    image.className = "tmdb-poster-image";
    image.src = `${TMDB_IMAGE_ROOT}w500${item.poster_path}`;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => image.remove(), { once: true });
    posterButton.append(image);
  }

  const shade = document.createElement("span");
  shade.className = "poster-shade";
  shade.setAttribute("aria-hidden", "true");
  const topline = document.createElement("span");
  topline.className = "poster-topline";
  const brand = document.createElement("span");
  brand.textContent = "PB";
  const kind = document.createElement("span");
  kind.textContent = mediaType === "movie" ? "FILM" : "SÉRIE";
  topline.append(brand, kind);
  const play = document.createElement("span");
  play.className = "card-play";
  play.setAttribute("aria-hidden", "true");
  play.textContent = "▶";
  posterButton.append(shade, topline, play);

  const info = document.createElement("div");
  info.className = "card-info";
  const copy = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const meta = document.createElement("p");
  meta.textContent = `${getYear(item)} · ${genreNames[0] || (mediaType === "movie" ? "Film" : "Série")}`;
  copy.append(heading, meta);

  const rating = document.createElement("span");
  rating.className = "card-rating";
  rating.textContent = `★ ${Number(item.vote_average || 0).toFixed(1).replace(".", ",")}`;
  info.append(copy, rating);
  article.append(posterButton, info);
  return article;
}

function updateHero(item) {
  if (!item) return;
  const title = getTitle(item);
  const heroTitle = document.querySelector("#hero-title");
  const words = title.split(/\s+/);
  const emphasized = words.pop() || title;
  heroTitle.replaceChildren(document.createTextNode(`${words.join(" ")}${words.length ? " " : ""}`));
  heroTitle.append(document.createElement("br"));
  const accent = document.createElement("span");
  accent.textContent = `${emphasized}.`;
  heroTitle.append(accent);
  document.querySelector("#hero-description").textContent =
    item.overview || "Découvrez les films et séries qui font parler d’eux en ce moment.";

  const metadata = document.querySelector("#hero-meta");
  metadata.replaceChildren();
  const rating = document.createElement("span");
  rating.className = "rating";
  rating.textContent = `★ ${Number(item.vote_average || 0).toFixed(1).replace(".", ",")}`;
  const year = document.createElement("span");
  year.textContent = getYear(item);
  const divider = document.createElement("span");
  divider.className = "meta-divider";
  const genre = document.createElement("span");
  genre.textContent = getItemGenres(item)[0] || (item.media_type === "movie" ? "Film" : "Série");
  metadata.append(rating, year, divider, genre);

  if (item.backdrop_path) {
    const backdrop = `${TMDB_IMAGE_ROOT}original${item.backdrop_path}`;
    document.querySelector(".hero-backdrop").style.backgroundImage =
      `linear-gradient(90deg, #090a0d 0%, rgb(9 10 13 / 97%) 22%, rgb(9 10 13 / 71%) 49%, rgb(9 10 13 / 13%) 100%), linear-gradient(0deg, #090a0d 0%, transparent 28%, rgb(9 10 13 / 25%) 100%), url("${backdrop}")`;
  }
}

async function searchCatalog(query, sequence) {
  setCatalogStatus(`Recherche de « ${query} »…`);
  try {
    const response = await fetchTmdb("/search/multi", { query, include_adult: "false", page: "1" });
    if (sequence !== searchSequence) return;
    catalogItems = response.results.filter(
      (item) => item.media_type === "movie" || item.media_type === "tv",
    );
    renderCatalog();
    setCatalogStatus(`${catalogItems.length} résultat(s) pour « ${query} ».`);
  } catch (error) {
    if (sequence !== searchSequence) return;
    setCatalogStatus(formatApiError(error), true);
  }
}

async function restoreTrending() {
  setCatalogStatus("Chargement des tendances…");
  try {
    const response = await fetchTmdb("/trending/all/day");
    catalogItems = response.results.filter(
      (item) => item.media_type === "movie" || item.media_type === "tv",
    );
    renderCatalog();
    setCatalogStatus(`${catalogItems.length} titres tendance chargés depuis TMDB.`);
    updateHero(catalogItems[0]);
  } catch (error) {
    setCatalogStatus(formatApiError(error), true);
  }
}

async function showDetails(id, mediaType) {
  detailError.hidden = true;
  document.querySelector("#detail-title").textContent = "Chargement…";
  document.querySelector("#detail-type").textContent = mediaType === "movie" ? "FILM" : "SÉRIE";
  document.querySelector("#detail-meta").replaceChildren();
  document.querySelector("#detail-overview").textContent = "";
  document.querySelector("#trailer-actions").replaceChildren();
  document.querySelector("#episode-controls").hidden = mediaType !== "tv";
  document.querySelector("#detail-backdrop").style.backgroundImage = "";
  detailDialog.showModal();

  try {
    const [details, videosResult] = await Promise.allSettled([
      fetchTmdb(`/${mediaType}/${id}`),
      fetchTmdb(`/${mediaType}/${id}/videos`),
    ]);
    if (details.status === "rejected") throw details.reason;

    const item = details.value;
    document.querySelector("#detail-title").textContent = getTitle(item);
    document.querySelector("#detail-overview").textContent =
      item.overview || "Aucun synopsis n’est disponible en français.";

    const meta = document.querySelector("#detail-meta");
    const rating = document.createElement("span");
    rating.className = "rating";
    rating.textContent = `★ ${Number(item.vote_average || 0).toFixed(1).replace(".", ",")}`;
    const date = document.createElement("span");
    date.textContent = getYear(item);
    const genres = document.createElement("span");
    genres.textContent = (item.genres || []).map((genre) => genre.name).join(" · ");
    meta.append(rating, date, genres);

    if (item.backdrop_path) {
      document.querySelector("#detail-backdrop").style.backgroundImage =
        `linear-gradient(0deg, #111018, transparent 90%), url("${TMDB_IMAGE_ROOT}w1280${item.backdrop_path}")`;
    }

    if (mediaType === "tv") {
      populateSeasons(item.seasons || [], id);
    }

    if (videosResult.status === "fulfilled") {
      renderTrailer(videosResult.value.results || []);
    } else {
      showDetailNotice("Les bandes-annonces officielles n’ont pas pu être chargées.");
    }
  } catch (error) {
    detailError.textContent = formatApiError(error);
    detailError.hidden = false;
  }
}

function renderTrailer(videos) {
  const trailer = videos.find(
    (video) => video.site === "YouTube" && video.type === "Trailer" && video.official,
  ) || videos.find((video) => video.site === "YouTube" && video.type === "Trailer");
  const actions = document.querySelector("#trailer-actions");
  actions.replaceChildren();

  if (!trailer) {
    showDetailNotice("Aucune bande-annonce officielle n’est disponible.");
    return;
  }

  const link = document.createElement("a");
  link.className = "button button-primary";
  link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Voir la bande-annonce officielle ↗";
  actions.append(link);
}

function showDetailNotice(message) {
  detailError.textContent = message;
  detailError.hidden = false;
}

function populateSeasons(seasons, seriesId) {
  const availableSeasons = seasons.filter((season) => season.season_number > 0);
  seasonSelect.replaceChildren();
  episodeSelect.replaceChildren();
  if (availableSeasons.length === 0) {
    seasonSelect.add(new Option("Aucune saison disponible", ""));
    episodeSelect.add(new Option("Aucun épisode disponible", ""));
    return;
  }

  availableSeasons.forEach((season) => {
    seasonSelect.add(new Option(season.name, String(season.season_number)));
  });
  seasonSelect.onchange = () => loadSeason(seriesId, Number(seasonSelect.value));
  loadSeason(seriesId, availableSeasons[0].season_number);
}

async function loadSeason(seriesId, seasonNumber) {
  const request = ++seasonSequence;
  episodeSelect.replaceChildren(new Option("Chargement des épisodes…", ""));
  episodeOverview.textContent = "";

  try {
    const season = await fetchTmdb(`/tv/${seriesId}/season/${seasonNumber}`);
    if (request !== seasonSequence) return;
    episodeSelect.replaceChildren();
    season.episodes.forEach((episode) => {
      episodeSelect.add(
        new Option(`${episode.episode_number}. ${episode.name}`, String(episode.episode_number)),
      );
    });
    episodeSelect.onchange = () => showEpisodeOverview(season.episodes);
    if (season.episodes.length) showEpisodeOverview(season.episodes);
    else episodeSelect.add(new Option("Aucun épisode disponible", ""));
  } catch (error) {
    if (request !== seasonSequence) return;
    episodeSelect.replaceChildren(new Option("Erreur de chargement", ""));
    showDetailNotice(formatApiError(error));
  }
}

function showEpisodeOverview(episodes) {
  const selectedEpisode = episodes.find(
    (episode) => episode.episode_number === Number(episodeSelect.value),
  );
  episodeOverview.textContent =
    selectedEpisode?.overview || "Aucun résumé n’est disponible pour cet épisode.";
}

document.querySelector("#api-settings-button").addEventListener("click", openApiDialog);
document.querySelector("#configure-tmdb-inline").addEventListener("click", openApiDialog);

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

for (const dialog of [apiDialog, detailDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

apiForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  apiError.hidden = true;
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiError.textContent = "Saisissez une clé API TMDB.";
    apiError.hidden = false;
    return;
  }

  const submitButton = apiForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    await connectTmdb(key, true);
    apiDialog.close();
  } catch (error) {
    apiError.textContent = formatApiError(error);
    apiError.hidden = false;
    setCatalogStatus(formatApiError(error), true);
  } finally {
    submitButton.disabled = false;
  }
});

searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  const sequence = ++searchSequence;
  if (query.length < 2) {
    if (query.length === 0 && apiKey) restoreTrending();
    return;
  }
  searchTimer = window.setTimeout(() => searchCatalog(query, sequence), 350);
});

document.querySelector("#catalogue").addEventListener("click", (event) => {
  const posterButton = event.target.closest(".tmdb-poster");
  if (posterButton) showDetails(posterButton.dataset.id, posterButton.dataset.mediaType);
});

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    const mediaType = link.dataset.mediaType || "all";
    if (mediaType === "movie" || mediaType === "tv" || mediaType === "all") {
      activeMediaType = mediaType;
      document.querySelectorAll(".nav-link").forEach((navLink) => {
        navLink.classList.toggle("is-active", navLink === link);
      });
      renderCatalog();
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    searchInput.focus();
  }

  if (event.key === "Escape" && document.activeElement === searchInput) {
    searchInput.value = "";
    searchInput.blur();
    if (apiKey) restoreTrending();
  }
});

try {
  const savedKey = localStorage.getItem(API_KEY_STORAGE);
  if (savedKey) {
    connectTmdb(savedKey, false).catch((error) => {
      setCatalogStatus(formatApiError(error), true);
      openApiDialog();
    });
  }
} catch {
  setCatalogStatus("Le stockage local est indisponible. Configurez TMDB pour cette session.");
  openApiDialog();
}
