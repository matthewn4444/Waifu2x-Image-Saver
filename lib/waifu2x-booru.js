const {Cc, Ci, Cu} = require("chrome");
const { setTimeout } = require("sdk/timers");
const {getMostRecentBrowserWindow} = require("sdk/window/utils");
Cu.import("resource://gre/modules/Downloads.jsm");
const fileIO = require("sdk/io/file");
const IMAGE_MAX_SIDE = 2560;
const IMAGE_MAX_SIZE = 2 * 1024 * 1024;

// const prefs = require("./prefs");
const utils = require("./utils");
const ImageBinary = require("./image-binary").ImageBinary;

// Global variables to keep track of request's state
const sQueue = [];
let sCurrentRequest = null;

/**
 *  Helper function to get the data between two
 */
String.prototype.between = function(begin, end, index) {
    index = index || 0;
    let sIndex = this.indexOf(begin, index);
    if (sIndex == -1) return null;
    sIndex += begin.length;
    let eIndex = this.indexOf(end, sIndex);
    if (eIndex == -1) return null;
    return this.substring(sIndex, eIndex);
}

function runNextJob() {
    console.log("Check next request for waifu2x booru");
    if (!sCurrentRequest && sQueue.length) {
        sCurrentRequest = sQueue.shift();
        sCurrentRequest.__execute();
    } else {
        if (sQueue.length) {
            console.log("   Job already running please wait");
        } else {
            console.log("   Job queue is empty");
        }
    }
}

/**
 * Request Class
 * @param {[String]} savePath    [path to save the file]
 * @param {[Integer]} scaleFactor [scale the image up to]
 */
function Request(scaleFactor) {
    // Getters
    this.cancelled = false;

    // Constructor variables
    this.__scaleFactor = scaleFactor;

    this.__request = null;
    this.__callback = null;

    // Request data
    this.__action = null;
    this.__url = null;
    this.__data = null;
    this.__imageId = 0;
    this.__saveAsPng = true;
}

Request.prototype.upscaleFromUrl = function(url, saveAsPng, callback) {
    if (this.isRunning()) {
        throw new Error("Request is already running, cannot use this request when running.");
    }
    this.cancelled = false;
    this.__callback = callback;
    this.__saveAsPng = saveAsPng;

    // Generate the url
    let scale = this.__scaleFactor == exports.SCALE_1_6 ? "1" : "2";
    this.__url = "https://waifu2x.booru.pics/Home/fromlink?url=" + encodeURIComponent(url) + "&denoise=" + "1" + "&scale=" + scale + "&submit=";
    /*prefs.getNoiseLevel()*/

    // Add the data to the queue
    this.__action = "GET";
    sQueue.push(this);
    runNextJob();
}

Request.prototype.upscaleByUpload = function(imageBinary, saveAsPng, callback) {
    if (this.isRunning()) {
        return callback(new Error("Request is already running, cannot use this request when running."));
    }
    this.cancelled = false;
    this.__callback = callback;
    this.__saveAsPng = saveAsPng;
    let browser = getMostRecentBrowserWindow();
    this.__data = {
        "denoise": 1/*prefs.getNoiseLevel()*/,
        "scale": this.__scaleFactor == exports.SCALE_1_6 ? "1" : "2",
        "img": new browser.File([imageBinary.toBinary()], "image.png")
    };
    this.__url = "https://waifu2x.booru.pics/Home/upload";
    this.__action = "POST";
    sQueue.push(this);
    runNextJob();
}

Request.prototype.cancel = function() {
    console.log("Cancel waifu2x booru");
    if (this.__request) {
        this.__request.abort();
    } else {
        this.cancelled = true;
        if (this.__callback) {
            this.__callback("aborted");     // TODO figure a better way of calling callback....
        }
    }
}

Request.prototype.isRunning = function() {
    return !!this.__request;
}

Request.prototype.__execute = function() {
    console.log("   Running request", this.__url);
    if (this.cancelled) {
        return this.__finish("aborted");
    }
    this.__request = utils.request(this.__url, this.__action, this.__data, this.__onResponse.bind(this), this.__finish.bind(this), this.__finish.bind(this));
}

