const sUpscaleQueue = {};
const sFinishedQueue = [];
const MISSING_TAB_PERMISSION_MSG = "Missing host permission for the tab";

const sFinishedNotification = Notifications.create({
    requireInteraction: true,
    message: "Saving this image.\nClick this notification to dismiss and continue to save the remaining images.",
    onClick: function() {
        if (!sCurrentProcessSaving) {
            return console.error("Clicked a notification that wasn't reported?");
        }
        sCurrentProcessSaving = null;
        saveNextFinishedImage();
    }
});
const sErrorNotification = Notifications.create();
let sCurrentProcessSaving = null;
let sQueuedCount = 0;

browser.contextMenus.create({
    id: "waifu2x-right-click",
    title: "Waifu2x this image",
    contexts: ["image"]
});

function saveNextFinishedImage() {
    if (sFinishedQueue.length && !sCurrentProcessSaving) {
        let process = sFinishedQueue[0];
        return process.image.saveAs()
            .then(() => {
                sCurrentProcessSaving = process;
                sFinishedQueue.shift();
                sFinishedNotification.show({
                    iconUrl: URL.createObjectURL(process.thumbnail),
                    subtitle: getSubtitle()
                });
            })
            .catch(e => {
                if (e.message == MISSING_TAB_PERMISSION_MSG) {
                    // Tab has no permissions, cannot save, wait for tab change and try again
                    console.warn("Current tab has no permissions, save when tab switch occurs.");
                } else {
                    throw e;
                }
            });
    }
    return Promise.resolve();
}

function getSubtitle() {
    return "Save Remaining: " + sFinishedQueue.length + " | Queued: " + sQueuedCount;
}

function updateNotificationSubtitle() {
    if (sFinishedNotification.shown) {
        sFinishedNotification.show({ subtitle: getSubtitle() });
    }
}

function saveAndUpscaleImage(src) {
    // Check if already running
    if (sUpscaleQueue.hasOwnProperty(src)) {
        let thumbnail = sUpscaleQueue[src].thumbnail;
        return Notifications.notify({
            message: "You are already downloading this image",
            iconUrl: thumbnail ? URL.createObjectURL(thumbnail) : null
        });
    } else if (sCurrentProcessSaving && sCurrentProcessSaving.image.src == src) {
        let thumbnail = sCurrentProcessSaving.thumbnail;
        return Notifications.notify({
            message: "You are about to save this image",
            iconUrl: thumbnail ? URL.createObjectURL(thumbnail) : null
        });
    } else {
        for (let i = 0; i < sFinishedQueue.length; i++) {
            if (sFinishedQueue[i].image.src == src) {
                let thumbnail = sFinishedQueue[i].thumbnail;
                return Notifications.notify({
                    message: "This image finished upscaling and queued to be saved.",
                    iconUrl: thumbnail ? URL.createObjectURL(thumbnail) : null
                });
            }
        }
    }

    let process;
    getImageBlob(src)
        .then(ret => {
            if (!ret.data || ret.data.size < 100) {
                throw new Error("Failed to get image data because empty");
            }
            let opts = {
                upscaleAgainThreshold: 1280 * 720,
                // TODO from prefs
            };
            process = new ImageProcess(ret.data, ret.width, ret.height, ret.src, opts);
            sUpscaleQueue[src] = process;
            sQueuedCount++;
            updateNotificationSubtitle();
            return process.start()
                .then(() => {
                    // Move the upscale process to finished list
                    delete sUpscaleQueue[src];
                    sQueuedCount--;
                    sFinishedQueue.push(process);

                    // Update the notification if there is already a saving nofitication
                    if (sCurrentProcessSaving) {
                        updateNotificationSubtitle();
                    }
                })
                .then(saveNextFinishedImage)
        })
        .catch(e => {
            console.error("Error:", e.message);
            let opts = { message: e.message, iconUrl: null };
            if (process && process.thumbnail) {
                opts.iconUrl = URL.createObjectURL(process.thumbnail);
            }
            sErrorNotification.show(opts);

            // Remove and update the count from an error
            delete sUpscaleQueue[src];
            sQueuedCount = 0;
            for (let src in sUpscaleQueue) {
                if (sUpscaleQueue.hasOwnProperty(src)) {
                    sQueuedCount++;
                }
            }
            updateNotificationSubtitle();
        });
}

browser.contextMenus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
        case "waifu2x-right-click":
            saveAndUpscaleImage(info.srcUrl);
            break;
    }
});

browser.tabs.onActivated.addListener(activeInfo => saveNextFinishedImage());

browser.tabs.onUpdated.addListener((tabId, changeInfo, tabInfo) => {
    // Detect when url in current tab has changed, then try to save any remaining images
    if (changeInfo.status == "loading" && changeInfo.url) {
        saveNextFinishedImage();
    }
});
