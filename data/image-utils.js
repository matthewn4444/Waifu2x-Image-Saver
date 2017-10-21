(function() {
'use strict'

/**
 * Calculates the size approximately for the dataURL image
 * @param  {[string]}           dataURL     image
 * @return {[int]}              size of     image in bytes
 */
function getImageSizeFromDataUrl(dataURL) {
    const head = "base64,";
    var index = dataURL.indexOf(head);
    if (index == -1) {
        throw new Error("Cannot get size of dataURL because it does not have the correct header");
    }
    index += head.length;
    return Math.round((dataURL.length - index) * 3 / 4);
}

/**
 * Load an image into memory
 * @param  {[string]}           data     dataurl or url source to load the image
 * @param  {Function}           callback when image has loaded, this is called
 */
function loadImage(data, callback) {
    var image = new Image();
    image.onload = function() {
        callback(null, image);
    }
    image.onerror = function(e) {
        callback(e);
    }
    image.src = data;
}

/**
 * Loads all the images in parallel and calls the callback when all images are loaded.
 * The Image object is the same indexes as the past in source array
 * @param  {[string array]}     srcArr      image sources (can be dataurl or url)
 * @param  {Function}           callback    when all images are loaded, this is called
 */
function loadManyImages(srcArr, callback) {
    var error = false;
    var imgs = new Array(srcArr.length);
    var finished = 0;
    if (!srcArr.length) return callback(null, []);

    for (var i = 0; i < srcArr.length; i++) {
        if (error) return;
        loadImage(srcArr[i], function(e, image) {
            if (error) return;
            if (e) {
                error = true;
                return callback(e);
            }
            imgs[this] = image;
            finished++;
            if (finished >= srcArr.length) {
                callback(null, imgs);
            }
        }.bind(i));
    }
}

/**
 * Recursive function to take an image inside a canvas and resize it within the sizelimit provided. This
 * uses binary search to find the highest image size with the limit of the sizeLimit. Original canvas is
 * passed into each iteration so no loss in data is found.
 * @param  {[canvas]}           inputCanvas   original image should be loaded in this canvas already
 * @param  {[canvas]}           tempCanvas    canvas to do work on, nothing important should be on this
 * @param  {[float]}            highFraction  upper bound  quality (0-1)
 * @param  {[float]}            lowFraction   lower bound quality (0-1)
 * @param  {[int]}              sizeLimit     the upper limited largest size of the bytes
 * @param  {Function}           callback      calls when routine is finished or error is found
 */
function rGetDataURLToFitSize(inputCanvas, tempCanvas, highFraction, lowFraction, sizeLimit, callback) {
    let fraction = (highFraction - lowFraction) / 2 + lowFraction;
    let newWidth = Math.floor(inputCanvas.width * fraction);
    let newHeight = Math.floor(inputCanvas.height * fraction);
    console.log("rGetDataURLToFitSize", highFraction, lowFraction, fraction, newWidth, newHeight);

    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;

    pica.resizeCanvas(inputCanvas, tempCanvas, {quality: 3, alpha: true}, function(e) {
        try {
            let dataurl = tempCanvas.toDataURL();
            let size = getImageSizeFromDataUrl(dataurl);
            if (size < sizeLimit) {
                if (highFraction - fraction < 0.01) {
                    console.log("   Finished", highFraction, fraction);
                    return callback(size < sizeLimit ? dataurl : null, tempCanvas.width, tempCanvas.height);
                }
                rGetDataURLToFitSize(inputCanvas, tempCanvas, highFraction, fraction, sizeLimit, callback);
            } else {
                if (fraction - lowFraction < 0.01) {
                    return callback(size < sizeLimit ? dataurl : null, tempCanvas.width, tempCanvas.height);
                }
                rGetDataURLToFitSize(inputCanvas, tempCanvas, fraction, lowFraction, sizeLimit, callback);
            }
        } catch(e) {
            callback(e);
        }
    });
}

function getDataURLFromCanvas(canvas, sizeLimit, isTransparent, forceJpeg, jpegQuality, callback) {
    // Determine the quality for the limited size for uploading
    if (!forceJpeg || isTransparent) {
        console.log("Try getting the dataURL as PNG");
        try {
            let pngDataURL = canvas.toDataURL();
            // Check to see if the png is within the size of the sizeLimit
            if (sizeLimit <= 0 || getImageSizeFromDataUrl(pngDataURL) < sizeLimit) {
                return callback(null, pngDataURL, canvas.width, canvas.height);
            }

            // Too large but need png because of transparency, so recursively downsize the image
            // until size is valid with binary search
            if (isTransparent) {
                let tempCanvas = document.createElement("canvas");
                rGetDataURLToFitSize(canvas, tempCanvas, 1, 0.7, sizeLimit, function(data, w, h) {
                    callback(null, data, w, h);
                });
                return;
            }
        } catch(e) {
            return callback(e);
        }
    }

    console.log("Try getting the dataURL as JPEG");
    try {
        // Loop down step 0.1 for image quality till the size is smaller than the limit
        for (let q = jpegQuality; q >= 0.1; q -= 0.1) {
            let dataURL = canvas.toDataURL('image/jpeg', q);
            if (sizeLimit <= 0 || getImageSizeFromDataUrl(dataURL) < sizeLimit) {
                // Good size with certain quality of jpeg
                console.log("   Used jpg with quality of " + (q * 100) + "%");
                return callback(null, dataURL, canvas.width, canvas.height);
            }
        }
    } catch(e) {
        return callback(e);
    }

    // Error state
    callback("Cannot compress png nor jpg");
}

/**
 * Checks to see if the image loaded in the canvas is transparent
 * @param  {[canvas]}   canvas              image loaded canvas
 */
function isCanvasTransparent(canvas) {
    var now = Date.now();
    // Get the data inside the image, ignore the outer layer as it could be falsely transparent
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext('2d');
    const data = context.getImageData(1, 1, width - 2, height - 2).data;
    let isTransparent = false;

    for (let i = 0; i < data.length; i+= 4) {
        if (data[3 + i] < 250) {
            // TODO do something smarter because it thinks some non-transparent pngs are transparent
            return true;
        }
    }
    return false;
}

/**
 * Send back the response to the lib side with a label. This automatically finds the best dataurl to
 * send back based on the arguments.
 * @param  {[string]}       label           Event label
 * @param  {[error]}        e               Any passed in error if possible
 * @param  {[canvas]}       c               Input canvas with image in it
 * @param  {[int]}          sizeLimit       Size limit of the max image return
 * @param  {Boolean}        isTransparent   Is the image in canvas transparent
 * @param  {[boolean]}      forceJpeg       Only return jpeg dataurl
 * @param  {[float]}        jpegQuality     Can specify a specific jpeg quality to return
 */
function emitResult(label, e, c, sizeLimit, isTransparent, forceJpeg, jpegQuality) {
    if (e) {
        self.port.emit("resize", { error: e });
    } else {
        getDataURLFromCanvas(c, sizeLimit, isTransparent, forceJpeg, jpegQuality, function(e, data, w, h) {
            if (e) {
                self.port.emit(label, { error: e });
            } else if (data) {
                self.port.emit(label, { data: data, transparency: isTransparent, width: w, height: h });
            } else {
                self.port.emit(label, { error: "Image cannot be resized/compressed since image is too large even with compression" });              // https://www.pixiv.net/member_illust.php?mode=medium&illust_id=61803573
            }
        });
    }
}

/**
 * Ask this function to see if the image has transparency
 * @param  {[string]}       data            DataURL to see if there transparency
 */
self.port.on("transparency", function(data) {
    var canvas = document.createElement('canvas');
    loadImage(data, function(e, image) {
        try {
            if (e) {
                return self.port.emit("transparency", { error: e });
            }
            let context = canvas.getContext('2d');
            if (data.startsWith("data:image/png")) {
                canvas.width = image.width;
                canvas.height = image.height;
                context.drawImage(image, 0, 0);
                self.port.emit("transparency", { data: isCanvasTransparent(canvas) });
            } else {
                // Not transparent, no error
                self.port.emit("transparency", { data: false });
            }
        } catch (e) {
            console.log("Error in finding transparency", e);
            self.port.emit("transparency", { error: e });
        }
    });
});

/**
 * Resize an image
 * @param  {[object]}       opt             object with keys and values needed to resize an image
 *                                          {
 *                                              data:           {string},   // Image dataURL/src
 *                                              width:          {int},      // Width of resultant image
 *                                              height:         {int},      // Height of resultant image
 *                                              sizeLimit:      {int},      // Max size of data
 *                                              maxSize:        {int}.      // Max dimension of a side
 *                                              isTransparent:  {Boolean},  // Is image transparent
 *                                              forceJpeg:      {Boolean},  // Optional
 *                                              jpegQuality:    {float}     // Optional
 *                                          }
 */
self.port.on("resize", function(opt) {
    let data = opt.data;
    let width = opt.width || 0;
    let height = opt.height || 0;
    let sizeLimit = opt.sizeLimit || 0;
    let maxSide = opt.maxSide || 0;
    let isTransparent = opt.isTransparent;
    let forceJpeg = opt.jpg || false;
    let jpegQuality = Math.max(Math.min(1, (opt.quality || 1)), 0);

    loadImage(data, function(e, image) {
        let canvas = document.createElement('canvas');
        try {
            if (e) {
                return self.port.emit("resize", { error: e });
            }
            if (width && height) {
                console.log("Resize the image to [" + width + "x" + height + "]");
                canvas.width = width;
                canvas.height = height;
                pica.resizeCanvas(image, canvas, {quality: 3, alpha: isTransparent}, function(e) {
                    emitResult("resize", e, canvas, sizeLimit, isTransparent, forceJpeg, jpegQuality);
                });
            } else {
                console.log("Compress the image");
                canvas.width = image.width;
                canvas.height = image.height;

                // Send error that the compression cannot be done exceeding the max side
                if (maxSide != 0 && Math.max(image.width, image.height) > maxSide) {
                    console.log("   Return early instead of compress now because too large");
                    return self.port.emit("resize", { data: null, transparency: isTransparent,
                            width: image.width, height: image.height });
                }
                let context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                emitResult("resize", e, canvas, sizeLimit, isTransparent, forceJpeg, jpegQuality);
            }
        } catch (e) {
            console.log("Error in resizing", e);
            return self.port.emit("resize", { error: e });
        }
    });
});

/**
 * Get the image from the context from the html. Puts the image in same context
 * into the canvas and gets the data from it.
 * @param  {[object]}       opt             object with keys and values needed to resize an image
 *                                          {
 *                                              src:            {string},   // Source of image
 *                                              sizeLimit:      {int},      // Max size of data
 *                                          }
 */
self.port.on("getImage", function(opt) {     // TODO get options for resize later to dataurl
    var src = opt.src;
    var sizeLimit = opt.sizeLimit || 0;

    console.log("Get the image from tab", src);
    var canvas = document.createElement('canvas');
    loadImage(src, function(e, image) {
        if (e) {
            return self.port.emit("getImage", { error: e });
        }
        if (image.width && image.height) {
            let context = canvas.getContext('2d');
            canvas.width = image.width;
            canvas.height = image.height;
            context.drawImage(image, 0, 0);
            let isTransparent = false;
            if (src.endsWith(".png")) {
                isTransparent = isCanvasTransparent(canvas);
            }
            console.log("   Got image, is it transparent?", isTransparent);
            emitResult("getImage", e, canvas, sizeLimit, isTransparent, false, 0);
        } else {
           return self.port.emit("getImage", { error: "no image" });
        }
    });
});

/**
 * Take the flattened image and quarter sized image (before upscale) with transparency
 * and map it over the final image to get it with transparency
 * @param  {[object]}       opt             object with keys and values needed to resize an image
 *                                          {
 *                                              data:           {string},   // DataURL of flattened image
 *                                              mask:           {string},   // DataURL of transparency
 *                                          }
 */
self.port.on("addAlphaChannel", function(opt) {
    let data = opt.data;
    let mask = opt.channel;

    // Load both images at the same time
    loadManyImages([data, mask], function(e, images) {
        if (e) return self.port.emit("addAlphaChannel", { error: e });
        let mainImage = images[0];
        let mask = images[1];
        let canvas = document.createElement('canvas');
        canvas.width = mainImage.width;
        canvas.height = mainImage.height;

        // Double the size of the mask
        pica.resizeCanvas(mask, canvas, {quality: 3, alpha: true}, function(e) {
            if(e) return self.port.emit("addAlphaChannel", { error: e });
            let context = canvas.getContext('2d');
            context.globalCompositeOperation="source-in";
            context.drawImage(mainImage, 0, 0);
            return self.port.emit("addAlphaChannel", { data: canvas.toDataURL() });
        });
    });
});
})();
