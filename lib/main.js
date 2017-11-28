const ImageDownload = require("./image-download").ImageDownload;
const self = require("sdk/self");
const cm = require("sdk/context-menu");
const utils = require("./utils");
const prefs = require("./prefs");

const sUpscaleQueue = {};

function upscaleImage(src, dst, width, height) {
    if (src in sUpscaleQueue) {
        // Make sure we don't already have this destination already
        if (sUpscaleQueue[src].hasDownload(src, dst)) {
            utils.notify("You are already downloading this image to the same destination already.",
                    src, src);
        }
    } else {
        if (src in sUpscaleQueue) {
            sUpscaleQueue[src].addNewDestination(dst);
        } else {
            let opts = {
                compressionPercentage: prefs.getCompressionOnSave(),
                upscaleOnce: prefs.onlyUpscaleOnce(),
                upscaleOnceMaxArea: prefs.getMaxAreaOfUpscaleOnce()
            };

            // Create new download entry
            sUpscaleQueue[src] = new ImageDownload(src, dst, width, height, opts);
            sUpscaleQueue[src].onError(function(error) {
                utils.notify("Cannot upscale: " + error.toString().trim() +
                        "\n(Click to open image in new tab)", src, src);
            });
            sUpscaleQueue[src].onComplete(function() {
                delete sUpscaleQueue[src];
            });
            sUpscaleQueue[src].begin();
        }
    }
}

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
        console.log("START NEW IMAGE", message.src)

        let opts = {
            title: "Waifu2x this image",
            path: message.src,
            onSelect: function(cancelled, savePath, filename, extension) {
                if (cancelled) {
                    console.log("   Save as Cancelled");
                } else {
                    upscaleImage(message.src, savePath, message.width, message.height);
                }
            }
        };
        if (prefs.getCompressionOnSave() > 0) {
            opts.extension = "jpg";
        }
        utils.openSaveAsDialogForImages(opts);
    }
});
