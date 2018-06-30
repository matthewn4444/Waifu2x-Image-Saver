(function(w) {
"use strict"

const APP_NAME = browser.runtime.getManifest().name;
const APP_ICON_URL = browser.extension.getURL("icons/icon96.png");
const NOTIFICATION_TIMEOUT = 18000;         // 15 secs

class Notification {
    constructor(opts) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.title = opts && opts.title || APP_NAME;
        this.subtitle = opts && opts.subtitle;
        this.iconUrl = opts && opts.iconUrl || APP_ICON_URL;
        this.message = opts && opts.message;
        this.requireInteraction = opts && opts.requireInteraction || false;
        this.onClick = opts && opts.onClick ? opts.onClick : null;
        this.__shown = false;
        this.__idleTimer = null;
    }

    show(opts) {
        let changed = false;
        if (opts) {
            if (typeof opts.title !== "undefined") {
                this.title = opts.title;
                changed = true;
            }
            if (typeof opts.iconUrl !== "undefined") {
                this.iconUrl = opts.iconUrl;
                changed = true;
            }
            if (typeof opts.subtitle !== "undefined") {
                this.subtitle = opts.subtitle;
                changed = true;
            }
            if (typeof opts.message !== "undefined") {
                this.message = opts.message;
                changed = true;
            }
            if (typeof opts.requireInteraction !== "undefined") {
                this.requireInteraction = opts.requireInteraction;
                changed = true;
            }
            if (typeof opts.onClick !== "undefined") {
                this.onClick = opts.onClick;
                changed = true;
            }
        }
        if (!this.__shown || changed) {
            return this.__show();
        }
        return Promise.resolve();
    }

    hide() {
        if (this.__shown) {
            this.__shown = false;
            this.__clearTimer();
            return browser.notifications.clear(this.id);
        }
        return Promise.resolve();
    }

    get shown() {
        return this.__shown;
    }

    __show() {
        this.__shown = true;
        this.__clearTimer();
        if (this.requireInteraction) {
            this.__idleTimer = setInterval(this.__show.bind(this), NOTIFICATION_TIMEOUT);
        }
        return browser.notifications.create(this.id, {
            title: this.title + (this.subtitle ? ": " + this.subtitle : ""),
            message: this.message || "",
            iconUrl: this.iconUrl,
            type: "basic",
        });
    }

    __clearTimer() {
        if (this.__idleTimer) {
            clearInterval(this.__idleTimer);
        }
    }
}


const Notifications = {

    map: {},

    create: (opts) => {
        let notification = new Notification(opts || {});
        Notifications.map[notification.id] = notification;
        return notification;
    },

    dismiss: (notification) => {
        if (Notifications.map.hasOwnProperty(notification.id)) {
            delete Notifications.map[id];
            return notification.hide();
        }
        return Promise.resolve();
    },

    dismissAll: () => {
        let promises = [];
        for (let id in Notifications.map) {
            if (map.hasOwnProperty(id)) {
                promises.push(Notifications.map[id].hide());
                delete Notifications.map[id];
            }
        }
        return Promise.all(promises);
    },

    notify: (opts) => {
        opts.requireInteraction = false;
        let notification = new Notification(opts);
        return notification.show();
    }
};

browser.notifications.onClicked.addListener(id => {
    let notification = Notifications.map[id];
    if (notification && notification.__shown) {
        if (notification.onClick) {
            notification.onClick.call(notification);
        }
        notification.hide();
    }
});

w.Notifications = Notifications;

})(window)