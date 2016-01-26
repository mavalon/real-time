'use strict';

let env = require('../config/env');
let redis = require('redis');
let client = redis.createClient(env.redis.port, env.redis.host, env.redis.options);

var self = module.exports = {

    getNewGuestId(cb) {

        client.incr('LastGuestId', function(err, id) {
            if (err) return cb(-1);
            cb(id);
        });

    },

    createNewRoom(cb) {



    }
}