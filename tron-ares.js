// =====================================================
// TRON ARES IPTV PLAYER - JS CLEAN + RESUME + TRACKS
// =====================================================

// --------- RESUME POSITIONS (CHANNELS SEULEMENT) ---------
let resumePositions = {};

try {
  const saved = localStorage.getItem('tronAresResume');
  if (saved) resumePositions = JSON.parse(saved);
} catch {
  resumePositions = {};
}

// --------- DATA MODEL ---------
const channels = [];      // Liste M3U principale
const frChannels = [];    // Liste M3U FR
const iframeItems = [];   // Overlays / iFrames

let currentIndex = -1;
let currentFrIndex = -1;
let currentIframeIndex = -1;
let currentListType = null; // 'channels' | 'fr' | 'iframe'

let overlayMode = false;

let hlsInstance = null;
let dashInstance = null;

let currentEntry = null;
let externalFallbackTried = false;

// --------- DOM REFS ---------
const videoEl = document.getElementById('videoEl');
const iframeOverlay = document.getElementById('iframeOverlay');
const iframeEl = document.getElementById('iframeEl');

const channelFrListEl = document.getElementById('channelFrList');
const channelListEl = document.getElementById('channelList');
const iframeListEl = document.getElementById('iframeList');
const favoriteListEl = document.getElementById('favoriteList');

const statusPill = document.getElementById('statusPill');
const npLogo = document.getElementById('npLogo');
const npTitle = document.getElementById('npTitle');
const npSub = document.getElementById('npSub');
const npBadge = document.getElementById('npBadge');

const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');

const urlInput = document.getElementById('urlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');
const fileInput = document.getElementById('fileInput');
const openFileBtn = document.getElementById('openFileBtn');
const fileNameLabel = document.getElementById('fileNameLabel');

const iframeTitleInput = document.getElementById('iframeTitleInput');
const iframeUrlInput = document.getElementById('iframeUrlInput');
const addIframeBtn = document.getElementById('addIframeBtn');

