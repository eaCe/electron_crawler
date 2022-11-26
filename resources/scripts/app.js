import Alpine from 'alpinejs';

window.Alpine = Alpine

window.scan = () => {
    return {
        loading: false,
        done: false,
        aborted: false,
        showSettings: false,
        urls: [],
        screenshots: [],
        cookies: [],
        requestUrl: '',
        showJs: false,
        js: '',
        error: '',
        init() {
            window.api.receive('import', (data) => {
                this.importProfile(data);
            });
        },
        addCookie() {
            const cookie = {
                url: '',
                name: '',
                value: '',
            };
            this.cookies.push(cookie);
        },
        crawlURL() {
            this.reset();

            if (this.loading) {
                return false;
            }

            try {
                this.requestUrl = new URL(this.requestUrl);
            } catch (error) {
                this.requestUrl = '';
                this.error = 'Ungültige URL';
                return false;
            }

            this.error = '';
            this.loading = true;
            window.api.send('crawl', JSON.stringify({
                'url': this.requestUrl,
                'cookies': this.cookies,
                'js': this.js
            }));
            window.api.receive('urlDone', (data) => {
                this.urls.push(data.url);
                this.screenshots.push(data.screenshot);
                setTimeout(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                }, 50);
            });
            window.api.receive('crawlDone', (data) => {
                this.done = true;
                this.loading = false;
            });
            window.api.receive('crawlAborted', (data) => {
                this.aborted = true;
                this.loading = false;
            });
        },
        reset() {
            this.done = false;
            this.aborted = false;
            this.urls = [];
            this.screenshots = [];
        },
        abort() {
            window.api.send('abort');
        },
        openScreenshots() {
            window.api.send('showScreenshots');
        },
        exportProfile() {
            window.api.send('export', JSON.stringify({
                'url': this.requestUrl,
                'cookies': this.cookies,
                'js': this.js
            }));
        },
        importProfile(data) {
            const dataObject = JSON.parse(data);

            if (dataObject.hasOwnProperty('url')) {
                this.requestUrl = dataObject.url;
            }

            if (dataObject.hasOwnProperty('cookies')) {
                this.cookies = dataObject.cookies;
            }

            if (dataObject.hasOwnProperty('js')) {
                this.js = dataObject.js;
                this.showJs = true;
            }

            this.showSettings = false;
        },
        importProfileHandler() {
            window.api.send('import');
        }
    };
};

Alpine.start();