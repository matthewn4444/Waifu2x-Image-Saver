const Prefs = require('sdk/simple-prefs').prefs;

// List of all preference names
const prefNonCrossDomain = "not-cross-domain-list";

exports.getNonCrossDomainSet = function() {
    var data = Prefs[prefNonCrossDomain];
    var set = new Set();
    if (data) {
        let domains = data.split("|");
        for (let i = 0; i < domains.length; i++) {
            set.add(domains[i]);
        }
    }
    return set;
}

exports.setNonCrossDomainSet = function(set) {
    var domains = [];
    for (let item of set) {
        let domain = item.trim();
        if (domain.length) {
            domains.push(item);
        }
    }
    Prefs[prefNonCrossDomain] = domains.length ? domains.join("|") : null;
}