const exportM3uJsonBtn = document.getElementById('exportM3uJsonBtn');
const exportIframeJsonBtn = document.getElementById('exportIframeJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const jsonArea = document.getElementById('jsonArea');

const toggleOverlayBtn = document.getElementById('toggleOverlayBtn');
const fullPageBtn = document.getElementById('fullPageBtn');
const playerContainer = document.getElementById('playerContainer');
const appShell = document.getElementById('appShell');

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const fxToggleBtn = document.getElementById('fxToggleBtn');
const pipToggleBtn = document.getElementById('pipToggleBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');

// --- Nouveaux contrôles pistes (dans now-playing) ---
const npTracks = document.getElementById('npTracks');
const audioGroup = document.getElementById('audioGroup');
const subtitleGroup = document.getElementById('subtitleGroup');
const audioTrackBtn = document.getElementById('audioTrackBtn');
const subtitleTrackBtn = document.getElementById('subtitleTrackBtn');
const audioTrackMenu = document.getElementById('audioTrackMenu');
const subtitleTrackMenu = document.getElementById('subtitleTrackMenu');

// Masquer les contrôles pistes au démarrage
if (npTracks) {
  npTracks.classList.add('hidden');
}

// =====================================================
// UTILS
// =====================================================

function setStatus(text) {
  statusPill.textContent = text;
}

function normalizeName(name) {
  return name || 'Flux sans titre';
}

function deriveLogoFromName(name) {
  const initial = (name || '?').trim()[0] || '?';
  return { type: 'letter', value: initial.toUpperCase() };
}

function isProbablyHls(url) {
  return /\.m3u8(\?|$)/i.test(url);
}

function isProbablyDash(url) {
  return /\.mpd(\?|$)/i.test(url);
}

function isProbablyPlaylist(url) {
  return /\.m3u8?(\?|$)/i.test(url);
}

function isYoutubeUrl(url) {
  return /youtu\.be|youtube\.com/i.test(url);
}

function youtubeToEmbed(url) {
  try {
    const u = new URL(url, window.location.href);
    let id = null;
    if (u.hostname.includes('youtu.be')) {
      id = u.pathname.replace('/', '');
    } else {
      id = u.searchParams.get('v');
    }
    return id ? `https://www.youtube.com/embed/${id}` : url;
  } catch {
    return url;
  }
}
function isMovieContext() {
  // Ici tu peux raffiner plus tard (ex: group = "FILMS" etc.)
  return currentListType === 'channels';
}

// =====================================================
// RENDERING
// =====================================================

function renderLists() {
  renderChannelList();
  renderChannelFrList();
  renderIframeList();
  renderFavoritesList();
}

function renderChannelFrList() {
  channelFrListEl.innerHTML = '';
  frChannels.forEach((ch, idx) => {
    const el = createChannelElement(ch, idx, 'fr');
    channelFrListEl.appendChild(el);
  });
}

function renderChannelList() {
  channelListEl.innerHTML = '';
  channels.forEach((ch, idx) => {
    const el = createChannelElement(ch, idx, 'channels');
    channelListEl.appendChild(el);
  });
}

function renderIframeList() {
  iframeListEl.innerHTML = '';
  iframeItems.forEach((item, idx) => {
    const el = createChannelElement(item, idx, 'iframe');
    iframeListEl.appendChild(el);
  });
}

function renderFavoritesList() {
  favoriteListEl.innerHTML = '';

  const favs = [
    ...channels.filter(c => c.isFavorite),
    ...frChannels.filter(c => c.isFavorite),
    ...iframeItems.filter(i => i.isFavorite)
  ];

  favs.forEach((entry, idx) => {
    const el = createChannelElement(
      entry,
      idx,
      entry.listType || (entry.isIframe ? 'iframe' : 'channels')
    );
    favoriteListEl.appendChild(el);
  });
}

// =====================================================
// CREATE CHANNEL ELEMENT
// =====================================================

function createChannelElement(entry, index, sourceType) {
  const li = document.createElement('div');
  li.className = 'channel-item';
  li.dataset.index = index;
  li.dataset.type = sourceType;

  if (sourceType === 'channels' && currentListType === 'channels' && index === currentIndex)
    li.classList.add('active');
  if (sourceType === 'fr' && currentListType === 'fr' && index === currentFrIndex)
    li.classList.add('active');
  if (sourceType === 'iframe' && currentListType === 'iframe' && index === currentIframeIndex)
    li.classList.add('active');

  const logoDiv = document.createElement('div');
  logoDiv.className = 'channel-logo';

  if (entry.logo && entry.logo.type === 'image') {
    const img = document.createElement('img');
    img.src = entry.logo.value;
    img.alt = entry.name;
    logoDiv.appendChild(img);
  } else {
    logoDiv.textContent = entry.logo?.value ?? deriveLogoFromName(entry.name).value;
  }

  const metaDiv = document.createElement('div');
  metaDiv.className = 'channel-meta';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'channel-title';
  titleDiv.textContent = normalizeName(entry.name);

  const subDiv = document.createElement('div');
  subDiv.className = 'channel-sub';
  subDiv.textContent = entry.group || (entry.isIframe ? 'Overlay / iFrame' : 'Flux M3U');

  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'channel-tags';

  const tag = document.createElement('div');
  tag.className = 'tag-chip' + (entry.isIframe ? ' tag-chip--iframe' : '');
  tag.textContent = entry.isIframe ? 'IFRAME' : 'STREAM';
  tagsDiv.appendChild(tag);

  if (isYoutubeUrl(entry.url)) {
    const ytTag = document.createElement('div');
    ytTag.className = 'tag-chip tag-chip--iframe';
    ytTag.textContent = 'YOUTUBE';
    tagsDiv.appendChild(ytTag);
  }

  metaDiv.appendChild(titleDiv);
  metaDiv.appendChild(subDiv);
  metaDiv.appendChild(tagsDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'channel-actions';

  const favBtn = document.createElement('button');
  favBtn.className = 'icon-btn';
  favBtn.innerHTML = '★';
  favBtn.title = 'Ajouter / enlever des favoris';
  favBtn.dataset.fav = entry.isFavorite ? 'true' : 'false';

  favBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    entry.isFavorite = !entry.isFavorite;
    favBtn.dataset.fav = entry.isFavorite ? 'true' : 'false';
    renderFavoritesList();
  });

  const ovBtn = document.createElement('button');
  ovBtn.className = 'icon-btn';
  ovBtn.innerHTML = '⧉';
  ovBtn.title = 'Lire en overlay iFrame';
  ovBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    playEntryAsOverlay(entry);
  });

  actionsDiv.appendChild(favBtn);
  actionsDiv.appendChild(ovBtn);

  li.appendChild(logoDiv);
  li.appendChild(metaDiv);
  li.appendChild(actionsDiv);

  li.addEventListener('click', () => {
    if (sourceType === 'channels') playChannel(index);
    else if (sourceType === 'fr') playFrChannel(index);
    else if (sourceType === 'iframe') playIframe(index);
  });

  return li;
}

// =====================================================
// NOW PLAYING BAR
// =====================================================

function updateNowPlaying(entry, modeLabel) {
  if (!entry) {
    npLogo.textContent = '';
    npTitle.textContent = 'Aucune chaîne sélectionnée';
    npSub.textContent = 'Choisissez une chaîne dans la liste';
    npBadge.textContent = 'IDLE';
    return;
  }

  const logo = entry.logo || deriveLogoFromName(entry.name);
  npLogo.innerHTML = '';

  if (logo.type === 'image') {
    const img = document.createElement('img');
    img.src = logo.value;
    img.alt = entry.name;
    npLogo.appendChild(img);
  } else {
    npLogo.textContent = logo.value;
  }

  npTitle.textContent = normalizeName(entry.name);
  npSub.textContent = entry.group || (entry.isIframe ? 'Overlay / iFrame' : 'Flux M3U');
  npBadge.textContent = modeLabel;
}

// =====================================================
// PISTES AUDIO / SOUS-TITRES (HLS) - CHANNELLIST SEULEMENT
// =====================================================

function isMovieContext() {
  // On limite les contrôles pistes aux films dans channelList
  return currentListType === 'channels';
}

