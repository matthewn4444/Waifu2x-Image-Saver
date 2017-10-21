const {Cu, Ci, Cc} = require("chrome");
Cu.import("resource://gre/modules/Downloads.jsm");
Cu.import("resource://gre/modules/osfile.jsm");
const urlUtils = require("sdk/url");
const fileIO = require("sdk/io/file");
const Waifu2xBooru = require("./waifu2x-booru");
const imageUtils = require("./image-utils");
const utils = require("./utils");
const { ImageBinary } = require("./image-binary");

// This holds all the domains in a set to determine if it skips url and moves to upload upscaling
const sDomainUploadOnlySet = new Set();

function WaifuImage(tab, src, imageWidth, imageHeight, filename, compress) {     // TODO choose server based on which is working, also allow force upload mode
    let pathname = urlUtils.URL(src).pathname;
    let sourceExt = pathname.substring(pathname.lastIndexOf(".") + 1);

    this.tab = tab;
    this.src = src;
    this.width = imageWidth;
    this.height = imageHeight;
    this.cancelled = false;

    this.__request = null;
    this.__binaryData = null;
    this.__isPng = pathname.endsWith(".png");
    this.__tmpFile = OS.Path.join(OS.Constants.Path.tmpDir, filename + "." + sourceExt);
    this.__canUpscaleAgain = imageWidth * imageHeight > 1280 * 720;       // TODO preferences
    this.__destinationPath = null;
    this.__completeCallback = null;
    this.__changeDstCallback = null;

    // Options
    this.__compress = compress || false;
}

WaifuImage.prototype.upscale = function(opts) {
    this.__destinationPath = opts.target;
    this.__completeCallback = opts.onComplete;
    this.__changeDstCallback = opts.onDestinationChange;

    this.cancelled = false;
    if (Waifu2xBooru.isLargeEnough(this.width, this.height)) {
        console.log("Image is large enough, just download it");
        this.__canUpscaleAgain = false;
        this.__finish();
    } else if (this.__isPng) {
        // At the beginning we need to check if image is transparent or not
        console.log("This is a png, download and find transparency first");
        this.__resizeAndUpscale();
    } else {
        this.__waifu2xUpscale();
    }
}

WaifuImage.prototype.cancel = function() {
    console.log("Waifu2x operation has been cancelled");
    this.cancelled = true;
    if (this.__request) {
        this.__request.cancel();
    }
    this.__finish();
}

WaifuImage.prototype.__download = function(src, dest, callback) {
    console.log("Download the image", src, dest);
    try {
        Downloads.fetch(src, dest, { isPrivate: utils.isPrivateBrowsing() }).then(function() {
            utils.getFileSize(dest, function(size) {
                if (size < 500) {
                    // Get the image through the webpage
                    console.log("Image cannot be downloaded, get it from the webpage", this.tab);
                    imageUtils.downloadImageFromTab(this.tab, src, Waifu2xBooru.MAX_SIZE, callback);
                } else {
                    // Do not need to check transparency, the callback will do it
                    ImageBinary.open(dest, function(imageData) {
                        callback(null, imageData);
                    });
                }
            }.bind(this))
        }.bind(this));
    } catch (e) {
        callback(e);
    }
}

WaifuImage.prototype.__resizeAndUpscale = function(e) {
    if (!this.__binaryData) {
        // No data yet to upscale, download the image first
        this.__download(this.src, this.__tmpFile, function(e, data) {
            if (e) return this.__finish(e);
            this.__binaryData = data;

            // Check the transparency of the png image
            console.log("Download completed, find the transparency");
            if (!this.__binaryData.isTransparencyCalculated()) {
                imageUtils.checkTransparency(this.__tmpFile, function(e, transparencyMode) {
                    if (e) return this.__finish(e);

                    this.__binaryData.transparency = transparencyMode;
                    console.log("   Downloaded image is transparent?", this.__binaryData.isTransparent());

                    // If transparent, we need to change the extension back to png if not already
                    if (this.__binaryData.isTransparent() && !this.__destinationPath.endsWith(".png")) {
                        this.__destinationPath = this.__destinationPath.substring(0, this.__destinationPath.lastIndexOf(".")) +  ".png";
                        console.log("   The image is transparent and destination name isnt, change it: ", this.__destinationPath);
                        this.__changeDstCallback.call(this, this.__destinationPath, this.__resizeAndUpscale.bind(this));
                    } else {
                        this.__resizeAndUpscale();
                    }
                }.bind(this));
            } else {
                this.__resizeAndUpscale();
            }
        }.bind(this));
    } else {
        // Check if transparent and too large to resize
        if (this.__binaryData.isTransparent() && this.__binaryData.length > Waifu2xBooru.MAX_SIZE * 2) {
            console.log("Transparent too large", this.__binaryData.length  + " vs " + Waifu2xBooru.MAX_SIZE * 2);
            this.__canUpscaleAgain = false;
            return this.__finish();
        }

        // Check to see if we need to resize the image
        if (Waifu2xBooru.needsResize(this.width, this.height)) {
            var newSize = Waifu2xBooru.shrinkWithMaxSize(this.width, this.height);
            if (newSize.width < this.width) {
                console.log("Resize image to ", newSize.width, newSize.height);
                return imageUtils.resize(this.__binaryData, newSize.width,
                        newSize.height, Waifu2xBooru.MAX_SIZE, this.__afterResizeCompress.bind(this));
            }
        }

        // Check to see if we need to compress the image to jpg or shink it
        let size = this.__binaryData.length;
        if (size > Waifu2xBooru.MAX_SIZE) {
            // Image is too large, compress it
            console.log("Compress image " + size + " vs " + Waifu2xBooru.MAX_SIZE);
            imageUtils.compress(this.__binaryData, Waifu2xBooru.MAX_SIZE,
                    Waifu2xBooru.MAX_SIDE, this.__afterResizeCompress.bind(this));
        } else {
            // Image is fine, time to upscale
            console.log("Image does not need resize nor upscale, time to upscale");
            this.__waifu2xUpscale();
        }
    }
}

