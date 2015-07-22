'use strict';
// This is a basic test file for use with testling.
// The test script language comes from tape.
/* jshint node: true */
var test = require('tape');

var webdriver = require('selenium-webdriver');
var seleniumHelpers = require('../../../../../test/selenium-lib');

test('Munge SDP sample', function(t) {
  var driver = seleniumHelpers.buildDriver();

  driver.get('file://' + process.cwd() +
      '/src/content/peerconnection/munge-sdp/index.html')
  .then(function() {
    t.pass('page loaded');
    return driver.findElement(webdriver.By.id('getMedia')).click();
  })
  .then(function() {
    t.pass('got media');
    return driver.findElement(webdriver.By.id('createPeerConnection')).click();
  })
  .then(function() {
    return driver.findElement(webdriver.By.id('createOffer')).click();
  })
  .then(function() {
    return driver.findElement(webdriver.By.css('#local>textarea'))
        .getAttribute('value');
  })
  .then(function(value) {
    t.ok(value !== '', 'local SDP is shown in textarea');
    return driver.findElement(webdriver.By.id('setOffer')).click();
  })
  .then(function() {
    return driver.findElement(webdriver.By.id('createAnswer')).click();
  })
  .then(function() {
    return driver.findElement(webdriver.By.css('#remote>textarea'))
        .getAttribute('value');
  })
  .then(function(value) {
    t.ok(value !== '', 'remote SDP is shown in textarea');
    return driver.findElement(webdriver.By.id('setAnswer')).click();
  })
  .then(function() {
    return driver.findElement(webdriver.By.css('#local video'));
  })
  .then(function(videoElement) {
    t.pass('found video element');
    var width = 0;
    var height = 0;
    return new webdriver.promise.Promise(function(resolve) {
      videoElement.getAttribute('videoWidth').then(function(w) {
        width = w;
        t.pass('got videoWidth ' + w);
        if (width && height) {
          resolve([width, height]);
        }
      });
      videoElement.getAttribute('videoHeight').then(function(h) {
        height = h;
        t.pass('got videoHeight' + h);
        if (width && height) {
          resolve([width, height]);
        }
      });
    });
  })
  .then(function(dimensions) {
    t.pass('got video dimensions ' + dimensions.join('x'));
    // Chrome does not shutdown unless close() is called due to starting it via
    // start-chrome shell script.
    driver.close();
    driver.quit();
    t.end();
  })
  .then(null, function(err) {
    t.fail(err);
    driver.close();
    driver.quit();
    t.end();
  });
});
