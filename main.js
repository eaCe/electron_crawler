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

/**
 * reload electron
 */
try {
    require('electron-reload')(__dirname, {
        electron: require(`${__dirname}/node_modules/electron`),
        hardResetMethod: 'exit'
    });
} catch (_) {
}

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
        autoHideMenuBar: true,
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

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

/**
 * extract urls form given html string
 * @param url
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
ipcMain.on('crawl', async (event, url) => {
    if (!first) {
        await setScreenshotPath()
    }

    originURL = new URL(url);
    urls.push(url);
    await crawlURL(url, event);
});

async function crawlURL(url, event) {
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

        /**
         * set browserWindow size
         */
        const contentSize = await browser.webContents.executeJavaScript(`(() => { return {x: 0, y: 0, width: document.body.offsetWidth, height: document.body.offsetHeight}})()`);
        await browser.setContentSize(contentSize.width, contentSize.height);

        /**
         * take and save screenshot
         */
        const screenshot = await browser.webContents.capturePage(contentSize);
        const tempURL = new URL(url);
        const timestamp = + new Date();
        fs.writeFileSync(screenshotPath + '/' + timestamp + '-' + originURL.hostname.toLowerCase() + tempURL.pathname.replace(/\//g, '-').toLowerCase() + '.jpg', screenshot.toJPEG(80));

        /**
         * send urlDone event
         */
        await urlDone(url, event);

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
async function setScreenshotPath() {
    const {canceled, filePaths} = await electron.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

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

async function urlDone(url, event) {
    event.sender.send('urlDone', {
        'url': url
    });
}

/**
 * destroy browser window and emit event if crawl is done
 * @param event
 * @returns {Promise<void>}
 */
async function crawlDone(event) {
    await browser.close();
    URLIndex = 0;
    urls = [];
    event.sender.send('crawlDone');
}
