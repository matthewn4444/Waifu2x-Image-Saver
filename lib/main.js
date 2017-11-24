const ImageDownload = require("./image-download").ImageDownload;
const self = require("sdk/self");
const cm = require("sdk/context-menu");
const utils = require("./utils");

const sUpscaleQueue = {};

function upscaleImage(src, dst, width, height) {
    if (src in sUpscaleQueue) {
        // Make sure we don't already have this destination already
        console.log("weeeee inside", src, dst);
        if (sUpscaleQueue[src].hasDownload(src, dst)) {
            console.log("==============We have this src and dst already");
            utils.notify("You are already downloading this image to the same destination already.",
                    src, src);
        }
    } else {
        console.log("Start upscaler process");
        if (src in sUpscaleQueue) {
            console.log(0.4)
            console.log("Add new destination into downloading object");
            sUpscaleQueue[src].addNewDestination(dst);
        } else {
            // Create new download entry
            sUpscaleQueue[src] = new ImageDownload(src, dst, width, height);
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
        console.log("NEW IMAGE REQUEST onmessage", message, message.width, message.height)

        let opts = {
            title: "Waifu2x this image",
            path: message.src,
            // extension: "jpg",
            onSelect: function(cancelled, savePath, filename, extension) {
                if (cancelled) {
                    console.log("Cancelled");
                } else {
                    console.log(arguments);
                    upscaleImage(message.src, savePath, message.width, message.height);
                }
            }
        };
        utils.openSaveAsDialogForImages(opts);
    }
});