WaifuImage.prototype.__afterResizeCompress = function(e, data, w, h) {
    console.log("Resize/compress finished");
    if (e) return this.__finish(e);

    if (!data) {
        if (w > 0 && h > 0) {
            console.log("Width/Height arguments for resize/compress are wrong, corrected");
            this.width = w;
            this.height = h;
            this.__resizeAndUpscale();
        } else {
            console.log("This is as large the image will get, just return");
            this.__canUpscaleAgain = false;
            this.__finish();
        }
    } else {
        this.width = w;
        this.height = h;
        this.__binaryData = data;
        this.__waifu2xUpscale();
    }
}

WaifuImage.prototype.__finish = function(e) {
    // Allow the image to be upscaled again if allowed and valid TODO
    if (e == null && this.__canUpscaleAgain) {         // TODO add prefernces
        console.log("Upscale again!");
        this.__waifu2xUpscale();
        return;
    }

    // TODO resize image to jpeg if requests to save space

    // Remove any temporary images
    if (fileIO.exists(this.__tmpFile)) {
        fileIO.remove(this.__tmpFile);
    }
    if (this.__completeCallback) {
        this.__completeCallback.call(this, e, function() {
            if (!e) {
                // Save the image
                if (this.__binaryData) {
                    console.log("Saving image to...", this.__destinationPath)
                    this.__binaryData.save(this.__destinationPath, function(e) {
                        if (e) return console.log("Cannot save image, failure", e);
                        this.__binaryData = null;
                        console.log("Finished saving image");
                    }.bind(this));
                }
            }
        }.bind(this));
        this.__completeCallback = null;
    }
}

WaifuImage.prototype.__waifu2xUpscale = function() {
    if (this.__request != null) {
        return this.__finish("Error - There is already a request running.");
    }

    if (Waifu2xBooru.needsResize(this.width, this.height) || (this.__binaryData && this.__binaryData.length > Waifu2xBooru.MAX_SIZE)) {
        console.log("Image is too large", Waifu2xBooru.needsResize(this.width, this.height), (this.__binaryData && this.__binaryData.length > Waifu2xBooru.MAX_SIZE));
        this.__resizeAndUpscale();
        return;
    }
    // TODO add the local server support

    // If we upscale, see if it is large enough
    console.log("Check upscale", this.width, this.height);
    this.__canUpscaleAgain = this.__canUpscaleAgain && !Waifu2xBooru.isLargeEnough(this.width * 2, this.height * 2);


    if (this.__binaryData) {
        // Only save as png if it has transparency or if we cannot resize as a png with compression off
        let requestPng = this.__binaryData.isTransparent()
             || !this.__canUpscaleAgain && this.__isPng && !this.__compress
            // || this.__canUpscaleAgain && this.__isPng;      // TODO make a pref; if we want to always upscale with png, uses more bandwidth slower, can have more benefit to picture?

        // With data, upload it and upscale
        console.log("Upscale by uploading the image");
        this.__request = new Waifu2xBooru.Request(Waifu2xBooru.SCALE_2);
        this.__request.upscaleByUpload(this.__binaryData, requestPng, function(e, data, savedAsPng) {
            this.__request = null;
            if (e) {
                // Failed to upload the image, maybe try again????
                this.__finish(e);
            } else {
                data.transparency = this.__binaryData.transparency;

                // If requestPng but returns as jpg, then use the map to add back the opacity
                if (requestPng && !savedAsPng) {
                    console.log("Received jpeg back, need to add the alpha back to the image");
                    imageUtils.addAlphaChannelToJpg(this.tab, data /* jpg image */, this.__binaryData /* mask */, function(e, data) {
                        if (e) return this.__finish(e);
                        this.__postUpscale(data);
                    }.bind(this));
                } else {
                    this.__postUpscale(data);
                }
            }
        }.bind(this));
    } else {
        // No data, pass the url and try to upscale. Used only first time for non-png images
        const url = urlUtils.URL(this.src);
        const baseUrl = url.scheme + "://" + url.host;

        // If the domain is black listed from using this because of previous failure
        // then go and download the image and upload
        if (sDomainUploadOnlySet.has(baseUrl)) {
            this.__resizeAndUpscale();
        } else {
            console.log("Upscale by url");
            this.__request = new Waifu2xBooru.Request(Waifu2xBooru.SCALE_2);
            this.__request.upscaleFromUrl(this.src, false /* requestPng */, function(e, data) {
                this.__request = null;
                if (e) {
                    // Failed upscale from url, next download it and upscale by upload
                    console.log("Error in upscaling image using url pass, blacklist domain");
                    sDomainUploadOnlySet.add(baseUrl);
                    this.__resizeAndUpscale();
                } else {
                    this.__postUpscale(data);
                }
            }.bind(this));
        }
    }
}

WaifuImage.prototype.__postUpscale = function(data) {
    console.log("Upscale successful");
    this.__binaryData = data;
    this.width *= 2;
    this.height *= 2;
    this.__finish();
}

exports.WaifuImage = WaifuImage;