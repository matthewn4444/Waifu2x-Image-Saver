const LABEL = "Save image with Waifu2x";

const {Cu, Ci, Cc} = require("chrome");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");
Cu.import("resource://gre/modules/Task.jsm");

const data = require("sdk/self").data;
const cm = require("sdk/context-menu");
const utils = require("./utils");
const waifu2x = require("./waifu2x-online");

cm.Item({
    label: LABEL,
    context: cm.SelectorContext("img"),
    contentScript: 'self.on("click", function (node, data) {\
                      self.postMessage(node.src);           \
                    });',
    onMessage: function(src) {
        // Save jpg to location
        utils.openSaveAsDialogForImages(LABEL, src, function(jpgSavePath, filename, extension) {
            let tmpFile1 = OS.Path.join(OS.Constants.Path.tmpDir, filename + "." + extension);
            let tmpFile2 = OS.Path.join(OS.Constants.Path.tmpDir, filename + ".tmp");

            Task.spawn(function() {
                // Fake a download by downloading original image, then
                // replacing it by the compressed image from before
                let download = yield Downloads.createDownload({
                    source: {url: src, isPrivate: utils.isPrivateBrowsing()}, 
                    target: jpgSavePath 
                });
                let downloadList = yield Downloads.getList(Downloads.ALL);
                downloadList.add(download);

                // Use Waifu2x to scale the image by 2
                waifu2x.upscaleAndSave(src, tmpFile1, function(e) {
                    if (e) {
                        downloadList.remove(download);
                        download.finalize(true);
                        return console.error(e);
                    }

                    // Compress the image
                    utils.compressImage(tmpFile1, tmpFile2, function(code) {
                        // Delete the larger downloaded image
                        OS.File.remove(tmpFile1);
                        if (code == 0) {
                            download.start();

                            // Wait till fake download completes
                            download.whenSucceeded().then(a => {
                                // Done
                                OS.File.move(tmpFile2, jpgSavePath);
                            });
                        } else {
                            console.error("Image compression and returned code: " + code);
                            downloadList.remove(download);
                            download.finalize(true);
                        }
                    });
                });
            });
        });
    }
});
