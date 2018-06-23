(function(w) {
const Pica = window.pica();

function executeScript(tab, file) {
    return browser.tabs.executeScript({ file: file }).then(() => tab);
}

function ensureCalled(name, data, scripts /* optional */) {
    return utils.activeTab()
        .then(tab => {
            let p = [ executeScript(tab, "/data/image-utils.js") ];

            // Load the scripts passsed in
            if (scripts) scripts.forEach(script => { p.push(executeScript(tab, script)) });
            return Promise.all(p);
        })
        .then(tabs =>
             browser.tabs.sendMessage(tabs[0].id, {
                name: name,
                data: data
             })
             // TODO maybe if needed add a timeout to try to send the message again
        )
        .then(ret => {
            if (ret && ret.error) {
                throw new Error(ret.error);
            }
            return ret;
        })
}

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

function getCompressedJpegBlob(canvas, sizeLimit, quality /* optional */) {
    function getBlob(c, blob, q, sizeLimit, callback) {
        // Lower than 0.5 quality fails to compress image, quality is too low
        if (q <= 0.5) {
            return callback();
        }
        if (blob) {
            if (sizeLimit <= 0 || blob.size < sizeLimit) {
                console.log("Using compressed jpeg with quality", q);
                return callback({
                    blob: blob,
                    width: c.width,
                    height: c.height
                });
            }
            q -= 0.05;
        }
        c.toBlob(b => getBlob(c, b, q, sizeLimit, callback), "image/jpeg", q);
    }
    return new Promise(res => getBlob(canvas, null, quality || 1, sizeLimit, res));
}

function getReducedPngBlob(canvas, sizeLimit) {
    if (sizeLimit <= 0) {
        return getCanvasBlob(canvas, "image/png")
            .then(blob => {
                return {
                    blob: blob,
                    width: canvas.width,
                    height: canvas.height
                };
            });
    }
    function getBlob(inputCanvas, tempCanvas, lastBlobData, high, low, sizeLimit, res, rej) {
        let fraction = (high - low) / 2 + low;
        let newWidth = Math.floor(inputCanvas.width * fraction);
        let newHeight = Math.floor(inputCanvas.height * fraction);
        tempCanvas.width = newWidth;
        tempCanvas.height = newHeight;

        Pica.resize(inputCanvas, tempCanvas, { alpha: true} )
            .then(result => Pica.toBlob(result, "image/png"))
            .then(blob => {
                if (blob.size < sizeLimit) {
                    let blobData = {
                        blob: blob,
                        width: tempCanvas.width,
                        height: tempCanvas.height
                    };
                    if (high - fraction < 0.01) {
                        return res(blobData);
                    }
                    // Record that this blob is the best so far
                    getBlob(inputCanvas, tempCanvas, blobData, high, fraction, sizeLimit, res, rej);
                } else {
                    if (fraction - low < 0.01) {
                        return res(lastBlobData);          // Return last good blob found
                    }
                    getBlob(inputCanvas, tempCanvas, lastBlobData, fraction, low, sizeLimit, res, rej);
                }
            })
            .catch(rej);
    }
    let c = document.createElement("canvas");
    return new Promise((res, rej) => getBlob(canvas, c, null, 1, 0.7, sizeLimit, res, rej));
}

function getCanvasBlob(canvas, mimeType, arg) {
    return new Promise(res => canvas.toBlob(res, mimeType, arg));
}

/**
 * Resize an image. Will not resize if width and heigh are the same or less equal 0. Will compress
 * image to sizeLimit if passed and not 0 and will force png (with transparency perserved) if set.
 * @param blob: the image
 * @param width: the image width to resize to, will not resize if same as image width
 * @param height: the image height to resize to, will not resize if same as image height
 * @param sizeLimit: if not 0, will compress image under specified size
 * @param forcePng: compress or resize png to preserve transparency, compressing will downscale pic
 */
function resizeImage(blob, width, height, sizeLimit, quality, forcePng) {
    return loadImage(blob)
        .then(image => {
            let canvas = document.createElement('canvas');
            if (width <= 0 && height <= 0) {
                // Just compressing, draw image into canvas
                canvas.width = image.width;
                canvas.height = image.height;
                canvas.getContext('2d').drawImage(image, 0, 0);
                return canvas;
            } else {
                console.log("Resize image to ", width, height, forcePng);
                canvas.width = width;
                canvas.height = height;
                return Pica.resize(image, canvas, { alpha: forcePng } )
                    .then(() => canvas);
            }
        })
        .then(canvas => {
            if (forcePng) {
                return getReducedPngBlob(canvas, sizeLimit);
            } else if (quality > 0) {
                return getCompressedJpegBlob(canvas, sizeLimit, quality);
            }
            return getCompressedJpegBlob(canvas, sizeLimit);
        });
}

/**
 * Ask this function to see if the image has transparency
 * @param blob: Blob image data, preferably png
 */
w.checkTransparency = function(blob) {
    return new Promise((res, rej) => {
        if (blob.type != "image/png") {
            return res(false);
        }
        loadImage(blob)
            .then(image => {
                let canvas = document.createElement('canvas');
                let context = canvas.getContext('2d');
                canvas.width = image.width;
                canvas.height = image.height;
                context.drawImage(image, 0, 0);

                // Get the data inside the image, ignore the outer layer as it could be falsely transparent
                const data = context.getImageData(1, 1, canvas.width - 2, canvas.height - 2).data;
                for (let i = 0; i < data.length; i+= 4) {
                    if (data[3 + i] < 250) {
                        // TODO do something smarter because it thinks some non-transparent pngs are transparent
                        return res(true);
                    }
                }
                return res(false);
            });
    });
}

w.resize = (blob, width, height, sizeLimit /* optional */, forcePng /* optional */) =>
            resizeImage(blob, width, height, sizeLimit || 0, 0, forcePng || false);

w.compress = (blob, sizeLimit /* optional */, quality /* optional */, forcePng /* optional */) =>
            resizeImage(blob, 0, 0, quality || 0, sizeLimit || 0, forcePng || false);

/**
 * Take the flattened image and the same image with transparency any size and map it over the
 * flatten image to get it with transparency
 * @param blob: a blob that is the flatten image
 * @param mask: a mask with transparency of the blob with any resize
 */
w.applyAlphaMask = (blob, mask) => Promise.all([ loadImage(blob), loadImage(mask) ])
        // First step is to draw the mask onto the canvas (or resize it to canvas)
        // Second step is to merge the mask and image together to apply the transparency
        .then(images => {
            let main = images[0];
            let mask = images[1];
            let canvas = document.createElement('canvas');
            canvas.width = main.width;
            canvas.height = main.height;
            if (mask.height != main.height || mask.width != main.width) {
                // Mask is different size, resize it to canvas
                return Pica.resize(mask, canvas, { alpha: true } )
                    .then(() => {
                        return { main: main, mask: mask, canvas: canvas };
                    });
            }

            // No need to resize, just draw the mask onto the canvas
            let context = canvas.getContext('2d');
            context.drawImage(mask, 0, 0);
            return { main: main, mask: mask, canvas: canvas };
        }).then(({ main, mask, canvas }) => {
            let context = canvas.getContext('2d');
            context.globalCompositeOperation = "source-in";
            context.drawImage(main, 0, 0);
            return getCanvasBlob(canvas, "image/png");
        });

/**
 * Get the image from url, best to do this when actually seeing the image loaded already on tab.
 * @param src: the src url to get the image blob
 */
w.getImageBlob = (src) => ensureCalled("getImage", { src: src });

w.saveAs = (blob, filename) => ensureCalled("saveAs", { blob: blob, filename: filename }, ["/data/FileSaver.min.js"])

})(window);
