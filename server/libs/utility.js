'use strict';

module.exports = {
    makeKey: makeKey
};

// joins string arguments together with :
function makeKey() {
    var args = Array.prototype.slice.call(arguments);
    return args.join(':');
}