function closeAllTrackMenus() {
  audioTrackMenu?.classList.remove('open');
  subtitleTrackMenu?.classList.remove('open');
}

function buildAudioTrackMenu() {
  if (!audioTrackMenu || !hlsInstance || !isMovieContext()) return;

  const tracks = hlsInstance.audioTracks || [];
  audioTrackMenu.innerHTML = '';

  if (!tracks.length) return;

  const header = document.createElement('div');
  header.className = 'np-track-menu-header';
  header.textContent = 'Pistes audio';
  audioTrackMenu.appendChild(header);

  tracks.forEach((t, idx) => {
    const item = document.createElement('div');
    item.className = 'np-track-item';
    if (idx === hlsInstance.audioTrack) item.classList.add('active');

    const label = document.createElement('div');
    label.className = 'np-track-item-label';
    label.textContent = t.name || t.lang || ('Piste ' + (idx + 1));

    const meta = document.createElement('div');
    meta.className = 'np-track-item-meta';
    meta.textContent = (t.lang || '').toUpperCase();

    item.append(label, meta);

    item.addEventListener('click', () => {
      hlsInstance.audioTrack = idx;
      buildAudioTrackMenu();
      closeAllTrackMenus();
    });

    audioTrackMenu.appendChild(item);
  });
}

function buildSubtitleTrackMenu() {
  if (!subtitleTrackMenu || !isMovieContext()) return;

  subtitleTrackMenu.innerHTML = '';

  let useHls = false;
  let tracks = [];
  let activeIndex = -1;

  // 1) Sous-titres HLS
  if (hlsInstance && Array.isArray(hlsInstance.subtitleTracks) && hlsInstance.subtitleTracks.length > 0) {
    useHls = true;
    tracks = hlsInstance.subtitleTracks;
    activeIndex = hlsInstance.subtitleTrack; // -1 = off
  } else {
    // 2) Fallback : textTracks natifs du <video>
    const tt = Array.from(videoEl.textTracks || []).filter(t =>
      t.kind === 'subtitles' || t.kind === 'captions'
    );
    tracks = tt;
    if (tt.length) {
      activeIndex = tt.findIndex(t => t.mode === 'showing');
    }
  }

  const header = document.createElement('div');
  header.className = 'np-track-menu-header';
  header.textContent = 'Sous-titres';
  subtitleTrackMenu.appendChild(header);

  // Si aucune piste trouvée → on affiche juste "Aucun disponible"
  if (!tracks.length) {
    const empty = document.createElement('div');
    empty.className = 'np-track-item';
    empty.textContent = 'Aucun sous-titre disponible';
    subtitleTrackMenu.appendChild(empty);
    return;
  }

  // --- Option "Aucun" ---
  const offItem = document.createElement('div');
  offItem.className = 'np-track-item';
  if (activeIndex === -1) offItem.classList.add('active');

  const offLabel = document.createElement('div');
  offLabel.className = 'np-track-item-label';
  offLabel.textContent = 'Aucun';

  offItem.appendChild(offLabel);
  offItem.addEventListener('click', () => {
    if (useHls && hlsInstance) {
      hlsInstance.subtitleTrack = -1;
    } else {
      Array.from(videoEl.textTracks || []).forEach(t => {
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          t.mode = 'disabled';
        }
      });
    }
    buildSubtitleTrackMenu();
    closeAllTrackMenus();
  });
  subtitleTrackMenu.appendChild(offItem);

  // --- Liste des pistes ---
  tracks.forEach((t, idx) => {
    const item = document.createElement('div');
    item.className = 'np-track-item';
    if (idx === activeIndex) item.classList.add('active');

    const label = document.createElement('div');
    label.className = 'np-track-item-label';
    label.textContent = t.name || t.label || t.lang || ('Sous-titres ' + (idx + 1));

    const meta = document.createElement('div');
    meta.className = 'np-track-item-meta';
    meta.textContent = (t.lang || t.language || '').toUpperCase();

    item.append(label, meta);

    item.addEventListener('click', () => {
      if (useHls && hlsInstance) {
        hlsInstance.subtitleTrack = idx;
      } else {
        Array.from(videoEl.textTracks || []).forEach((track, i) => {
          if (track.kind === 'subtitles' || track.kind === 'captions') {
            track.mode = (i === idx ? 'showing' : 'disabled');
          }
        if (tracks.length > 1) {
  subtitleTrackMenu.classList.add("open");
}

});
      }
      buildSubtitleTrackMenu();
      closeAllTrackMenus();
    });

    subtitleTrackMenu.appendChild(item);
  });
}



function updateTrackControlsVisibility() {
  if (!npTracks) return;

  // On n’affiche les boutons que pour la liste principale (films)
  if (!isMovieContext()) {
    npTracks.classList.add('hidden');
    return;
  }

  // On montre toujours le bloc et les deux boutons,
  // même si on ne trouve pas encore de pistes.
  npTracks.classList.remove('hidden');
  audioGroup?.classList.remove('hidden');
  subtitleGroup?.classList.remove('hidden');
}


