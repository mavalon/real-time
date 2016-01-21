'use strict';

let env = {
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        options: {
            auth_pass: process.env.REDIS_PASSWORD || null // enable as needed
        },
        db: 1 // selected Redis database
    }
};

module.exports = env;
