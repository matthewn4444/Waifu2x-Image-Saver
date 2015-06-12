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
            let data = {
                savePath: jpgSavePath, filename: filename,
                tmp1: tmpFile1, tmp2: tmpFile2,
                width: message.width, height: message.height
            };

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
                data.download = download;
                data.list = downloadList;

                let area = message.width * message.height;
                if (area > MAX_UPLOAD_AREA) {
                    if (area < MAX_ACCEPTED_AREA) {
                        // Download the image, resize it and then use Waifu2x
                        Downloads.fetch(download.source, tmpFile1).then(function() {
                            resizeAndUploadThenCompressImage(data);
                        });
                    } else {
                        // Image is too large, just download normally
                        download.start();
                    }
                } else {
                    let host = url.URL(src).host;
                    if (prefNonCrossDomainSet.has(host)) {
                        // Download the image first and then upload
                        downloadAndUploadThenCompressImage(data);
                    } else {
                        // Use Waifu2x to scale the image by 2 using url directly
                        waifu2x.upscaleAndSave(src, tmpFile1, function(e) {
                            if (e) {
                                // This image probably needs to be uploaded, try that
                                if (e.toString().indexOf("unsupported image format") != -1) {
                                    downloadAndUploadThenCompressImage(data);
                                } else {
                                    handleFailure(e, filename + ".jpg", download, downloadList);
                                }
                            } else {
                                data.width *= 2;
                                data.height *= 2;
                                compressImage(data);
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
function uploadThenCompressImage(data, callback) {
    waifu2x.uploadAndUpscaleImage(data.tmp1, function(e) {
        if (e) {
            OS.File.remove(data.tmp1);
            handleFailure(e, filename + ".jpg", data.download, data.list);
        } else {
            data.width *= 2;
            data.height *= 2;
            compressImage(data, callback);
        }
    });
}

function resizeAndUploadThenCompressImage(data, callback) {
    let ratio = data.width / data.height;
    data.height = Math.floor(Math.sqrt(MAX_UPLOAD_AREA / ratio));
    data.width = Math.floor(ratio * data.height);

    // Resize the image smaller than the max width
    imgUtils.resize(data.tmp1, data.tmp1, data.width, data.height);

    // Upload this new image and download it
    uploadThenCompressImage(data, callback);
}

function downloadAndUploadThenCompressImage(data) {
    // Download the image to temp folder
    Downloads.fetch(data.download.source, data.tmp1).then(a => {
        // Upload the image and use Waifu2x to scale
        uploadThenCompressImage(data, function() {
            // Save the host to the non domain list to make it faster
            let host = url.URL(data.download.source.url).host;
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

function compressImage(data, callback) {
    var code = imgUtils.compress(data.tmp1, data.tmp2);
    // Delete the larger downloaded image
    OS.File.remove(data.tmp1);
    if (code == 0) {
        let area = data.width * data.height;
        // Detect size to allow upsize recursion
        if (ALLOW_WAIFU2X_RECURSION && area < MAX_ACCEPTED_AREA) {
            // Detect whether to resize or not
            let t1 = data.tmp1;
            data.tmp1 = data.tmp2;
            data.tmp2 = t1;
            if (area > MAX_UPLOAD_AREA) {
                resizeAndUploadThenCompressImage(data, callback);
            } else {
                uploadThenCompressImage(data, callback);
            }
        } else {
            // Finished recursion
            data.download.start();
            if (callback) {
                callback();
            }

            // Wait till fake download completes
            data.download.whenSucceeded().then(a => {
                // Done
                OS.File.move(data.tmp2, data.savePath);
            });
        }
    } else {
        notify("Cannot download image: compression failed to run correctly", data.download.source.url);
        console.error("Image compression and returned code: " + code);
        data.list.remove(data.download);
        data.download.finalize(true);
    }
}
