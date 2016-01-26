var express = require('express');
var router = express.Router();
var redis = require('../server/libs/redis')

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/api/newguestid/?', function(req, res, next) {
    redis.getNewGuestId(function(id) {
        res.send(JSON.stringify({id: id}));
    })
});

module.exports = router;
