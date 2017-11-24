const {Cu, Ci, Cc} = require("chrome");
const tabs = require("sdk/tabs");
const WaifuImage = require("./waifu-image").WaifuImage;
const utils = require("./utils");
Cu.import("resource://gre/modules/Downloads.jsm");
Cu.import("resource://gre/modules/Task.jsm");

function createDownload(src, dst, referrer) {
    return Downloads.createDownload({
        source: {
            url: src,
            isPrivate: utils.isPrivateBrowsing(),
            referrer: referrer
        },
        target: dst
    });
}

function ImageDownload(url, dst, width, height, options) {
    this.src = url;
    this.dst = dst;

    // Options
    this.compress = options && options.compress || true;
    // TODO add more options to pass into waifu2ximage

    this.image = new WaifuImage(tabs.activeTab, url, width, height, this.compress);
    this.downloadList = null;
    this.downloads = [];
    this.referrer = tabs.activeTab.url;
    this.errorCallback = null;
    this.completeCallback = null;
}

ImageDownload.prototype.begin = function() {
    Task.spawn(function() {
        this.downloadList = yield Downloads.getList(Downloads.ALL);
        this.downloads.push(yield createDownload(this.src, this.dst, this.referrer) );
        this.downloadList.add(this.downloads[0]);
        this.image.upscale(this.__downloadFiles.bind(this));
    }.bind(this));
}

ImageDownload.prototype.onError = function(callback) {
    this.errorCallback = callback;
}

ImageDownload.prototype.onComplete = function(callback) {
    this.completeCallback = callback;
}

ImageDownload.prototype.addNewDestination = function(dst) {
    if (this.image) {
        Task.spawn(function() {
            let download = yield createDownload(this.src, dst, this.referrer);
            this.downloads.push(download);
            this.downloadList.add(download);
        }.bind(this));
    }
}

ImageDownload.prototype.hasDownload = function(src, dst) {
    if (src == this.src) {
        for (let i = 0; i < this.downloads.length; i++) {
            if (this.downloads[i].target.path == dst) {
                return true;
            }
        }
    }
    return false;
}

ImageDownload.prototype.cancel = function() {
    if (this.image) {
        this.image.cancel();
        // TODO remove the download as well
    }
}

ImageDownload.prototype.__downloadFiles = function(error, isTransparent, continueCallback) {
    if (!this.cancelled && !error) {
        Task.spawn(function() {
            let destinations = [];
            let promises = [];

            // Process each download
            for (let i = 0; i < this.downloads.length; i++) {
                let download = this.downloads[i];
                let path = download.target.path;

                // If a destination is not png and image is transparent, recreate download and change file name
                if (isTransparent && !path.endsWith(".png")) {
                    // Change the path with png extension
                    let start = path.lastIndexOf(".");
                    path = (start == -1) ? path + ".png" : path.substring(0, start) + ".png";
                    console.log("Changed file name of transparent image to " + path);

                    // Delete old download and make a new one with new path
                    this.downloadList.remove(download);
                    download.finalize(true);
                    download = yield createDownload(this.src, path, this.referrer);
                    this.downloadList.add(download);
                }

                // Download each image to their location to simulate a download complete
                destinations.push(path);
                download.start();
                promises.push(download.whenSucceeded());
            }
            Promise.all(promises).then(continueCallback.bind(this, destinations));
        }.bind(this));
    } else {
        for (let i = 0; i < this.downloads.length; i++) {
            let download = this.downloads[i];
            this.downloadList.remove(download);
            download.finalize(true);
        }
        continueCallback();
        if (error && this.errorCallback) {
            this.errorCallback(error);
        }
    }
    this.completeCallback();
    this.image = null;
    this.completeCallback = null;
    this.errorCallback = null;
}

exports.ImageDownload = ImageDownload;

