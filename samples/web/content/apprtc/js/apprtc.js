/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */
/* jshint browser: true, camelcase: true, curly: true, devel: true, eqeqeq: true, forin: false, globalstrict: true, quotmark: single, undef: true, unused: strict */
/* global getUserMedia, attachMediaStream, reattachMediaStream */

'use strict';

var apprtc = apprtc || {};
// Config dictionary is set by app engine.
var config = config || {};

(function() {

var Log = apprtc.Log;
var SignalingManager = apprtc.SignalingManager;
var Stats = apprtc.Stats;

/*
 * Handles all UI interactions and creates requisite model objects.
 */
var App = apprtc.App = function() {
  Log.info('Initializing AppRTC; room=' + config.roomId + '.');

  // Grab references to DOM elemnts.
  this.cardDiv = document.getElementById('card');
  this.containerDiv = document.getElementById('container');
  this.localVideoElt = document.getElementById('localVideo');
  this.miniVideoElt = document.getElementById('miniVideo');
  this.remoteVideoElt = document.getElementById('remoteVideo');
  this.statusDiv = document.getElementById('status');

  // DOM element events.
  this.localVideoElt.addEventListener(
      'loadedmetadata', this.onResize.bind(this));
  this.containerDiv.addEventListener(
      'dblclick', this.enterFullScreen.bind(this));
  window.addEventListener('resize', this.onResize.bind(this));

  // Create signaling manager.
  this.config = config;
  this.signalingManager = new SignalingManager(this.config);

  // Create stats.
  this.stats = new Stats(this.signalingManager);

  // Create info box.
  this.infoBox = new apprtc.InfoBox(
      document.getElementById('infoDiv'), this.stats);

  // Subscribe to relevant topics.
  this.subscriptions = {};
  this.subscriptions[SignalingManager.REMOTE_STREAM_TOPIC] =
      this.onRemoteStream.bind(this);
  this.subscriptions[SignalingManager.REMOTE_VIDEO_NONE_TOPIC] =
      this.onRemoteVideoNone.bind(this);
  this.subscriptions[SignalingManager.REMOTE_VIDEO_PENDING_TOPIC] =
      this.onRemoteVideoPending.bind(this);
  this.subscriptions[SignalingManager.REMOTE_HANGUP_TOPIC] =
      this.onRemoteHangup.bind(this);
  apprtc.pubsub.subscribeAll(this.subscriptions);

  // Initialize call.
  this.turnCompleted = false;
  this.gotUserMedia = false;
  this.localStream = null;
  this.remoteStream = null;
  this.resetStatusMessage();
  this.prepareForCall();
};

// Cleanup.
App.prototype.shutdown = function() {
  if (this.localStream) {
    this.localStream.stop();
  }
  apprtc.pubsub.unsubscribeAll(this.subscriptions);
  this.infoBox.shutdown();
  this.infoBox = null;
  this.stats.shutdown();
  this.stats = null;
  this.signalingManager.shutdown();
  this.signalingManager = null;
  apprtc.pubsub.clear();
};

App.CALL_START_TOPIC = 'APP_CALL_START';
App.CALL_END_TOPIC = 'APP_CALL_END';

// Prepares for a call by retrieving a TURN server if needed and by requesting
// user media.
App.prototype.prepareForCall = function() {
  apprtc.util.updateTurnServerUrl(this.config, (function() {
    this.turnCompleted = true;
    this.startCallIfReady();
  }).bind(this));

  if (this.config.mediaConstraints.audio === false &&
      this.config.mediaConstraints.video === false) {
    this.gotUserMedia = true;
  } else {
    this.requestUserMedia();
  }
};

// Starts the call if we have both TURN and media.
App.prototype.startCallIfReady = function() {
  if (!this.turnCompleted || !this.gotUserMedia) {
    return;
  }
  apprtc.pubsub.publish(App.CALL_START_TOPIC);
  this.signalingManager.start(this.localStream);
};

// Requests media from user, calls |startCallIfIfReady| when done.
App.prototype.requestUserMedia = function() {
  // Call into getUserMedia via the polyfill (adapter.js).
  var mediaConstraints = this.config.mediaConstraints;
  try {
    getUserMedia(mediaConstraints,
        this.onUserMediaSuccess.bind(this), this.onUserMediaError.bind(this));
    Log.info('Requested access to local media with mediaConstraints:\n' +
        '  \'' + JSON.stringify(mediaConstraints) + '\'');
  } catch (e) {
    alert('getUserMedia() failed. Is this a WebRTC capable browser?');
    Log.error('getUserMedia failed with exception: ' + e.message);
  }
};

// Attaches stream to video element and displays it, calls |startCallIfReady|.
App.prototype.onUserMediaSuccess = function(stream) {
  Log.info('User has granted access to local media.');
  // Call the polyfill wrapper to attach the media stream to this element.
  attachMediaStream(this.localVideoElt, stream);
  this.localVideoElt.style.opacity = 1;
  this.localStream = stream;
  this.gotUserMedia = true;
  this.startCallIfReady();
};

// Logs error and calls |startCallIfReady|.
App.prototype.onUserMediaError = function(error) {
  var errorMessage = 'Failed to get access to local media. Error name was ' +
      error.name + '. Continuing without sending a stream.';
  Log.error(errorMessage);
  alert(errorMessage);
  this.gotUserMedia = true;
  this.startCallIfReady();
};

// Sets the HTML for the status element.
App.prototype.setStatusMessage = function(message) {
  this.statusDiv.innerHTML = message;
};

// Resets the status message based on whether or not we're the caller.
App.prototype.resetStatusMessage = function() {
  if (this.signalingManager.isInitiator) {
    var roomLink = this.config.roomLink;
    this.setStatusMessage(
        'Waiting for someone to join: <a href=' + roomLink + '>' +
        roomLink + '</a>');
  } else {
    this.setStatusMessage('Initializing...');
  }
};

// Waits for the remote video attached to the remote video element to start
// playing, then transitions the call to an active state.
App.prototype.waitForRemoteVideo = function() {
  // Wait for the actual video to start arriving before moving to the active
  // call state.
  if (this.remoteVideoElt.currentTime > 0) {
    this.transitionToActive();
  } else {
    setTimeout(this.waitForRemoteVideo.bind(this), 10);
  }
};

// Sets the app into an active video call state. This makes the remote video
// the main view on the screen with a local video view in the corner.
App.prototype.transitionToActive = function() {
  apprtc.pubsub.publish(App.CALL_END_TOPIC);

  // TODO(tkchin): stereoscopic.
  reattachMediaStream(this.miniVideoElt, this.localVideoElt);
  this.miniVideoElt.style.opacity = 1;
  this.remoteVideoElt.style.opacity = 1;
  // Spin the card to show remote video (800 ms). Set a timer to detach the
  // local video once the transition completes.
  this.cardDiv.style.webkitTransform = 'rotateY(180deg)';
  var localVideoElt = this.localVideoElt;
  setTimeout(function() {
    localVideoElt.src = '';
  }, 800);
  // Reset window display according to the aspect ratio of remote video.
  this.onResize();
  this.setStatusMessage(
      '<input type=\'button\' id=\'hangup\' value=\'Hang up\' />');
  // TODO(tkchin): fix hack.
  var button = document.getElementById('hangup');
  button.addEventListener('click', this.onHangup.bind(this));
};

// Sets the app into a done state. The videos are hidden.
App.prototype.transitionToDone = function() {
  this.localVideoElt.style.opacity = 0;
  this.remoteVideoElt.style.opacity = 0;
  this.miniVideoElt.style.opacity = 0;
  this.setStatusMessage('You have left the call.');
};

App.prototype.enterFullScreen = function(event) {
  // When full-screening the canvas we want to avoid the extra spacing
  // introduced by the containing div, but when full-screening the rectangular
  // view we want to keep the full container visible (including e.g. miniVideo).
  var element = event.target.id === 'remoteCanvas' ?
      event.target : this.containerDiv;
  element.webkitRequestFullScreen();
};

//
// Topic handlers.
//

App.prototype.onRemoteStream = function(data) {
  this.remoteStream = data.stream;
  attachMediaStream(this.remoteVideoElt, this.remoteStream);
};

App.prototype.onRemoteVideoNone = function() {
  Log.info('No remote video stream; not waiting for media to arrive.');
  this.transitionToActive();
};

App.prototype.onRemoteVideoPending = function() {
  Log.info('Waiting for remote video.');
  this.waitForRemoteVideo();
};

App.prototype.onRemoteHangup = function() {
  Log.info('Session terminated.');
  this.onHangup();
};

//
// DOM event handlers.
//

App.prototype.onHangup = function() {
  this.transitionToDone();
  this.shutdown();
};

App.prototype.onResize = function() {
  // Don't letterbox while full-screening, by undoing the changes below.
  if (document.webkitIsFullScreen) {
    this.containerDiv.style.cssText = 'top: 0px; left: 0px;';
    return;
  }

  var aspectRatio;
  var remoteVideoElt = this.remoteVideoElt;
  var localVideoElt = this.localVideoElt;
  if (remoteVideoElt && remoteVideoElt.style.opacity === '1') {
    aspectRatio = remoteVideoElt.videoWidth / remoteVideoElt.videoHeight;
  } else if (localVideoElt && localVideoElt.style.opacity === '1') {
    aspectRatio = localVideoElt.videoWidth / localVideoElt.videoHeight;
  } else {
    return;
  }

  var innerHeight = window.innerHeight;
  var innerWidth = window.innerWidth;
  var videoWidth = innerWidth < aspectRatio * window.innerHeight ?
      innerWidth : aspectRatio * window.innerHeight;
  var videoHeight = innerHeight < window.innerWidth / aspectRatio ?
      innerHeight : window.innerWidth / aspectRatio;
  this.containerDiv.style.width = videoWidth + 'px';
  this.containerDiv.style.height = videoHeight + 'px';
  this.containerDiv.style.left = (innerWidth - videoWidth) / 2 + 'px';
  this.containerDiv.style.top = (innerHeight - videoHeight) / 2 + 'px';
};

})();
