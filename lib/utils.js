(function(w) {
"use strict"

window.utils = {
    activeTab: () => browser.tabs.query({currentWindow: true, active: true}).then(tabs => tabs[0]),

    get: (urlOrRequest) => fetch(urlOrRequest).then(r => {return r.text()}),

    getBlob: (urlOrRequest) => fetch(urlOrRequest).then(r => {return r.blob()}),

    post: (url, data) => {
        let formData = data;
        if (!(data instanceof FormData)) {
            formData = new FormData();
            for (let name in data) {
                if (data.hasOwnProperty(name)) {
                    formData.append(name, data[name]);
                }
            }
        }
        return fetch(url, { method: "POST", body: formData}).then(r => r.text());
    }
};
})(window);
