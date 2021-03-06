'use strict';

const _ = require('underscore');
const moment = require('moment');
const BaseController = require('../base');
const models = require('../../models');
const logger = require('../../lib/logger')({
  consoleLabel: 'web',
  tags: ['web']
});

let sequelize = models.sequelize;

class Monitor extends BaseController {

  constructor() {
    super();

    return {
      playerUpdates: {
        method: 'get',
        name: 'api.monitor.updates',
        uri: '/api/v1/:server/monitor/updates',
        handler: this.playerUpdates.bind(this)
      },
      conquers: {
        method: 'get',
        name: 'api.monitor.conquers',
        uri: '/api/v1/:server/monitor/conquers',
        handler: this.conquers.bind(this)
      },
      allianceChanges: {
        method: 'get',
        name: 'api.monitor.allianceChanges',
        uri: '/api/v1/:server/monitor/allianceChanges',
        handler: this.allianceChanges.bind(this)
      }
    };
  }

  playerUpdates(req, res) {
    let server = req.params.server,
        time = req.query.time || null,
        alliances = req.query.alliances || null,
        where = { server: server },
        hoursSince;

    if (!time) {
      return res.send(500, 'Time parameter required.');
    }

    if (time === 0) {
      // default to 4 hours
      time = (new Date() / 1000) - 14400;
    }

    hoursSince = moment().diff(moment.unix(time), "hours");
    if (hoursSince > 4) {
      // default to 4 hours
      time = (new Date() / 1000) - 14400;
    }

    where.time = { $gte: time };
    if (alliances) {
      alliances = _.map(alliances.split(','), id => { return parseInt(id, 10); });
      where.alliance = { $any: alliances };
    }

    // build query
    models.PlayerUpdates.findAll({
      where: where,
      order: 'time DESC',
      attributes: ['id', 'server', 'name', 'alliance', 'abp_delta', 'dbp_delta', 'towns_delta', 'points_delta'],
      include: [{
        model: models.Alliance,
        as: 'Alliance',
        where: sequelize.literal('"PlayerUpdates".alliance = "Alliance".id'),
        attributes: ['id', 'name'],
        required: false
      }]
    })
    .then(updates => {

      // parse updates
      updates = _.chain(updates)
        .map(o => { return o.toJSON(); })
        .filter(o => { return o.abp_delta > 0 || o.dbp_delta > 0; }) // remove 0 bp updates
        .groupBy('alliance')
        .map(oAlly => {
          // group by player id
          oAlly = _.groupBy(oAlly, 'id');
          oAlly = _.map(oAlly, player => {
            let first = _.sample(player);
            
            // In the event the name is stored in the db as 'name', remove quotes (postgres)
            if (first.name.indexOf("'") === 0 && first.name.indexOf("'") === 0) {
              first.name = first.name.slice(1,-1);
            }

            // sum deltas if there are multiple updates
            player = {
              id: first.id,
              server: first.server,
              name: first.name,
              alliance: first.alliance,
              alliance_name: first.Alliance ? first.Alliance.name : "",
              abp_delta: _.reduce(player, (num, o) => { return num + parseInt(o.abp_delta,10); }, 0),
              dbp_delta: _.reduce(player, (num, o) => { return num + parseInt(o.dbp_delta,10); }, 0),
              towns_delta: _.reduce(player, (num, o) => { return num + parseInt(o.towns_delta,10); }, 0),
              points_delta: _.reduce(player, (num, o) => { return num + parseInt(o.points_delta,10); }, 0)
            };

            return player;
          });

          return oAlly;
        })
        .indexBy(o => { return _.sample(o).alliance; }) // index resulting collection by alliance id
        .value();

      return res.send(200, updates);
    })
    .catch(err => {
      logger.error(err);
      return res.send(500, err);
    });
  }

  conquers(req, res) {
    let server = req.params.server,
        time = req.query.time || null,
        alliances = req.query.alliances || null,
        where = { server: server },
        options = {},
        hoursSince;

    if (!time) {
      return res.send(500, 'Time parameter required.');
    }

    if (time === 0) {
      // default to 4 hours
      time = (new Date() / 1000) - 14400;
    }

    hoursSince = moment().diff(moment.unix(time), "hours");
    if (hoursSince > 4) {
      // default to 4 hours
      time = (new Date() / 1000) - 14400;
    }

    where.time = { $gte: time };
    
    if (alliances) {
      alliances = _.map(alliances.split(','), id => { return parseInt(id, 10); });
      where = _.extend(where, {
        $or: [
          { newally: { $in: alliances } },
          { oldally: { $in: alliances } }
        ]
      });
    }
    
    options.query = where;

    models.Conquers.getConquers(options)
    .then(result => {
      let filteredConquers = {},
          conquers = result.rows;

      if (alliances) {
        _.each(alliances, id => {
          let cqArr = _.filter(_.clone(conquers), o => { return o.newally === id || o.oldally === id; });

          cqArr = _.map(cqArr, o => {
            o = _.clone(o);
            o.alliance_name = (parseInt(o.newally,10) === parseInt(id,10)) ? o.newally_name : o.oldally_name;
            return o;
          });
          
          if (!cqArr.length) {
            return;
          }

          filteredConquers[id] = cqArr;
        });
      } else {
        filteredConquers = conquers;
      }

      return res.send(200, filteredConquers);
    })
    .catch(err => {
      logger.error(err);
      return res.send(500, err);
    });
  }

  allianceChanges(req, res) {
    let server = req.params.server,
        time = req.query.time || null,
        alliances = req.query.alliances || null,
        where = { server: server },
        hoursSince;

    if (!time) {
      return res.send(500, 'Time parameter required.');
    }

    if (time === 0) {
      // default to 4 hours
      time = (new Date() / 1000) - 14400;
    }

    hoursSince = moment().diff(moment.unix(time), "hours");
    if (hoursSince > 4) {
      // default to 4 hours
      time = (new Date() / 1000) - 14400;
    }

    where.time = { $gte: time };
    if (alliances) {
      alliances = _.map(alliances.split(','), id => { return parseInt(id, 10); });
      where = _.extend(where, {
        $or: [
          { new_alliance: { $in: alliances } },
          { old_alliance: { $in: alliances } }
        ]
      });
    }

    models.AllianceMemberChanges.findAll({
      where: where
    })
    .then(changes => {
      let filteredChanges = {};

      changes = changes.map(o => { return o.toJSON(); });

      if (alliances) {
        _.each(alliances, id => {
          let chArr = _.filter(_.clone(changes), o => { return o.new_alliance === id || o.old_alliance === id; });

          chArr = _.map(chArr, o => {
            o = _.clone(o);
            o.alliance_name = (parseInt(o.new_alliance,10) === parseInt(id,10)) ? 
              o.new_alliance_name : o.old_alliance_name;
            return o;
          });
          
          if (!chArr.length) {
            return;
          }

          filteredChanges[id] = chArr;
        });
      } else {
        filteredChanges = changes;
      }

      return res.send(200, filteredChanges);
    })
    .catch(err => {
      logger.error(err);
      return res.send(500, err);
    });
  }
}

module.exports = new Monitor();