function refreshTrackMenus() {
  buildAudioTrackMenu();
  buildSubtitleTrackMenu();
  updateTrackControlsVisibility();
  audioTrackBtn.classList.toggle('active', activeAudioIndex !== -1);
  subtitleTrackBtn.classList.toggle('active', activeSubtitleIndex !== -1);
}

// =====================================================
// PLAYER LOGIC
// =====================================================

function destroyHls() {
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch (e) {}
    hlsInstance = null;
  }
  if (npTracks) {
    npTracks.classList.add('hidden');
  }
}

function destroyDash() {
  if (dashInstance) {
    try { dashInstance.reset(); } catch (e) {}
    dashInstance = null;
  }
}

function showVideo() {
  overlayMode = false;
  iframeOverlay.classList.add('hidden');
  iframeEl.src = 'about:blank';
  videoEl.style.visibility = 'visible';
}

function showIframe() {
  overlayMode = true;
  iframeOverlay.classList.remove('hidden');
  videoEl.pause();
  videoEl.style.visibility = 'hidden';
}

function playEntryAsOverlay(entry) {
  if (!entry || !entry.url) return;

  showIframe();
  let url = entry.url;

  if (isYoutubeUrl(url)) {
    url = youtubeToEmbed(url);
    url += (url.includes('?') ? '&' : '?') + 'autoplay=1&mute=1';
  }

  iframeEl.src = url;
  updateNowPlaying(entry, 'IFRAME');
  setStatus('Overlay iFrame actif');
}

function fallbackToExternalPlayer(entry) {
  if (!entry || !entry.url) return;

  showIframe();
  const base = 'https://vsalema.github.io/play/?';
  iframeEl.src = base + encodeURIComponent(entry.url);

  updateNowPlaying(entry, 'EXT-PLAYER');
  setStatus('Lecture via lecteur externe');
}

function playUrl(entry) {
  if (!entry || !entry.url) return;

  currentEntry = entry;
  externalFallbackTried = false;

  const url = entry.url;

  // RTP / SMIL => lecteur externe direct
  if (/rtp\.pt/i.test(url) || /smil:/i.test(url)) {
    fallbackToExternalPlayer(entry);
    return;
  }

  // IFRAME / YouTube
  if (entry.isIframe || isYoutubeUrl(url)) {
    playEntryAsOverlay(entry);
    return;
  }

  // Lecture vidéo classique
  showVideo();
  destroyHls();
  destroyDash();

  videoEl.removeAttribute('src');
  videoEl.load();

  let modeLabel = 'VIDEO';

  if (isProbablyDash(url) && window.dashjs) {
    try {
      dashInstance = dashjs.MediaPlayer().create();
      dashInstance.initialize(videoEl, url, true);
      modeLabel = 'DASH';

      dashInstance.on(dashjs.MediaPlayer.events.ERROR, e => {
        console.error('DASH error:', e);
        setStatus('Erreur DASH');
      });
    } catch (e) {
      console.error('DASH init error:', e);
      modeLabel = 'VIDEO';
      videoEl.src = url;
    }
  } else if (isProbablyHls(url) && window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls();
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(videoEl);
    modeLabel = 'HLS';

    // Brancher menus pistes
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      refreshTrackMenus();
    });

    hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      refreshTrackMenus();
    });

    hlsInstance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      refreshTrackMenus();
    });

    hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
      refreshTrackMenus();
    });

    hlsInstance.on(Hls.Events.SUBTITLE_TRACK_SWITCH, () => {
      refreshTrackMenus();
    });

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS error:', data);
      if (!externalFallbackTried && data.fatal && currentEntry) {
        externalFallbackTried = true;
        fallbackToExternalPlayer(currentEntry);
      }
    });
  } else {
    videoEl.src = url;
    if (url.match(/\.(mp3|aac|ogg)(\?|$)/i)) {
      modeLabel = 'AUDIO';
    } else {
      modeLabel = 'VIDEO';
    }
  }

  // Reprise lecture seulement si on vient de channelList
  videoEl.onloadedmetadata = () => {
    try {
      if (currentListType !== 'channels') return;

      const key = entry.url;
      const savedPos = resumePositions[key];

      if (
        typeof savedPos === 'number' &&
        savedPos > 10 &&
        isFinite(videoEl.duration) &&
        savedPos < videoEl.duration - 5
      ) {
        videoEl.currentTime = savedPos;
      }
    } catch (e) {
      console.warn('Erreur reprise position', e);
    }
   refreshTrackMenus();
};

  videoEl.play().catch(() => {});
  updateNowPlaying(entry, modeLabel);
  setStatus('Lecture en cours');
}

// =====================================================
// PLAYERS FOR EACH LIST + SCROLL AUTO
// =====================================================

function playChannel(index) {
  if (index < 0 || index >= channels.length) return;
  currentListType = 'channels';
  currentIndex = index;
  const entry = channels[index];
  renderChannelList();
  playUrl(entry);
  scrollToActiveItem();
}

function playFrChannel(index) {
  if (index < 0 || index >= frChannels.length) return;
  currentListType = 'fr';
  currentFrIndex = index;
  const entry = frChannels[index];
  renderChannelFrList();
  playUrl(entry);
  scrollToActiveItem();
}

