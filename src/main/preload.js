const path = require('path');
const { contextBridge, ipcRenderer } = require('electron');

const pkg = require(path.join(__dirname, '..', '..', 'package.json'));

contextBridge.exposeInMainWorld('f95api', {
  appVersion: pkg.version,
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  steamFetchAppDetails: (appId, forceRefresh) =>
    ipcRenderer.invoke('steam:fetchAppDetails', appId, forceRefresh),
  steamDownloadScreenshots: (opts) => ipcRenderer.invoke('steam:downloadScreenshots', opts),
  backendFetch: (options) => ipcRenderer.invoke('backend:fetch', options),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});
