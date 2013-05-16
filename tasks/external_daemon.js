/*
 * grunt-external-daemon
 * https://github.com/jlindsey/grunt-external-daemon
 *
 * Copyright (c) 2013 Joshua Lindsey
 * Licensed under the MIT license.
 */

 'use strict';

 module.exports = function(grunt) {

  var path  = require('path'),
      fs    = require('fs'),
      util  = require('util'),
      _     = require('underscore');

  grunt.registerMultiTask('external_daemon', 'Launch external long-running background processes', function () {
    var done = this.async();
    var options = this.options({
      verbose: false,
      nodeSpawnOptions: {},
      startCheck: function() { return true; },
      startCheckInterval: 0.5,
      startCheckTimeout: 5.0
    });
    var cmd = path.normalize(grunt.template.process(this.data.cmd));
    var args = this.data.args || [];
    var startedEventName = 'external:'+this.name+':started';
    var checkIntervalTime = (options.startCheckInterval * 1000),
        failTimeoutTime   = (options.startCheckTimeout * 1000);
    var logFunc = (options.verbose) ? grunt.log.write : grunt.verbose.write;
    var proc, failTimeoutHandle, checkIntervalHandle, stdout = [], stderr = [];

    if (!cmd || cmd.length === 0) {
      grunt.fail.warn(util.format('You must specify "cmd" for task %s', this.name));
    }

    if (args && !_.isArray(args)) {
      grunt.fail.warn(util.format('You must specify "args" as an array for task %s', this.name));
    }

    if (!_.isFunction(options.startCheck)) {
      grunt.fail.warn(util.format('You must specify "startCheck" as a function for task %s', this.name));
    }

    args = _.map(args, function(arg) { return grunt.template.process(arg); });

    proc = grunt.util.spawn({
      cmd: cmd,
      args: args,
      opts: options.nodeSpawnOptions
    }, function (error, result, code) {
      grunt.verbose.write(util.format("[%s STDOUT] %s"), cmd, result.stdout);
      grunt.verbose.write(util.format("[%s STDERR] %s"), cmd, result.stderr);

      grunt.log.warn(util.format("Command %s exited with status code %s", cmd, code));
    });

    // Make sure we don't leave behind any dangling processes.
    process.on('exit', function() {
      proc.kill('SIGHUP');
    });

    proc.stdout.setEncoding('utf-8');
    proc.stderr.setEncoding('utf-8');

    proc.stdout.on('data', function(data) {
      stdout.push(data);
      logFunc(util.format("[%s STDOUT] %s", cmd, data));
    });
    proc.stderr.on('data', function(data) {
      stderr.push(data);
      logFunc(util.format("[%s STDERR] %s", cmd, data));
    });

    grunt.event.on(startedEventName, function() {
      clearTimeout(failTimeoutHandle);
      clearInterval(checkIntervalHandle);

      grunt.log.ok(util.format("Started %s", cmd));
      
      done();
    });

    // If timeout check is set to false instead of a number, disable the timeout.
    if (options.startCheckTimeout !== false) {
      failTimeoutHandle = setTimeout(function() {
        proc.kill('SIGHUP');
        clearInterval(checkIntervalHandle);
        grunt.fail.fatal(util.format("Command timed out: %s", cmd));
      }, failTimeoutTime);
    }

    // Start the check interval.
    checkIntervalHandle = setInterval(function() {
      if (options.startCheck(stdout.join(), stderr.join())) {
        grunt.event.emit(startedEventName);
      }
    }, checkIntervalTime);
  });
 };
