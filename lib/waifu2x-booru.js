(function(w) {
"use strict"

const IMAGE_MAX_SIDE = 2000;
const IMAGE_MAX_SIZE = 4 * 1024 * 1024;
const TIMEOUT = 800;
const FAILED_SIZE_THRESHOLD = 4000;

const UploadUrl = "https://waifu2x.booru.pics/Home/upload";
const FromLinkUrl = "https://waifu2x.booru.pics/Home/fromlink";
const OutFileUrl = "http://waifu2x.booru.pics/outfiles/";
const StatusUrl = "https://waifu2x.booru.pics/Home/statusjson";

// Global variables to keep track of request's state
const sQueue = [];
let sCurrentRequest = null;

function runNextJob() {
    console.log("       Check next request for waifu2x booru");
    if (!sCurrentRequest && sQueue.length) {
        let request = sQueue.shift()
        sCurrentRequest = request;
        request.__execute();
    } else {
        if (sQueue.length) {
            console.log("       Job already running please wait");
        } else {
            console.log("       Job queue is empty");
        }
    }
}

class Request {
    constructor(imageBinary, url, action, opts) {
        // Getters
        this.cancelled = false;
        this.running = false;

        this.__saveAsPng = opts.saveAsPng || false;
        console.log("Save as png?", this.__saveAsPng)
        this.__resolve = null;
        this.__reject = null;

        this.__action = action;
        this.__url = url;
        this.__image = imageBinary;
        this.__data = opts.data;
        this.__imageId = 0;
    }

    cancel() {
        this.cancelled = true;
    }

    start(forceNext) {
        console.log("running request", this.__url);
        if (!this.cancelled) {
            return new Promise((res, rej) => {
                this.__resolve = res;
                this.__reject = rej;
                if (forceNext) {
                    sQueue.unshift(this);
                } else {
                    sQueue.push(this);
                }

                // If busy, then store the image to save memory
                if (sCurrentRequest) {
                    console.log("Upscale busy, store image into storage")
                    return this.__image.store()
                        .then(runNextJob);
                }
                runNextJob();           // TODO return bool if done, will need to store blob in storage and taken out later, save memory
            });
        }
        return Promise.resolve();
    }

    __execute() {
        console.log("__execute")
        this.running = true;
        if (this.cancelled) {
            return this.__resolve();
        }
        return (this.__action == "POST"
                ? this.__ensurePostData().then(() => utils.post(this.__url, this.__data))
                : utils.get(this.__url))
            .then(data => this.__onResponse(data))
            .then(blob => this.__resolve(blob))
            .then(() => this.__finish())
            .catch(this.__reject);
    }

    __ensurePostData() {
        if (this.__image.blob == null) {
            console.log("Try to retrieve stored data from storage");
            return this.__image.retrieve()
                .then(() => {
                    if (!this.__image.blob) {
                        throw new Error("Cannot upscale, tried to retrieve, but there isn't any");
                    }
                    this.__data.img = this.__image.blob;
                });
        }
        this.__data.img = this.__image.blob;
        return Promise.resolve();
    }

    __onResponse(data) {
        console.log("On response")
        if (this.cancelled) {
            return this.__resolve();
        }

        if (data.includes("/outfiles/")) {
            // Fast download, image is already ready
            console.log("       Waifu2x booru: download image now");
            let m = data.match('<a href="/outfiles/(.*).jpg" class="btn btn-default">');
            if (!m) {
                throw new Error("Cannot regex the image id");
            }
            this.__imageId = m[1];

            // If need png, check to see if it exists, if not return an error
            console.log("Save as png2?", this.__saveAsPng)
            let savePng = this.__saveAsPng
                && data.match('<a href="/outfiles/(.*).png" class="btn btn-default">');

            // Download the image
            return this.__downloadResult(savePng);
        } else if (data.includes("\\/outfiles\\/")) {
            // Check the status
            this.__imageId = between(data, '"&hash=" + "', '"');
            let handle = between(data, '"handle=" + "', '"');
            if (!this.__imageId || !handle) {
                throw new Error("Cannot regex the image id");
            }
            return this.__checkStatus(handle);
        } else if (data.includes("You have already queued an image")) {
            console.log("       Waifu2x booru: Waiting for another image to finish, add this back into queue")
            sQueue.add(this);
        } else {
            console.log("       Failed upload image", data || data.trim())
            return Promise.resolve();
        }
    }

    __downloadResult(savePng) {
        let url = OutFileUrl + this.__imageId + (savePng ? ".png" : ".jpg");
        console.log("       Waifu2x booru: Download image", savePng ? "as png": "as jpg", url);
        return utils.getBlob(url)
            .then(blob => {
                if (blob.size < FAILED_SIZE_THRESHOLD) {
                    console.log("Image failed to download because too small")
                    if (savePng) {
                        throw new Error("Unable to upscale image, server error to resize image, try again later");
                    } else {
                        // If cannot get jpeg from server, try getting the png, its slower but works
                        return this.__downloadResult(true)
                            .then(compress)
                            .then(ret => {
                                if (ret) return ret.blob;
                                throw new Error("Cannot compress image after getting png upscaled image");
                            });
                    }
                } else {
                    return blob;
                }
            });
    }

    __checkStatus(handle) {         // need to return blob
        let url = StatusUrl + "?handle=" + handle + "&hash=" + this.__imageId;
        return utils.get(url)
            .then(data => {
                if (this.cancelled) {
                    return Promise.resolve();
                }
                console.log(data)
                let json = JSON.parse(data);
                let progress = json.denominator ? json.numerator / json.denominator : 1;
                console.log(progress)
                if (json) {
                    if (json.status === "done") {
                        return this.__downloadResult(!json.png_deleted && this.__saveAsPng);
                    } else {
                        // Keep polling till its finished
                        console.log("       Waifu2x booru: request finished, time to check for status");
                        return new Promise((res, rej) => {
                            setTimeout(function() {
                                this.__checkStatus(handle).then(res).catch(rej);
                            }.bind(this), TIMEOUT);
                        });
                    }
                } else {
                    throw new Error("Unable to get json when checking status");
                }
            });
    }

    __finish() {
        this.__data = null;
        this.__image = null;
        this.running = false;
        sCurrentRequest = null;
        runNextJob();
    }
}

/**
 *  Helper function to get the data between two
 */
function between(text, begin, end, index) {
    index = index || 0;
    let sIndex = text.indexOf(begin, index);
    if (sIndex == -1) return null;
    sIndex += begin.length;
    let eIndex = text.indexOf(end, sIndex);
    if (eIndex == -1) return null;
    return text.substring(sIndex, eIndex);
}

function upscaleByUpload(imageBinary, saveAsPng /* optional */, denoise /* optional */,
        scale /* optional */) {
    let data = {
        denoise: denoise || 1,
        scale: scale === false ? "1" : "2",
        // Later "img" is set for blob upload
    };
    let opts = {
        data: data,
        saveAsPng: saveAsPng || false
    }
    return new Request(imageBinary, UploadUrl, "POST", opts);
}

function upscaleByUrl(imageBinary, saveAsPng /* optional */, denoise /* optional */, scale /* optional */) {
    // Generate the url
    let uploadUrl = FromLinkUrl + "?url=" + encodeURIComponent(imageBinary.src)
        + "&denoise=" + denoise + "&scale=" + (scale === false ? "1" : "2") + "&submit=";
    return new Request(imageBinary, uploadUrl, "GET", { saveAsPng: saveAsPng || false });
}

w.Waifu2xBooru = {
    shrinkWithMaxSize: function(width, height) {
        let ratio = width / height;
        if (ratio > 1) {
            return {
                width: IMAGE_MAX_SIDE,
                height: Math.floor(IMAGE_MAX_SIDE / ratio)
            };
        } else {
            return {
                height: IMAGE_MAX_SIDE,
                width: Math.floor(ratio * IMAGE_MAX_SIDE)
            };
        }
    },

    upscaleByUrl: upscaleByUrl,

    upscaleByUpload: upscaleByUpload,

    shouldScaleWith1_6: function(width, height) {
        let threshold = IMAGE_MAX_SIDE * 0.95;
        let side = Math.max(width, height);
        return side < threshold && side * 1.6 >= threshold;
    },

    isLargeEnough: function(width, height) {
        return Math.max(width, height) > IMAGE_MAX_SIDE * 2 * 0.7;
    },

    needsResize: function(width, height) {
        return Math.max(width, height) > IMAGE_MAX_SIDE;
    },

    checkServiceWorking: function() {
        return utils.get("http://waifu2x.booru.pics/").then(data => {
            return data.includes('class="btn btn-default">Waifu2X</button>');
        })
        .catch(() => { return false; });
    },

    MAX_UPLOAD_AREA: IMAGE_MAX_SIDE * IMAGE_MAX_SIDE,
    MAX_SIZE: IMAGE_MAX_SIZE,
    MAX_SIDE: IMAGE_MAX_SIDE,
};

})(window);
