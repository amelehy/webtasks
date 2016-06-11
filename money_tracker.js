/* 
A webtask for keeping track of what people owe eachother. 
Params:
&rw=read|write
&payer=string
&payee=string
&value=integer
*/
"use strict"
let redis = require('redis');

module.exports = function(ctx, done){
  /*
  1. connect to redis server
  2. parse query params from url 
  3. perform appropriate read/write action
  */
  let client = connectToRedisServer(function(){
    parseQueryString(
      /* read callback */
      function(payer, payee){
        read(payer, payee)
      }, 
      /* write callback */
      function(payer, payee, value){
        write(payer, payee, value);
      }
    );
  });
  /* connect to redis server */
  function connectToRedisServer(callback){
    let client = redis.createClient(
      12983,
      ctx.data.REDIS_ENDPOINT,
      {no_ready_check: true}
    );
    /* set password */
    client.auth(ctx.data.REDIS_PASSWORD, function(err){
      if (err){
        console.log(err);
        finish(err);
      }
    });
    /* connected to redis */
    client.on('connect', function() {
      console.log('Connected to Redis');
      callback();
    });
    /* disconnected from redis */
    client.on('end', function(){
      console.log('Redis connection closed');
    });
    return client;
  }
  /* reading or writing data? */
  function parseQueryString(readCallback, writeCallback){
    let rw = (ctx.data.rw) ? ctx.data.rw.toLowerCase() : finish("No 'rw' parameter passed");
    let payer = (ctx.data.payer) ? ctx.data.payer.split('&').join('').toLowerCase() : finish("No 'payer' parameter passed");
    let payee = (ctx.data.payee) ? ctx.data.payee.split('&').join('').toLowerCase() : finish("No 'payee' parameter passed");
    switch(rw){
      case 'read':
        readCallback(payer, payee);
        break;
      case 'write':
        let value = (ctx.data.value) ? parseInt(ctx.data.value, 10) : finish("No 'value' parameter passed");
        writeCallback(payer, payee, value);
        break;
      default: 
        finish("Invalid 'rw' parameter passed");
        break;
    }
  }
  /*calculate who owes who money out of a pair of people*/
  function read(payer, payee){
    getValueFromKey(`${payer}&${payee}`, function(value1){
      getValueFromKey(`${payee}&${payer}`, function(value2){
        let value = (value1) ? parseInt(value1, 10) : 0;
        let reverseValue = (value2) ? parseInt(value2, 10) : 0;
        let owed = value - reverseValue;
        if(owed){
          if(owed>0){
            finish(`${payer} owes ${payee} ${owed} USD`);
          }
          else{
            finish(`${payee} owes ${payer} ${Math.abs(owed)} USD`);
          }
        }
        else{
          finish(`${payer} doesn't owe ${payee} anything, sweet!`);
        }
      });
    });
  }
  /* write value */
  function write(payer, payee, value){
    getValueFromKey(`${payer}&${payee}`, function(currentValue){
      let current = (currentValue) ? parseInt(currentValue, 10) : 0;
      let newValue = parseInt(value, 10) + current; 
      client.set(`${payer}&${payee}`, newValue);
      console.log(`${payer}&${payee} set to ${newValue}`);
      read(payer, payee);
    });
  }
  /* fetch value from key */
  function getValueFromKey(key, callback){
    client.get(key, function(err, value){
      callback(value);
    });
  }
  /* end script */
  function finish(msg){
    client.quit();
    console.log('Script finished');
    done(null, msg);
  }
};