function playIframe(index) {
  if (index < 0 || index >= iframeItems.length) return;
  currentListType = 'iframe';
  currentIframeIndex = index;
  const entry = iframeItems[index];
  renderIframeList();
  playUrl(entry);
  scrollToActiveItem();
}

function playNext() {
  if (currentListType === 'fr') {
    if (!frChannels.length) return;
    if (currentFrIndex === -1) playFrChannel(0);
    else playFrChannel((currentFrIndex + 1) % frChannels.length);
  } else if (currentListType === 'iframe') {
    if (!iframeItems.length) return;
    if (currentIframeIndex === -1) playIframe(0);
    else playIframe((currentIframeIndex + 1) % iframeItems.length);
  } else {
    if (!channels.length) return;
    if (currentIndex === -1) playChannel(0);
    else playChannel((currentIndex + 1) % channels.length);
  }
}

function playPrev() {
  if (currentListType === 'fr') {
    if (!frChannels.length) return;
    if (currentFrIndex === -1) playFrChannel(frChannels.length - 1);
    else playFrChannel((currentFrIndex - 1 + frChannels.length) % frChannels.length);
  } else if (currentListType === 'iframe') {
    if (!iframeItems.length) return;
    if (currentIframeIndex === -1) playIframe(iframeItems.length - 1);
    else playIframe((currentIframeIndex - 1 + iframeItems.length) % iframeItems.length);
  } else {
    if (!channels.length) return;
    if (currentIndex === -1) playChannel(channels.length - 1);
    else playChannel((currentIndex - 1 + channels.length) % channels.length);
  }
}

// --- SCROLL AUTO SUR LA LISTE ACTIVE (NE SCROLLE QUE LA LISTE, PAS LA PAGE) ---
function scrollToActiveItem() {
  let listEl = null;
  if (currentListType === 'channels') listEl = channelListEl;
  else if (currentListType === 'fr') listEl = channelFrListEl;
  else if (currentListType === 'iframe') listEl = iframeListEl;
  else return;

  if (!listEl) return;

  const activeItem = listEl.querySelector('.channel-item.active');
  if (!activeItem) return;

  const listRect = listEl.getBoundingClientRect();
  const itemRect = activeItem.getBoundingClientRect();

  const delta =
    (itemRect.top - listRect.top) - (listRect.height / 2 - itemRect.height / 2);

  listEl.scrollTop += delta;
}

// =====================================================
// M3U PARSER
// =====================================================

function parseM3U(content, listType = 'channels', defaultGroup = 'Playlist') {
  const lines = content.split(/\r?\n/);
  const results = [];
  let lastInf = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTINF')) {
      lastInf = line;
      continue;
    }

    if (line.startsWith('#')) continue;

    const url = line;
    let name = 'Sans titre';
    let logo = null;
    let group = defaultGroup;

    if (lastInf) {
      const nameMatch = lastInf.split(',').slice(-1)[0].trim();
      if (nameMatch) name = nameMatch;

      const logoMatch = lastInf.match(/tvg-logo="([^"]+)"/i);
      if (logoMatch) logo = { type: 'image', value: logoMatch[1] };

      const groupMatch = lastInf.match(/group-title="([^"]+)"/i);
      if (groupMatch) group = groupMatch[1];
    }

    results.push({
      id: listType + '-ch-' + (results.length + 1),
      name,
      url,
      logo: logo || deriveLogoFromName(name),
      group,
      isIframe: isYoutubeUrl(url),
      isFavorite: false,
      listType
    });

    lastInf = null;
  }

  return results;
}

// =====================================================
// LOADERS
// =====================================================

async function loadFromUrl(url) {
  if (!url) return;
  setStatus('Chargement…');

  try {
    if (isProbablyPlaylist(url)) {
      const res = await fetch(url);
      const text = await res.text();

      if (text.trim().startsWith('#EXTM3U')) {
        const parsed = parseM3U(text, 'channels', 'Playlist');
        channels.push(...parsed);
        renderLists();
        if (parsed.length && currentIndex === -1) {
          playChannel(channels.length - parsed.length);
        }
        setStatus('Playlist chargée (' + parsed.length + ' entrées)');
      } else {
        const entry = {
          id: 'single-url-' + (channels.length + 1),
          name: url,
          url,
          logo: deriveLogoFromName('S'),
          group: 'Single URL',
          isIframe: isYoutubeUrl(url),
          isFavorite: false,
          listType: 'channels'
        };
        channels.push(entry);
        renderLists();
        playChannel(channels.length - 1);
        setStatus('Flux chargé');
      }
    } else {
      const entry = {
        id: 'single-url-' + (channels.length + 1),
        name: url,
        url,
        logo: deriveLogoFromName('S'),
        group: 'Single URL',
        isIframe: isYoutubeUrl(url),
        isFavorite: false,
        listType: 'channels'
      };
      channels.push(entry);
      renderLists();
      playChannel(channels.length - 1);
      setStatus('Flux chargé');
    }
  } catch (e) {
    console.error(e);
    setStatus('Erreur de chargement (CORS / réseau)');
    alert(
      'Impossible de charger cette URL dans le navigateur.\n' +
      'Ça peut venir d’un blocage CORS ou d’un problème réseau.\n' +
      'Si c’est un flux IPTV, il est peut-être prévu pour une app native (VLC, box, etc.), pas pour le web.'
    );
  }
}

