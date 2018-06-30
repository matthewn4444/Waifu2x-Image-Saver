(function(w) {
"use scrict"

const THUMBNAIL_WIDTH = 100;        // TODO change when GUI is made

const Operations = Object.freeze({
    Resize: 0,
    Compress: 1,
    Upscale: 2
});

class ImageProcess {
    constructor(blob, width, height, src, opts) {
        this.image = new ImageBinary(blob, width, height, src);
        this.thumbnail = null;
        this.cancelled = false;
        this.earlyFinish = false;

        this.__operations = [];
        this.__upscaleOnceOnly = !!opts && !!opts.upscaleOnceOnly;
        this.__preservePngData = !!opts && !!opts.preservePngData;
        this.__compressAtEnd = !!opts && !!opts.compressAtEnd;
        this.__compressionPercentage = opts && opts.compressionPercentage
            ? opts.compressionPercentage : 0;
        this.__timesUpscaled = 0;

        if (opts && opts.upscaleAgainThreshold > 0 && !this.__upscaleOnceOnly) {
            this.__upscaleOnceOnly = this.image.area < opts.upscaleAgainThreshold;
        }
    }

    start() {
        return this.image.init()
            .then(() => {
                let promises = [ this.__createThumbnail() ];
                let work = this.__calculateProcess()
                    .then(() => this.__executeNext(0))
                    .then(() => this.__finalize())
                    .catch(e => {
                        this.image.ensureTransparent();
                        throw e;
                    });
                promises.push(work);
                return Promise.all(promises);
            });
    }

    cancel() {
        this.cancelled = true;
        if (this.image.upscaleRequest) {
            this.image.upscaleRequest.cancel();
        }
    }

    __calculateProcess() {
        // Update the optional flags:
        // if image is transparent, do not compress at end
        // if not transparent and compressed at end, do not preserve png data
        if (this.image.transparent) {
            this.__compressAtEnd = false;
        } else if (this.__compressAtEnd) {
            this.__preservePngData = false;
        }

        let width = this.image.width;
        let height = this.image.height;

        // First see if the image can be upscaled
        if (this.__isTransparentAndTooLarge()) {
            console.log("Transparent image is too large now");
            return Promise.resolve();
        }

        for (let i = 0; i < 2; i++) {
             if (Waifu2xBooru.isLargeEnough(width, height)) {
                // Image is too large, just save the image
                console.log("Image is large enough, just download it");
                break;
            }

            // Check if dimensions are too large for upscale, then resize
            if (Waifu2xBooru.needsResize(width, height)) {
                this.__operations.push(Operations.Resize);
            }
            else {
                // Compress if needed
                this.__operations.push(Operations.Compress);
            }
            // Upload and upscale
            this.__operations.push(Operations.Upscale);
            width *= 2;
            height *= 2;

            if (this.__upscaleOnceOnly) {
                break;
            }
        }
        return  Promise.resolve();
    }

    __executeNext(index) {
        console.log("executeNext", index + "/" + this.__operations.length);

        if (this.earlyFinish || this.cancelled || !this.__operations.length) {
            console.log("Leave early ", this.earlyFinish, this.cancelled);
            return;
        } else {
            let p = Promise.resolve();
            switch(this.__operations[index]) {
                case Operations.Resize:
                    var size = Waifu2xBooru.shrinkWithMaxSize(this.image.width, this.image.height);
                    console.log("   Resize image to ", size.width, size.height);
                    p = this.image.resize(size.width, size.height, Waifu2xBooru.MAX_SIZE,
                                          this.__preservePngData)
                        .then(blob => { this.earlyFinish = blob == null });
                    break;
                case Operations.Compress:
                    if (this.image.blob.size > Waifu2xBooru.MAX_SIZE) {
                        console.log("Compress image");
                        p = this.image.compress(Waifu2xBooru.MAX_SIZE, 0, this.__preservePngData)
                            .then(blob => { this.earlyFinish = blob == null });
                    } else {
                        p = Promise.resolve();      // Skip, no compression needed
                    }
                    break;
                case Operations.Upscale:
                    console.log("Upscale");
                    p = this.image.upscale(this.__preservePngData, this.__timesUpscaled > 0)
                        .then(blob => {
                            this.earlyFinish = (blob == null) || this.__isTransparentAndTooLarge();
                            this.__timesUpscaled++;
                        });
                    break;
                default:
                    throw new Error("Unknown operation occurred");
            }
            if (index + 1 >= this.__operations.length) {
                // Finished
                return p;
            }
            return p.then(() => this.__executeNext(index + 1));
        }
    }

    __finalize() {
        if (!this.cancelled) {
            return this.image.ensureTransparent()
                .then(() => {
                    if (this.__compressAtEnd) {
                        this.image.compress(Waifu2xBooru.MAX_SIZE, this.__compressionPercentage,
                                            this.__preservePngData);
                    }
                });
        }
        return Promise.resolve();
    }

    __isTransparentAndTooLarge() {
        return this.image.transparent && this.image.blob.size > Waifu2xBooru.MAX_SIZE * 2;
    }

    __createThumbnail() {
        return this.image.createThumbnail(THUMBNAIL_WIDTH)
            .then(ret => {
                if (ret) {
                    this.thumbnail = ret.blob;
                } else {
                    console.error("Cannot create thumbnail because failed to resize.");
                }
                return Promise.resolve()
            });
    }
}

w.ImageProcess = ImageProcess;
})(window);