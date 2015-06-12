const LABEL = "Save image with Waifu2x";
const ALLOW_WAIFU2X_RECURSION = true;

const {Cu, Ci, Cc} = require("chrome");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");
Cu.import("resource://gre/modules/Task.jsm");

const cm = require("sdk/context-menu");
const notifications = require("sdk/notifications");
const self = require("sdk/self");
const url = require("sdk/url");

const imgUtils = require("./image-utils");
const prefs = require("./prefs");
const utils = require("./utils");
const waifu2x = require("./waifu2x-online");

const MAX_UPLOAD_AREA = 1638400;
const MAX_ACCEPTED_AREA = MAX_UPLOAD_AREA * 4 * 0.8;
const prefNonCrossDomainSet = prefs.getNonCrossDomainSet();

/*============================*\
|*       User Interface       *|
\*============================*/
cm.Item({
    label: LABEL,
    context: cm.SelectorContext("img"),
    contentScript: 'self.on("click", function (node, data) {\
                        var img = new Image();              \
                        img.onload = function() {           \
                            self.postMessage({              \
                                src:    node.src,           \
                                width:  img.width,          \
                                height: img.height,         \
                            });                             \
                        };                                  \
                        img.src = node.src;                 \
                    });',
    onMessage: function(message) {
        // Save jpg to location
        let src = message.src;
        utils.openSaveAsDialogForImages(LABEL, src, function(jpgSavePath, filename, extension) {
            let tmpFile1 = OS.Path.join(OS.Constants.Path.tmpDir, filename + "." + extension);
            let tmpFile2 = OS.Path.join(OS.Constants.Path.tmpDir, filename + ".tmp");

            Task.spawn(function() {
                // Fake a download by downloading original image, then
                // replacing it by the compressed image from before
                let download = yield Downloads.createDownload({
                    source: {
                        url: src,
                        isPrivate: utils.isPrivateBrowsing(),
                        referrer: require("sdk/tabs").activeTab.url
                    },
                    target: jpgSavePath
                });
                let downloadList = yield Downloads.getList(Downloads.ALL);
                downloadList.add(download);

                let area = message.width * message.height;
                if (area > MAX_UPLOAD_AREA) {
                    if (area < MAX_ACCEPTED_AREA) {
                        // Download the image, resize it and then use Waifu2x
                        Downloads.fetch(download.source, tmpFile1).then(function() {
                            resizeAndUploadThenCompressImage(jpgSavePath, tmpFile1, tmpFile2,
                                filename, download, downloadList, message.width, message.height);
                        });
                    } else {
                        // Image is too large, just download normally
                        download.start();
                    }
                } else {
                    let host = url.URL(src).host;
                    if (prefNonCrossDomainSet.has(host)) {
                        // Download the image first and then upload
                        downloadAndUploadThenCompressImage(jpgSavePath, tmpFile1, tmpFile2,
                            filename, download, downloadList, message.width, message.height);
                    } else {
                        // Use Waifu2x to scale the image by 2 using url directly
                        waifu2x.upscaleAndSave(src, tmpFile1, function(e) {
                            if (e) {
                                // This image probably needs to be uploaded, try that
                                if (e.toString().indexOf("unsupported image format") != -1) {
                                    downloadAndUploadThenCompressImage(jpgSavePath, tmpFile1, tmpFile2,
                                        filename, download, downloadList, message.width, message.height);
                                } else {
                                    handleFailure(e, filename + ".jpg", download, downloadList);
                                }
                            } else {
                                compressImage(jpgSavePath, tmpFile1, tmpFile2, filename, download,
                                    downloadList, message.width * 2, message.height * 2);
                            }
                        });
                    }
                }
            });
        });
    }
});

/*============================*\
|*      Helper Functions      *|
\*============================*/
function uploadThenCompressImage(jpgSavePath, tmpFile1, tmpFile2, filename, download, downloadList, width, height, callback) {
    waifu2x.uploadAndUpscaleImage(tmpFile1, function(e) {
        if (e) {
            OS.File.remove(tmpFile1);
            handleFailure(e, filename + ".jpg", download, downloadList);
        } else {
            compressImage(jpgSavePath, tmpFile1, tmpFile2, filename,
                download, downloadList, width * 2, height * 2, callback);
        }
    });
}

function resizeAndUploadThenCompressImage(jpgSavePath, tmpFile1, tmpFile2, filename, download, downloadList, width, height, callback) {
    let ratio = width / height;
    let sHeight = Math.floor(Math.sqrt(MAX_UPLOAD_AREA / ratio));
    let sWidth = Math.floor(ratio * sHeight);

    // Resize the image smaller than the max width
    imgUtils.resize(tmpFile1, tmpFile1, sWidth, sHeight);

    // Upload this new image and download it
    uploadThenCompressImage(jpgSavePath, tmpFile1, tmpFile2, filename, download, downloadList, sWidth, sHeight, callback);
}

function downloadAndUploadThenCompressImage(jpgSavePath, tmpFile1, tmpFile2, filename, download, downloadList, width, height) {
    // Download the image to temp folder
    Downloads.fetch(download.source, tmpFile1).then(a => {
        // Upload the image and use Waifu2x to scale
        uploadThenCompressImage(jpgSavePath, tmpFile1, tmpFile2, filename,
                download, downloadList, width, height, function() {
            // Save the host to the non domain list to make it faster
            let host = url.URL(download.source.url).host;
            if (!prefNonCrossDomainSet.has(host)) {
                prefNonCrossDomainSet.add(host);
                prefs.setNonCrossDomainSet(prefNonCrossDomainSet);
            }
        });
    });
}

function notify(text, image) {
    notifications.notify({
        title: "Waifu2x Image Saver",
        text: text,
        iconURL: image != null ? image : self.data.url("/images/icon-64.png")
    });
}

function handleFailure(e, filename, download, downloadList) {
    downloadList.remove(download);
    download.finalize(true);

    let message = e.toString().indexOf("image size exceeds maximum") != -1
        || e.toString().indexOf("Request Entity Too Large") != -1?
        "the image is too big" : "image is not supported";
    notify("Cannot download image: [" + filename + "] " + message, download.source.url);
    console.error(e);
}

function compressImage(dstFile, tmpFile1, tmpFile2, filename, download, downloadList, width, height, callback) {
    var code = imgUtils.compress(tmpFile1, tmpFile2);
    // Delete the larger downloaded image
    OS.File.remove(tmpFile1);
    if (code == 0) {
        let area = width * height;
        // Detect size to allow upsize recursion
        if (ALLOW_WAIFU2X_RECURSION && area < MAX_ACCEPTED_AREA) {
            // Detect whether to resize or not
            if (area > MAX_UPLOAD_AREA) {
                resizeAndUploadThenCompressImage(dstFile, tmpFile2, tmpFile1, filename, download, downloadList, width, height, callback);
            } else {
                uploadThenCompressImage(dstFile, tmpFile2, tmpFile1, filename, download, downloadList, width, height, callback);
            }
        } else {
            // Finished recursion
            download.start();
            if (callback) {
                callback();
            }

            // Wait till fake download completes
            download.whenSucceeded().then(a => {
                // Done
                OS.File.move(tmpFile2, dstFile);
            });
        }
    } else {
        notify("Cannot download image: compression failed to run correctly", download.source.url);
        console.error("Image compression and returned code: " + code);
        downloadList.remove(download);
        download.finalize(true);
    }
}
