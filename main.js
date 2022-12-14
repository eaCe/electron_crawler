const electron = require('electron');
const {app, BrowserWindow, ipcMain, shell} = electron;
const path = require('path');
const got = require('got');
const cheerio = require('cheerio');
const fs = require("fs");
const URL = require('url').URL;

let mainWindow;
let browser;
let browserWidth = 1920;
let browserHeight = 1080;
let first = false;
let screenshotPath = __dirname;
let originURL;
let urls = [];
let URLIndex = 0;
let dataObject = {};
let abort = false;

/**
 * reload electron
 */
// try {
//     require('electron-reload')(__dirname, {
//         electron: require(`${__dirname}/node_modules/electron`),
//         hardResetMethod: 'exit'
//     });
// } catch (_) {
// }

/**
 * create main window
 * @returns {Promise<void>}
 */
async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });

    mainWindow.on('closed', async function () {
        mainWindow = null;
        await browser.close();
        app.quit();
    })

    await mainWindow.loadFile('index.html');
}

app.whenReady().then(async () => {
    await createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    // get second display
    //let displays = electron.screen.getAllDisplays();
    //let externalDisplay = displays.find((display) => {
    //    return display.bounds.x !== 0 || display.bounds.y !== 0
    //})

    /**
     * create the browser instance for the crawler
     */
    browser = new BrowserWindow({
        width: browserWidth,
        height: browserHeight,
        show: false,
        enableLargerThanScreen: true,
        // autoHideMenuBar: true,
        // show on second display
        //x: externalDisplay.bounds.x + 50,
        //y: externalDisplay.bounds.y + 50,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });
})

/**
 * extract urls form given html string
 * @param rootURL
 * @param html
 * @returns {Promise<void>}
 */
let extractURLs = async function (rootURL, html) {
    const protocolRegex = new RegExp('^https?');
    const fileEndingRegex = new RegExp('/(?:\\/|^)[^.\\/]+$/');
    const $ = cheerio.load(html)

    $('a').each((i, element) => {
        const url = new URL($(element).attr('href'), rootURL);

        if (protocolRegex.test(url.protocol) &&
            !fileEndingRegex.test(url.href) &&
            urls.indexOf(url.origin + url.pathname) === -1 &&
            !(url.origin === originURL.origin && url.pathname === originURL.pathname) &&
            url.host === originURL.host) {
            urls.push(url.origin + url.pathname);
        }
    })
}

/**
 * start crawling
 */
ipcMain.on('crawl', async (event, data) => {
    dataObject = JSON.parse(data);

    if (!first) {
        await setScreenshotPath(event)
    }

    originURL = new URL(dataObject.url);
    urls.push(dataObject.url);
    await setCookies(dataObject);
    await crawlURL(dataObject.url, event);
});

/**
 * stop crawling
 */
ipcMain.on('abort', async (event) => {
    abort = true;
});

/**
 * show screenshots dir
 */
ipcMain.on('showScreenshots', async (event) => {
    if (screenshotPath) {
        await shell.openPath(screenshotPath)
    }
});

/**
 * set cookies
 * @param data
 * @returns {Promise<void>}
 */
async function setCookies(data) {
    if (!data.cookies.length) {
        return;
    }

    for (const cookie of data.cookies) {
        await browser.webContents.session.cookies.set(cookie).catch((error) => {
            console.error(error)
        })
    }
}

async function crawlURL(url, event) {
    if (abort) {
        await crawlAborted(event);
        return;
    }

    /**
     * crawl should be done
     */
    if (URLIndex > 0 && urls.length === URLIndex + 1) {
        await crawlDone(event);
        return;
    }

    /**
     * check URL content-type
     */
    try {
        const data = await got.get(url);
        if (!data.headers['content-type'].includes('text/html')) {
            await crawlNext(event);
            return;
        }
    } catch (error) {
        await crawlNext(event);
        return;
    }

    /**
     * reset content size
     */
    await browser.setContentSize(browserWidth, browserHeight);

    /**
     * wait until the page is rendered
     */
    await browser.once('ready-to-show', async () => {
        /**
         * get the site's html
         */
        const html = await browser.webContents.executeJavaScript(`(() => {return document.documentElement.innerHTML})()`);
        await extractURLs(url, html);

        await sleep(500);

        /**
         * set max height to fix vh-unit issues...
         */
        await browser.webContents.executeJavaScript(`(() => { var domElements = window.document.getElementsByTagName('*');for (var i = 0; i < domElements.length; i++) {var elementHeight = window.getComputedStyle(domElements[i]).height;if (elementHeight != 'auto') {var heightNumber = Number(elementHeight.slice(0, -2));if (heightNumber > 100 && heightNumber < 1080) {domElements[i].style.setProperty('max-height', heightNumber + 'px', 'important');}}} })()`);

        await sleep(500);

        /**
         * set browserWindow size
         */
        const contentSize = await browser.webContents.executeJavaScript(`(() => {const body = document.body;const doc = document.documentElement;return {x: 0, y: 0, width: Math.max(body.scrollWidth, body.offsetWidth, doc.clientWidth, doc.offsetWidth), height: Math.max(body.scrollHeight, body.offsetHeight, doc.clientHeight, doc.scrollHeight, doc.offsetHeight)}})()`);
        await browser.setContentSize(contentSize.width, contentSize.height);

        /**
         * execute custom js
         */
        if (dataObject.js) {
            await browser.webContents.executeJavaScript(`${dataObject.js}`);
        }

        /**
         * hide scrollbar...
         */
        await browser.webContents.executeJavaScript(`(() => { document.querySelector('body').style.overflow = 'hidden' })()`);

        /**
         * take and save screenshot
         */
        const screenshot = await browser.webContents.capturePage(contentSize);
        const tempURL = new URL(url);
        const timestamp = +new Date();
        const filePath = screenshotPath + '/' + timestamp + '-' + originURL.hostname.toLowerCase() + tempURL.pathname.replace(/\//g, '-').toLowerCase() + '.jpg';
        fs.writeFileSync(filePath, screenshot.toJPEG(100));

        /**
         * send urlDone event
         */
        await urlDone(url, filePath, event);

        /**
         * crawl next URL
         */
        await crawlNext(event);
    });

    /**
     * load the given URL
     */
    await browser.loadURL(url).catch(error => {
        console.error(error)
    });
}

/**
 * open a dialog to select a directory
 * @returns {Promise<void>}
 */
async function setScreenshotPath(event) {
    const {canceled, filePaths} = await electron.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (canceled) {
        await crawlAborted(event);
        return;
    }

    if (filePaths) {
        screenshotPath = filePaths[0];
    }

    first = false;
}

/**
 * crawl next URL
 * @returns {Promise<void>}
 */
async function crawlNext(event) {
    URLIndex++;
    if (urls[URLIndex]) {
        await crawlURL(urls[URLIndex], event);
    } else {
        /**
         * end crawling
         */
        await crawlDone(event);
    }
}

async function urlDone(url, filePath, event) {
    event.sender.send('urlDone', {
        'url': url,
        'screenshot': filePath
    });
}

/**
 * emit event if crawl is done
 * @param event
 * @returns {Promise<void>}
 */
async function crawlDone(event) {
    await reset();
    event.sender.send('crawlDone');
}

/**
 * emit event if crawl is aborted
 * @param event
 * @returns {Promise<void>}
 */
async function crawlAborted(event) {
    await reset();
    event.sender.send('crawlAborted');
}

/**
 * reset data, clear cookies, cache etc.
 * @returns {Promise<void>}
 */
async function reset() {
    await browser.webContents.session.clearStorageData();
    URLIndex = 0;
    abort = false;
    urls = [];
}

/**
 * export profile.json
 */
ipcMain.on('export', async (event, data) => {
    const dataObject = JSON.parse(data);

    const {canceled, filePaths} = await electron.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (canceled) {
        return;
    }

    if (filePaths) {
        const url = new URL(dataObject.url);
        const filePath = filePaths[0] + '/' + url.hostname.toLowerCase() + '-profile.json';
        fs.writeFileSync(filePath, data);
        await shell.openPath(filePaths[0]);
    }
});

/**
 * import profile.json
 */
ipcMain.on('import', async (event, data) => {
    const {canceled, filePaths} = await electron.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{name: 'Profile', extensions: ['json']}]
    });

    if (canceled) {
        return;
    }

    if (filePaths) {
        const contents = fs.readFileSync(filePaths[0], {encoding: 'utf8', flag: 'r'});

        if (contents) {
            event.sender.send('import', contents);
        }
    }
});

/**
 * quit when all windows are closed
 */
app.on('window-all-closed', async function () {
    if (process.platform !== 'darwin') {
        await browser.close();
        app.quit()
    }
})

/**
 * helper to sleep a while...
 * @param ms
 * @returns {Promise<unknown>}
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}