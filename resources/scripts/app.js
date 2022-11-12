import Alpine from 'alpinejs';

window.Alpine = Alpine

window.scan = () => {
    return {
        loading: false,
        done: false,
        urls: [],
        requestUrl: '',
        error: '',
        crawlURL() {
            this.reset();

            if (this.loading) {
                return false;
            }

            try {
                this.requestUrl = new URL(this.$refs.url.value);
            } catch (error) {
                this.requestUrl = '';
                this.error = 'Ungültige URL';
                return false;
            }

            this.error = '';
            this.loading = true;
            window.api.send('crawl', this.requestUrl.href);
            window.api.receive('urlDone', (data) =>{
                this.urls.push(data.url);
            });
            window.api.receive('crawlDone', (data) =>{
                this.done = true;
                this.loading = false;
            });
        },
        reset() {
            this.done = false;
            this.urls = [];
        },
    };
};

Alpine.start();