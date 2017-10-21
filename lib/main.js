const {Cu, Ci, Cc} = require("chrome");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");
Cu.import("resource://gre/modules/Task.jsm");
const self = require("sdk/self");
const cm = require("sdk/context-menu");
const Request = require("sdk/request").Request;
const tabs = require("sdk/tabs");
const WaifuImage = require("./waifu-image").WaifuImage;
const utils = require("./utils");

const sUpscaleQueue = {};

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

// TODO refactor this into its own class
function upscaleImage(src, dst, filename, width, height) {
    let startTime = Date.now();
    console.log("Start upscaler process")

    Task.spawn(function() {
        // Create the download
        sUpscaleQueue[src].image = new WaifuImage(tabs.activeTab, src, width, height, filename, true);
        sUpscaleQueue[src].running = true;
        sUpscaleQueue[src].referrer = tabs.activeTab.url;
        sUpscaleQueue[src].download = yield createDownload(src, dst, sUpscaleQueue[src].referrer);

        let downloadList = yield Downloads.getList(Downloads.ALL);
        downloadList.add(sUpscaleQueue[src].download);

        // TODO handle cancelling
        sUpscaleQueue[src].image.upscale({
            target: dst,
            onComplete: function(error, callback) {
                console.log("Finished, back in main", error || "no error", this.src)
                let download = sUpscaleQueue[this.src].download;
                delete sUpscaleQueue[this.src];
                if (!this.cancelled) {
                    if (error) {
                        console.log(error);
                        downloadList.remove(download);
                        download.finalize(true);
                        callback();
                        utils.notify("Cannot upscale: " + error.toString().trim() +
                            "\n(Click to open image in new tab)", src, src);
                    } else {
                        download.start();
                        download.whenSucceeded().then(callback);
                    }
                } else {
                    console.log("Cancelled");
                    downloadList.remove(download);
                    download.finalize(true);
                    callback();
                }
                console.log("Complete", download)
            },
            onDestinationChange: function(newTarget, callback) {
                Task.spawn(function() {
                    // Changing the destination file, cancel old download and start anew
                    let download = sUpscaleQueue[this.src].download;
                    let referrer = sUpscaleQueue[this.src].referrer;
                    console.log("Cahngeg file ext", sUpscaleQueue[this.src].referrer, download);
                    downloadList.remove(download);
                    download.finalize(true);
                    sUpscaleQueue[src].download = yield createDownload(this.src, newTarget, referrer);
                    downloadList.add(sUpscaleQueue[src].download);
                    callback();
                }.bind(this));
            }
        });
    });
}

// TODO support gif and bmp

cm.Item({
    label: "Waifu2x this image",
    context: cm.SelectorContext("img"),
    // TODO below try adding a canvas to see if the image is transparent
    // then we are forced to png, which means instead of jpg, we have to rescale down and use png before upload
    // force bmp to png or jpg, give up on gifs
    contentScriptFile: [ self.data.url("context-img.js")],
    onMessage: function(message) {
        if (message.error) {
            return notify("There was an error in trying to load the image.", message.src, message.src);
        }

        console.log("onmessage", message, message.width, message.height)

        let opts = {
            title: "Waifu2x this image",
            path: message.src,
            // extension: "jpg",
            onSelect: function(cancelled, savePath, filename, extension) {
                if (cancelled) {
                    console.log("Cancelled");
                } else {
                    console.log(arguments);
                    sUpscaleQueue[message.src] = { running: false };
                    upscaleImage(message.src, savePath, filename, message.width, message.height);
                }
            }
        };
        utils.openSaveAsDialogForImages(opts);
    }
});