async function loadFrM3u(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();

    if (!text.trim().startsWith('#EXTM3U')) {
      console.error('Fichier FR non valide');
      return;
    }

    const parsed = parseM3U(text, 'fr', 'FR');
    frChannels.push(...parsed);
    renderChannelFrList();
    setStatus('Chaînes FR chargées : ' + parsed.length);
  } catch (e) {
    console.error('Erreur M3U FR', e);
    setStatus('Erreur M3U FR');
  }
}

function loadFromFile(file) {
  if (!file) return;
  fileNameLabel.textContent = file.name;
  setStatus('Lecture du fichier local…');

  const reader = new FileReader();

  if (/\.m3u8?$/i.test(file.name)) {
    reader.onload = () => {
      const text = reader.result.toString();
      const parsed = parseM3U(text, 'channels', 'Playlist locale');
      channels.push(...parsed);
      renderLists();
      if (parsed.length && currentIndex === -1) {
        playChannel(channels.length - parsed.length);
      }
      setStatus('Playlist locale chargée (' + parsed.length + ' entrées)');
    };
    reader.readAsText(file);
  } else {
    const objectUrl = URL.createObjectURL(file);
    const entry = {
      id: 'local-' + (channels.length + 1),
      name: file.name,
      url: objectUrl,
      logo: deriveLogoFromName(file.name),
      group: 'Local',
      isIframe: false,
      isFavorite: false,
      listType: 'channels'
    };
    channels.push(entry);
    renderLists();
    playChannel(channels.length - 1);
    setStatus('Fichier local prêt');
  }
}

function addIframeOverlay() {
  const title = iframeTitleInput.value.trim() || 'Overlay iFrame';
  const url = iframeUrlInput.value.trim();
  if (!url) return;

  const entry = {
    id: 'iframe-' + (iframeItems.length + 1),
    name: title,
    url,
    logo: deriveLogoFromName(title),
    group: 'Overlay',
    isIframe: true,
    isFavorite: false,
    listType: 'iframe'
  };

  iframeItems.push(entry);
  iframeTitleInput.value = '';
  iframeUrlInput.value = '';
  renderLists();
  playIframe(iframeItems.length - 1);
  showIframe();
  setStatus('Overlay ajouté');
}

// =====================================================
// JSON EXPORT / IMPORT
// =====================================================

function exportM3uToJson() {
  const payload = {
    type: 'm3u',
    version: 1,
    items: channels.map(ch => ({
      name: ch.name,
      url: ch.url,
      logo: ch.logo || deriveLogoFromName(ch.name),
      group: ch.group || '',
      isFavorite: !!ch.isFavorite
    }))
  };
  jsonArea.value = JSON.stringify(payload, null, 2);
  setStatus('Export M3U → JSON prêt');
}

function exportIframeToJson() {
  const payload = {
    type: 'iframe',
    version: 1,
    items: iframeItems.map(it => ({
      name: it.name,
      url: it.url,
      logo: it.logo || deriveLogoFromName(it.name),
      group: it.group || 'Overlay',
      isFavorite: !!it.isFavorite
    }))
  };
  jsonArea.value = JSON.stringify(payload, null, 2);
  setStatus('Export iFrame → JSON prêt');
}

function importFromJson() {
  const text = jsonArea.value.trim();
  if (!text) {
    alert('Colle d’abord du JSON dans la zone prévue.');
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error(e);
    alert('JSON invalide : impossible de parser.');
    return;
  }

  if (!data || !Array.isArray(data.items)) {
    alert("Format JSON inattendu : il manque le tableau 'items'.");
    return;
  }

  const type = data.type || 'm3u';

  if (type === 'm3u') {
    data.items.forEach((item, idx) => {
      const name = item.name || ('M3U ' + (channels.length + idx + 1));
      const url = item.url;
      if (!url) return;

      const entry = {
        id: 'json-ch-' + (channels.length + 1),
        name,
        url,
        logo: item.logo || deriveLogoFromName(name),
        group: item.group || 'Playlist JSON',
        isIframe: isYoutubeUrl(url),
        isFavorite: !!item.isFavorite,
        listType: 'channels'
      };
      channels.push(entry);
    });
    renderLists();
    setStatus('Import JSON M3U terminé (' + data.items.length + ' entrées)');
  } else if (type === 'iframe') {
    data.items.forEach((item, idx) => {
      const name = item.name || ('Overlay ' + (iframeItems.length + idx + 1));
      const url = item.url;
      if (!url) return;

      const entry = {
        id: 'json-iframe-' + (iframeItems.length + 1),
        name,
        url,
        logo: item.logo || deriveLogoFromName(name),
        group: item.group || 'Overlay JSON',
        isIframe: true,
        isFavorite: !!item.isFavorite,
        listType: 'iframe'
      };
      iframeItems.push(entry);
    });
    renderLists();
    setStatus('Import JSON iFrame terminé (' + data.items.length + ' entrées)');
  } else {
    alert("Type JSON inconnu : '" + type + "'. Utilise 'm3u' ou 'iframe'.");
  }
}

