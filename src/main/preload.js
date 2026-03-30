const { contextBridge, ipcRenderer } = require('electron');

const appVersion = ipcRenderer.sendSync('app:get-version-sync');

contextBridge.exposeInMainWorld('f95api', {
  appVersion: typeof appVersion === 'string' ? appVersion : '',
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  steamFetchAppDetails: (appId, forceRefresh) =>
    ipcRenderer.invoke('steam:fetchAppDetails', appId, forceRefresh),
  steamDownloadScreenshots: (opts) => ipcRenderer.invoke('steam:downloadScreenshots', opts),
  backendFetch: (options) => ipcRenderer.invoke('backend:fetch', options),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});