Request.prototype.__onResponse = function(data) {
    // Success
    if (data.indexOf("/outfiles/") != -1) {
        console.log("   Waifu2x booru: download image now");
        let m = data.match('<a href="/outfiles/(.*).jpg" class="btn btn-default">');
        if (!m) {
            return this.__finish(new Error("Cannot regex the image id"));
        }
        let canSaveAsPng = this.__saveAsPng;

        // If need png, check to see if it exists, if not return an error
        if (this.__saveAsPng) {
            let hasPng = data.match('<a href="/outfiles/(.*).png" class="btn btn-default">');
            if (!hasPng) {
                // Cannot find a png to download, send back as jpeg
                console.log("   Waifu2x booru: Cannot find png link, so save as jpeg");
                canSaveAsPng = false;
            }
        }
        this.__imageId = m[1];
        this.__downloadResult(canSaveAsPng, this.__finish.bind(this));
    } else if (data.indexOf("\\/outfiles\\/") != -1) {
        this.__imageId = data.between('"&hash=" + "', '"');
        let handle = data.between('"handle=" + "', '"');
        if (!this.__imageId || !handle) {
            console.log(handle, this.__imageId)
            return this.__finish(new Error("Cannot regex the image id"));
        }
        this.__checkStatus(handle, this.__finish.bind(this));
    } else if (data.indexOf("You have already queued an image") != -1) {
        console.log("   Waifu2x booru: Waiting for another image to finish, todo")
    } else {
        console.log("Failed upload image", data || data.trim())
        this.__finish(data || data.trim());
    }
}

Request.prototype.__finish = function(e, data, savedAsPng) {
    // Run the next request then run this callback
    this.__request = null;
    sCurrentRequest = null;
    runNextJob();
    this.__callback(e, data, savedAsPng);
    this.__callback = null;
}

Request.prototype.__downloadResult = function(asPng, callback) {
    let url = "http://waifu2x.booru.pics/outfiles/" + this.__imageId + (asPng ? ".png" : ".jpg");
    console.log("   Waifu2x booru: Download image", asPng ? "as png": "as jpg", url);
    utils.request(url, "GET", {responseType : "arraybuffer"}, function(data) {
        callback(null, new ImageBinary(new Uint8Array(data)), asPng);
    }, callback, callback);
}

Request.prototype.__checkStatus = function(handle, callback) {
    console.log("   Waifu2x booru: checking status...");
    let url = "https://waifu2x.booru.pics/Home/statusjson?handle=" + handle + "&hash=" + this.__imageId;
    if (this.cancelled) {
        return this.__finish("aborted");
    }
    utils.request(url, "GET", null, function(data) {
        let json = JSON.parse(data);
        if (json) {
            if (json.status === "done") {
                this.__downloadResult(!json.png_deleted && this.__saveAsPng, callback);
            } else {
                // Keep polling till its finished
                console.log("   Waifu2x booru: request finished, time to check for status");
                setTimeout(this.__checkStatus.bind(this, handle, callback), 1000);
            }
        } else {
            callback(new Error("Unable to get json when checking status"));
        }
    }.bind(this), callback, callback);
}

exports.shrinkWithMaxSize = function(width, height) {
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
}

exports.shouldScaleWith1_6 = function(width, height) {
    let threshold = IMAGE_MAX_SIDE * 0.95;
    let side = Math.max(width, height);
    return side < threshold && side * 1.6 >= threshold;
}

exports.isLargeEnough = function(width, height) {
    return Math.max(width, height) > IMAGE_MAX_SIDE * 2 * 0.7;
}

exports.needsResize = function(width, height) {
    return Math.max(width, height) > IMAGE_MAX_SIDE;
}

exports.checkServiceWorking = function(callback) {
    utils.request("http://waifu2x.booru.pics/", "GET", null, function(data) {
        callback(data.includes('class="btn btn-default">Waifu2X</button>'));
    }, function() {
        callback(false);
    });
}

exports.Request = Request;
exports.SCALE_1_6 = 1.6;
exports.SCALE_2 = 2;
exports.MAX_UPLOAD_AREA = IMAGE_MAX_SIDE * IMAGE_MAX_SIDE;
exports.MAX_SIZE = IMAGE_MAX_SIZE;
exports.MAX_SIDE = IMAGE_MAX_SIDE;