// =====================================================
// EVENTS
// =====================================================

// Onglets
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.dataset.tab;
    document.querySelectorAll('.list').forEach(l => l.classList.remove('active'));

    if (tab === 'channels') currentListType = 'channels', channelListEl.classList.add('active');
    if (tab === 'fr') currentListType = 'fr', channelFrListEl.classList.add('active');
    if (tab === 'iframes') currentListType = 'iframe', iframeListEl.classList.add('active');
    if (tab === 'favorites') favoriteListEl.classList.add('active');

    scrollToActiveItem();
    updateTrackControlsVisibility();
  });
});

// Sections repliables du loader-panel
document.querySelectorAll('.loader-section .collapsible-label').forEach(label => {
  label.addEventListener('click', () => {
    const section = label.closest('.loader-section');
    section.classList.toggle('open');
  });
});

// Fermer (close) par défaut la section playlist (aucune ouverte)
document.querySelector('.loader-section[data-section="playlist"]')?.classList.add('close');

// Sidebar show/hide
toggleSidebarBtn.addEventListener('click', () => {
  const isCollapsed = sidebar.classList.toggle('collapsed');
  toggleSidebarBtn.classList.toggle('active', !isCollapsed);
});

// Fermer la sidebar par défaut sur mobile
if (window.innerWidth <= 900) {
  sidebar.classList.add('collapsed');
}

// URL loader
loadUrlBtn.addEventListener('click', () => {
  loadFromUrl(urlInput.value.trim());
});

urlInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    loadFromUrl(urlInput.value.trim());
  }
});

// File loader
openFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    loadFromFile(fileInput.files[0]);
  }
});

// Iframe overlay add
addIframeBtn.addEventListener('click', () => addIframeOverlay());
iframeUrlInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    addIframeOverlay();
  }
});

// Toggle overlay mode
toggleOverlayBtn.addEventListener('click', () => {
  if (overlayMode) {
    showVideo();
    setStatus('Mode vidéo');
  } else {
    showIframe();
    setStatus('Mode iFrame');
  }
});

