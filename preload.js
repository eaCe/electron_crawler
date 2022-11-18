const {ipcRenderer, contextBridge} = require('electron');

contextBridge.exposeInMainWorld(
    "api", {
        send: (channel, data) => {
            // whitelist channels
            let validChannels = ['crawl', 'abort', 'showScreenshots'];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        receive: (channel, func) => {
            let validChannels = ['crawlDone', 'crawlAborted', 'urlDone'];
            if (validChannels.includes(channel)) {
                ipcRenderer.on(channel, (event, ...args) => func(...args));
            }
        }
    }
);

// window.addEventListener('DOMContentLoaded', () => {
// })
