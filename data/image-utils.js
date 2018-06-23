(function(w) {
'use strict'

if (w.imageUtilsAttached) return; else w.imageUtilsAttached = true;     // Attach once

function loadImage(arg) {
    return new Promise((res, rej) => {
        if (!arg) {
            return rej("Cannot load image without valid input");
        }
        var image = new Image();
        image.onload = () => res(image);
        image.onerror = rej;
        image.src =  (typeof arg === 'string' || arg instanceof String)
            ? arg : URL.createObjectURL(arg);
    });
}

function getCanvasBlob(canvas, mimeType, arg) {
    return new Promise(res => canvas.toBlob(res, mimeType, arg));
}

/**
 * Get the image from url, best to do this when actually seeing the image loaded already on tab.
 * @param src: the src url to get the image blob
 */
function getImage(src) {
    //  Sometimes image takes some time to get, page might be closed already, ask to not close page
    let oldFn = window.onbeforeunload;
    window.onbeforeunload = function(){
        return 'Need to download image before upscale, please do not leave. \
            After this dialog box, you can leave.';
    };

    return loadImage(src)
        .then(image => {
            let canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            let context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            return getCanvasBlob(canvas, src.includes(".png") ? "image/png" : "image/jpeg", 1)
                .then(blob => {
                    // Restore the old confirmation
                    window.onbeforeunload = oldFn;
                    return {
                        src: src,
                        width: image.width,
                        height: image.height,
                        data: blob
                    }
                });
        });
}

function onReceive(message, sender, sendResponse) {
    console.log("Received event", message.name);
    let promise = null;
    switch (message.name) {
        case "saveAs":
            saveAs(message.data.blob, message.data.filename);
            promise = Promise.resolve();
            break;
        case "getImage":
            promise = getImage(message.data.src);
            break;
    }
    if (!promise) {
        return sendResponse({ error: "Image-utils: cannot find name of message " + message.name});
    }
    promise.then(sendResponse).catch(e => sendResponse({ error: e }));
    return true;
}

browser.runtime.onMessage.addListener(onReceive);
})(window);
