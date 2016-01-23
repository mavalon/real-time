module.exports = function(redis) {};

module.exports.de = function(addUser, user) {

    if (!addUser) return cb(null, false);
    const key = `game:${user.number}:user:${user.id}`;
    const args = ["name", user.name, "color", user.color, "percent", user.percent, "rank", user.rank];

    redis.hmset(key, args, function(err, res) {
        if (err) return cb(err, false);
        cb(null, true);
    });
}