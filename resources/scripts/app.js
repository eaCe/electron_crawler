import Alpine from 'alpinejs';

window.Alpine = Alpine

window.scan = () => {
    return {
        loading: false,
        done: false,
        aborted: false,
        urls: [],
        cookies: [],
        requestUrl: '',
        error: '',
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
                'cookies': this.cookies
            }));
            window.api.receive('urlDone', (data) => {
                this.urls.push(data.url);
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
        },
    };
};

Alpine.start();