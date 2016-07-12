var queue = require('./lib/queue')
  , _ = require('lodash');


module.exports = function(robot) {
  robot.brain.on('loaded', function() {
    robot.brain.deploy = robot.brain.deploy || {};
    queue.init(robot.brain.deploy);
  });

  robot.respond(/deploy help/i, help);
  robot.respond(/deploy (add)(.*)?/i, queueUser);
  robot.respond(/deploy (done|complete|donzo)/i, dequeueUser);
  robot.respond(/deploy (current|who\'s (deploying|at bat))/i, whosDeploying);
  robot.respond(/deploy (next|who\'s (next|on first|on deck))/i, whosNext);
  robot.respond(/deploy (remove|kick) (.*)/i, removeUser);
  robot.respond(/deploy (list)/i, listQueue);
  robot.respond(/deploy (dump|debug)/i, queueDump);

  robot.respond(/deploy ping/i, function(res) {
    res.send('deploy pong');
    res.reply('deploy reply pong');
  });

  /**
   * Help stuff
   * @param res
   */
  function help(res) {
    res.send(
      '`deploy add _metadata_`: Add yourself to the deploy queue. Hubot give you a heads up when it\'s your turn. Anything after `add` will be included in messages about what you\'re deploying, if you\'re into that sort of thing. Something like `hubot deploy add my_api`.\n' +
      '`deploy done`: Say this when you\'re done and then Hubot will tell the next person. Or you could say `deploy complete` or `deploy donzo`.\n' +
      '`deploy remove _user_`: Removes a user completely from the queue. Use `remove me` to remove yourself. As my Uncle Ben said, with great power comes great responsibility. Expect angry messages if this isn\'t you remove someone else who isn\'t expecting it. Also works with `deploy kick _user_`.\n' +
      '`deploy current`: Tells you who\'s currently deploying. Also works with `deploy who\'s deploying` and `deploy who\'s at bat`.\n' +
      '`deploy next`: Sneak peek at the next person in line. Do this if the anticipation is killing you. Also works with `deploy who\'s next` and `deploy who\'s on first`.\n' +
      '`deploy list`: Lists the queue. Use wisely, it\'s going to ping everyone :)\n' +
      '`deploy debug`: Kinda like `deploy list`, but for nerds.\n' +
      '`deploy help`: This thing.'
    );
  }

  /**
   * Add a user to the queue
   * @param res
   */
  function queueUser(res) {
    var user = res.message.user.name
      , length = queue.length()
      , metadata = (res.match[2] || '').trim();

    if (queue.contains({name: user})) {
      res.reply('¡Espera! Ya estás en la cola. Dale chance a los demás, ¿Sí?');
      return;
    }

    queue.push({name: user, metadata: metadata});

    if (length === 0) {
      res.reply('¡Despliega!');
      return;
    }

    if (length === 1) {
      res.reply('Perfecto, vienes despues');
      return;
    }

    res.reply('Bien, hay ' + (length - 1) + ' personas delante de ti. Yo te aviso cuando sea tu turno.');
  }

  /**
   * Removes a user from the queue if they exist and notifies the next user
   * @param res
   */
  function dequeueUser(res) {
    var user = res.message.user.name;

    if (!queue.contains({name: user})) {
      res.reply('¡Tu no estás en la cola! :grimacing:');
      return;
    }

    if (!queue.isCurrent({name: user})) {
      res.reply('Aún no es tu turno :cry:');
      return;
    }

    queue.advance();
    res.reply('¡Buen trabajo! :tada:');

    if (!queue.isEmpty()) {
      // Send DM to next in line if the queue isn't empty
      notifyUser(queue.current());
    }
  }

  /**
   * Who's deploying now?
   * @param res
   */
  function whosDeploying(res) {
    var name = res.message.user.name
      , user = {name: name};

    if (queue.isEmpty()) {
      res.send('¡Nadie!');
    } else if (queue.isCurrent(user)) {
      res.reply('Eres tu. Tu estás desplegando. Ahora.');
    } else {
      var current = queue.current()
        , message = current.name + ' está desplegando';

      message += current.metadata ? ' ' + current.metadata : '.';
      res.send(message);
    }
  }

  /**
   * Who's up next?
   * @param res
   */
  function whosNext(res) {
    var user = res.message.user.name
      , next = queue.next();

    if (!next) {
      res.send('¡Nadie!');
    } else if (queue.isNext({name: user})) {
      res.reply('¡Ya vienes tu! Preparate!');
    } else {
      res.send(queue.next().name + ' is on deck.');
    }
  }

  /**
   * Removes all references to a user from the queue
   * @param res
   */
  function removeUser(res) {
    var name = res.match[2]
      , user = {name: name}
      , isCurrent = queue.isCurrent(user)
      , notifyNextUser = isCurrent && queue.length() > 1;

    if (name === 'me') {
      removeMe(res);
      return;
    }

    if (!queue.contains(user)) {
      res.send(name + ' no está en la lista :)');
      return;
    }

    queue.remove(user);
    res.send(name + ' ha sido eliminado de la lista.');

    if (notifyNextUser) {
      notifyUser(queue.current());
    }
  }

  /**
   * Removes the current user from the queue IF the user is not at the head.
   * @param res
   */
  function removeMe(res) {
    var name = res.message.user.name
      , user = {name: name};

    if (!queue.contains(user)) {
      res.reply('Ni siquiera estabas en la lista :)');
    } else if (queue.isCurrent(user)) {
      res.reply('¡Estás desplegando ahora! ¿No querrás decir `deploy done`?');
      return;
    }

    queue.remove(user);
    res.reply('Perfecto, ya te saqué de la lista. ¡Vuelve pronto!');
  }

  /**
   * Prints a list of users in the queue
   * @param res
   */
  function listQueue(res) {
    if (queue.isEmpty()) {
      res.send('Nobodyz! Like this: []');
    } else {
      if (_.pluck(queue.get(), 'metadata') != ''){
        res.send('Aquí está la lista: \n ' + _.pluck(queue.get(), 'name') + ' con ' + _.pluck(queue.get(), 'metadata').join('\n'));
      } else {
        res.send('Aquí está la lista: \n' + _.pluck(queue.get(), 'name').join(', ') + '.');
      }
    }
  }

  /**
   * Dumps the queue to the channel for debugging
   * @param res
   */
  function queueDump(res) {
    res.send(JSON.stringify(queue.get(), null, 2));
  }

  /**
   * Notify a user via DM that it's their turn
   * @param user
   */
  function notifyUser(user) {
    robot.messageRoom(user.name, '¡Hey, te toca desplegar! Recuerda hacer merge con develop antes de desplegar y avisar en #test_alanna :)');
  }
};

