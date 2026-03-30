const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const archiver = require('archiver');
const os = require('os');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
const appWindowTitle = `${pkg.build?.productName || 'F95 BBCode Generator'} v${pkg.version}`;

const store = new Store({
  defaults: {
    apiBaseUrl: '',
    vndbToken: ''
  }
});

const STEAM_TTL_MS = 24 * 60 * 60 * 1000;

function steamCacheDir() {
  const dir = path.join(app.getPath('userData'), 'steam-cache');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function steamCachePath(appId) {
  return path.join(steamCacheDir(), `${appId}.json`);
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    title: appWindowTitle,
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('settings:get', () => ({
  apiBaseUrl: store.get('apiBaseUrl'),
  vndbToken: store.get('vndbToken')
}));

ipcMain.handle('settings:set', (_e, patch) => {
  if (patch.apiBaseUrl !== undefined) store.set('apiBaseUrl', String(patch.apiBaseUrl).trim());
  if (patch.vndbToken !== undefined) store.set('vndbToken', String(patch.vndbToken).trim());
  return { ok: true };
});

async function ensureSteamPayload(appId, forceRefresh) {
  const id = String(appId).replace(/\D/g, '');
  if (!id) return { ok: false, error: 'Invalid Steam app id' };

  const cPath = steamCachePath(id);
  if (!forceRefresh && fs.existsSync(cPath)) {
    const cached = readJsonSafe(cPath);
    if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < STEAM_TTL_MS) {
      return { ok: true, data: cached.payload, cached: true };
    }
  }

  const url = `https://store.steampowered.com/api/appdetails?appids=${id}&cc=US`;
  const res = await fetch(url);
  if (!res.ok) return { ok: false, error: `Steam HTTP ${res.status}` };
  const json = await res.json();
  const entry = json[id];
  if (!entry || !entry.success) {
    return { ok: false, error: entry ? 'Steam returned success=false' : 'Missing app in response' };
  }
  const payload = { appId: id, raw: json };
  fs.writeFileSync(cPath, JSON.stringify({ fetchedAt: Date.now(), payload }), 'utf8');
  return { ok: true, data: payload, cached: false };
}

ipcMain.handle('steam:fetchAppDetails', async (_e, appId, forceRefresh) => {
  return ensureSteamPayload(appId, forceRefresh);
});

function extFromUrl(imageUrl) {
  try {
    const u = new URL(imageUrl);
    const base = path.basename(u.pathname).split('?')[0];
    const m = base.match(/\.(jpe?g|png|webp|gif)$/i);
    return m ? m[0].toLowerCase() : '.jpg';
  } catch {
    return '.jpg';
  }
}

function zipDirectoryToFile(srcDir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', () => resolve(archive.pointer()));
    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

ipcMain.handle('steam:downloadScreenshots', async (_e, opts = {}) => {
  const id = String(opts.appId ?? '').replace(/\D/g, '');
  if (!id) return { ok: false, error: 'Invalid Steam app id' };

  const asZip = !!opts.asZip;
  const pickFolder = !!opts.pickFolder;
  let baseDir = app.getPath('downloads');

  if (pickFolder) {
    const r = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Save Steam screenshots into this folder'
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, error: 'Canceled' };
    baseDir = r.filePaths[0];
  }

  const steam = await ensureSteamPayload(id, !!opts.forceRefresh);
  if (!steam.ok || !steam.data) return { ok: false, error: steam.error || 'No Steam data' };

  const data = steam.data.raw[id]?.data;
  const shots = data?.screenshots;
  if (!Array.isArray(shots) || shots.length === 0) {
    return { ok: false, error: 'No screenshots in Store listing for this app' };
  }

  const slug = (data.name || `app-${id}`).replace(/[<>:"/\\|?*]+/g, '_').slice(0, 80);
  const folderName = `Steam-${id}-${slug}-screenshots`;
  const targetDir = path.join(baseDir, folderName);

  if (!asZip && fs.existsSync(targetDir)) {
    let i = 2;
    while (fs.existsSync(`${targetDir} (${i})`)) i += 1;
    const alt = `${targetDir} (${i})`;
    fs.mkdirSync(alt, { recursive: true });
    await downloadScreenshotsToDir(shots, alt);
    shell.showItemInFolder(alt);
    return { ok: true, path: alt, count: shots.length, asZip: false };
  }

  if (!asZip) {
    fs.mkdirSync(targetDir, { recursive: true });
    await downloadScreenshotsToDir(shots, targetDir);
    shell.showItemInFolder(targetDir);
    return { ok: true, path: targetDir, count: shots.length, asZip: false };
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f95-steam-'));
  try {
    await downloadScreenshotsToDir(shots, tmpRoot);
    const zipName = `${folderName}.zip`;
    let zipPath = path.join(baseDir, zipName);
    if (fs.existsSync(zipPath)) {
      let i = 2;
      while (fs.existsSync(path.join(baseDir, `${folderName} (${i}).zip`))) i += 1;
      zipPath = path.join(baseDir, `${folderName} (${i}).zip`);
    }
    await zipDirectoryToFile(tmpRoot, zipPath);
    shell.showItemInFolder(zipPath);
    return { ok: true, path: zipPath, count: shots.length, asZip: true };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

async function downloadScreenshotsToDir(shots, dir) {
  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    const url = shot.path_full || shot.path_thumbnail;
    if (!url || typeof url !== 'string') continue;
    const ext = extFromUrl(url);
    const filename = `screenshot_${String(i + 1).padStart(2, '0')}${ext}`;
    const dest = path.join(dir, filename);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${filename}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
  }
}

ipcMain.handle('backend:fetch', async (_e, options) => {
  const base = String(store.get('apiBaseUrl') || '').replace(/\/$/, '');
  if (!base) return { ok: false, error: 'Backend base URL not configured (Settings).' };

  const method = (options.method || 'GET').toUpperCase();
  const apiPath = options.path.startsWith('/') ? options.path : `/${options.path}`;
  const url = `${base}${apiPath}`;
  let bodyObj = options.body;
  if (
    method === 'POST' &&
    apiPath === '/v1/vn/lookup' &&
    bodyObj &&
    typeof bodyObj === 'object' &&
    !Array.isArray(bodyObj)
  ) {
    const vt = String(store.get('vndbToken') || '').trim();
    if (!vt) {
      return { ok: false, error: 'VNDB API token not set. Add it under Settings (from vndb.org/u/tokens).' };
    }
    bodyObj = { ...bodyObj, vndb_token: vt };
  }
  const bodyStr =
    bodyObj === undefined || bodyObj === null
      ? ''
      : typeof bodyObj === 'string'
        ? bodyObj
        : JSON.stringify(bodyObj);

  const headers = {
    Accept: 'application/json'
  };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : bodyStr
    });
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return {
    ok: res.ok,
    status: res.status,
    body: json
  };
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (url) shell.openExternal(url);
});