// Fullscreen
fullPageBtn.addEventListener('click', () => {
  const elem = appShell;
  if (!document.fullscreenElement) {
    elem.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

// Next / Prev
nextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);

// FX Tron+
fxToggleBtn.addEventListener('click', () => {
  const active = appShell.classList.toggle('fx-boost');
  playerContainer.classList.toggle('fx-boost-edges', active);
  fxToggleBtn.classList.toggle('btn-accent', active);
});

// PiP
pipToggleBtn.addEventListener('click', () => {
  const active = playerContainer.classList.toggle('pip-mode');
  pipToggleBtn.classList.toggle('btn-accent', active);
});

// Thème
let currentTheme = 'classic';
themeToggleBtn.addEventListener('click', () => {
  if (currentTheme === 'classic') {
    document.body.classList.add('theme-redblue');
    currentTheme = 'redblue';
    themeToggleBtn.textContent = 'Thème : Rouge/Bleu';
    themeToggleBtn.classList.add('btn-accent');
    setStatus('Thème Rouge/Bleu actif');
  } else {
    document.body.classList.remove('theme-redblue');
    currentTheme = 'classic';
    themeToggleBtn.textContent = 'Thème : Cyan/Orange';
    themeToggleBtn.classList.remove('btn-accent');
    setStatus('Thème Cyan/Orange actif');
  }
});

// JSON export/import
exportM3uJsonBtn.addEventListener('click', exportM3uToJson);
exportIframeJsonBtn.addEventListener('click', exportIframeToJson);
importJsonBtn.addEventListener('click', importFromJson);

// Video events
videoEl.addEventListener('playing', () => setStatus('Lecture en cours'));
videoEl.addEventListener('pause', () => setStatus('Pause'));
videoEl.addEventListener('waiting', () => setStatus('Buffering…'));
videoEl.addEventListener('error', () => {
  const mediaError = videoEl.error;

  if (
    !externalFallbackTried &&
    currentEntry &&
    !currentEntry.isIframe &&
    isProbablyHls(currentEntry.url)
  ) {
    externalFallbackTried = true;
    console.warn('Erreur vidéo, fallback vers lecteur externe pour :', currentEntry.url);
    fallbackToExternalPlayer(currentEntry);
    return;
  }

  let msg = 'Erreur vidéo';
  if (mediaError) {
    switch (mediaError.code) {
      case mediaError.MEDIA_ERR_NETWORK:
        msg = 'Erreur réseau ou CORS possible';
        break;
      case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        msg = 'Format non supporté ou URL invalide';
        break;
      default:
        msg = 'Erreur de lecture (code ' + mediaError.code + ')';
    }
  }
  setStatus(msg);
  npBadge.textContent = 'ERREUR';
  console.error('Video error', mediaError);
});

// Sauvegarde de la position (seulement channelList)
videoEl.addEventListener('timeupdate', () => {
  if (currentListType !== 'channels') return;
  if (!currentEntry) return;

  const key = currentEntry.url;

  if (!videoEl.duration || !isFinite(videoEl.duration) || videoEl.duration < 60) return;

  const t = videoEl.currentTime;
  if (t < 10) return;

  if (videoEl.duration - t < 20) {
    delete resumePositions[key];
    localStorage.setItem('tronAresResume', JSON.stringify(resumePositions));
    return;
  }

  resumePositions[key] = t;
  localStorage.setItem('tronAresResume', JSON.stringify(resumePositions));
});
function closeAllTrackMenus() {
  audioTrackMenu?.classList.remove('open');
  subtitleTrackMenu?.classList.remove('open');
}

audioTrackBtn?.addEventListener('click', (ev) => {
  ev.stopPropagation();
  if (!isMovieContext()) return;
  buildAudioTrackMenu();
  const isOpen = audioTrackMenu.classList.toggle('open');
  if (isOpen) subtitleTrackMenu.classList.remove('open');
});

subtitleTrackBtn?.addEventListener('click', (ev) => {
  ev.stopPropagation();
  if (!isMovieContext()) return;
  buildSubtitleTrackMenu();
  const isOpen = subtitleTrackMenu.classList.toggle('open');
  if (isOpen) audioTrackMenu.classList.remove('open');
});

// Fermer les menus si on clique ailleurs
document.addEventListener('click', () => {
  closeAllTrackMenus();
});


// =====================================================
// DEMO DE BASE + OVERLAYS CUSTOM
// =====================================================

(function seedDemo() {
  // Overlays custom
  const customOverlays = [
    { title: "CMTV", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/cmtv.png", url: "//popcdn.day/player.php?stream=CMTVPT" },
    { title: "TVI",  logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/TVI.png", url: "https://vsalema.github.io/tvi2/" },
    { title: "TVIR", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/tvir.jpg", url: "https://vsalema.github.io/tvi-reality/" },
    { title: "TVIF", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/tvif.png", url: "https://vsalema.github.io/tvi-ficcao/" },
    { title: "TVIA", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/tvia.png", url: "https://vsalema.github.io/tvi-africa/" },
    { title: "SIC",  logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/sic.jpg", url: "https://vsalema.github.io/sic/" },
    { title: "CNN",  logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/cnn.png", url: "https://vsalema.github.io/CNN/" },
    { title: "RTP1", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/rtp1.jpg", url: "https://vsalema.github.io/play/?https://streaming-live.rtp.pt/liverepeater/smil:rtp1HD.smil/playlist.m3u8" },
    { title: "RTPN", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/rtpn.png", url: "https://vsalema.github.io/play/?https://streaming-live.rtp.pt/livetvhlsDVR/rtpnHDdvr.smil/playlist.m3u8?DVR" },
    { title: "RTPI", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/rtpi.jpg", url: "https://vsalema.github.io/play/?https://streaming-live.rtp.pt/liverepeater/rtpi.smil/playlist.m3u8" },
    { title: "BTV", logo: "https://vsalema.github.io/StreamPilot-X-Studio-S/logos/btv.svg", url: "//popcdn.day/go.php?stream=BTV1" },
    { title: "SCP", logo: "https://pplware.sapo.pt/wp-content/uploads/2017/06/scp_00.jpg", url: "//popcdn.day/go.php?stream=SPT1" },
    { title: "11",  logo: "https://www.zupimages.net/up/24/13/qj99.jpg", url: "https://popcdn.day/go.php?stream=Canal11" },
    { title: "BOLA", logo: "https://www.telesatellite.com/images/actu/a/abolatv.jpg", url: "//popcdn.day/go.php?stream=ABOLA" },
    { title: "Sport tv 1", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT1" },
    { title: "Sport tv 2", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT2" },
    { title: "Sport tv 3", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT3" },
    { title: "Sport tv 4", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT4" },
    { title: "Sport tv 5", logo: "https://cdn.brandfetch.io/idKvjRibkN/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B", url: "//popcdn.day/go.php?stream=SPT5" },
    { title: "DAZN 1 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN1" },
    { title: "DAZN 2 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN2" },
    { title: "DAZN 3 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN3" },
    { title: "DAZN 4 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN4" },
    { title: "DAZN 5 PT",  logo: "https://upload.wikimedia.org/wikipedia/commons/7/71/DAZN_logo.svg", url: "//popcdn.day/go.php?stream=ELEVEN5" }
  ];

  customOverlays.forEach((item, idx) => {
    iframeItems.push({
      id: "custom-ov-" + (idx + 1),
      name: item.title,
      url: item.url,
      logo: { type: "image", value: item.logo },
      group: "Overlay",
      isIframe: true,
      isFavorite: false,
      listType: "iframe"
    });
  });

  renderLists();
  updateNowPlaying(null, 'IDLE');
})();

// =====================================================
// CHARGEMENT AUTOMATIQUE DES PLAYLISTS PRINCIPALES
// =====================================================

(async function loadMainPlaylists() {
  await loadFromUrl("https://vsalema.github.io/tvpt4/css/playlist_par_genre.m3u");
  await loadFrM3u("https://vsalema.github.io/tvpt4/css/playlist-tvf-r.m3u");
})();
