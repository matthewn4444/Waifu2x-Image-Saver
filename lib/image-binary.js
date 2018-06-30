(function(w) {
"use scrict"

function extractFileNameFromUrl(url, type) {
    let pathname = decodeURIComponent(new URL(url).pathname).replace(/\s+/g, "_");
    let name = pathname.substring(pathname.lastIndexOf("/") + 1);
    let extIndex = name.lastIndexOf(".");
    if (extIndex == -1) {
        return name + (type == "image/png" ? ".png" : ".jpg");
    }
    let extension = name.substring(extIndex + 1).split(/\W/g)[0];
    return name.substring(0, extIndex) + "." + extension;
}

class ImageBinary {
    constructor(blob, width, height, src) {
        this.blob = blob;
        this.mask = null;
        this.width = width;
        this.height = height;
        this.transparent = false;
        this.src = src;
        this.filename = extractFileNameFromUrl(src, blob.type);
        this.upscaleRequest = null;
    }

    get area() {
        return this.width * this.height;
    }

    init() {
        // Check transparency if png
        if (this.blob.type == "image/png") {
            return checkTransparency(this.blob)
                .then(flag => {
                    this.transparent = flag;
                    if (flag) {
                        this.mask = this.blob;
                    }
                });
        }
        return Promise.resolve();
    }

    createThumbnail(width) {
        let ratio = this.width / this.height;
        let height = Math.round(width / ratio);
        return resize(this.blob, width, height, 0, this.transparent);
    }

    resize(width, height, sizeLimit /* optional */, forcePng /* optional */) {
        if (this.width == width && this.height == height) {
            return Promise.resolve(this.blob);
        }
        return resize(this.blob, width, height, sizeLimit, this.transparent && forcePng)
            .then(data => this.__updateBlobData(data));
    }

    compress(sizeLimit, quality /* optional */, forcePng /* optional */) {
        if (this.blob.type == "image/jpeg" && (quality >= 1 || quality <= 0) && sizeLimit <= 0) {
            // No need to compress if it will do nothing based on inputs
            return Promise.resolve(this.blob);
        }
        return compress(this.blob, sizeLimit, quality, this.transparent && forcePng)
            .then(data => this.__updateBlobData(data));
    }

    upscale(forcePng, forceNext) {
        this.upscaleRequest = Waifu2xBooru.upscaleByUpload(this, this.transparent && forcePng);
        return this.upscaleRequest.start(forceNext)
            .then(blob => {
                this.upscaleRequest = null;
                if (!blob) {
                    return null;
                }
                this.blob = blob;
                this.width *= 2;
                this.height *= 2;

                if (forcePng) {
                    return this.ensureTransparent()
                        .then(blob)
                }
                return blob;
            });
    }

    saveAs() {
        let filename = this.filename;
        if (this.blob.type == "image/jpeg" && !this.filename.endsWith(".jpg")) {
            filename = filename.substring(0, filename.lastIndexOf(".")) + ".jpg";
        }
        return saveAs(this.blob, filename);
    }

    ensureTransparent() {
        if (this.transparent && this.blob.type != "image/png") {
            return applyAlphaMask(this.blob, this.mask)
                .then(blob => {
                    this.blob = blob;
                    if (blob.type != "image/png") throw new Error("Applied alpha mask is not png");
                });
        }
        return Promise.resolve();
    }

    store() {
        let data = {};
        data[this.src] = this.blob;
        this.blob = null;
        return browser.storage.local.set(data);
    }

    retrieve() {
        return browser.storage.local.get(this.src)
            .then(items => items[this.src])
            .then(blob => {
                this.blob = blob;
                return browser.storage.local.remove(this.src)
            });
    }

    __updateBlobData(data) {
        if (data) {
            this.blob = data.blob;
            this.width = data.width;
            this.height = data.height;
            return this.blob;
        }
        return null;
    }
}

w.ImageBinary = ImageBinary;
})(window);