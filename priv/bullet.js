/*
	Copyright (c) 2011, Lo�c Hoguin <essen@dev-extend.eu>

	Permission to use, copy, modify, and/or distribute this software for any
	purpose with or without fee is hereby granted, provided that the above
	copyright notice and this permission notice appear in all copies.

	THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
	WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
	MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
	ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
	WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
	ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
	OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

/**
	Bullet is a client-side javascript library AND server-side Cowboy handler
	to manage continuous streaming. It selects the proper transport in a fully
	automated way and makes sure to always reconnect to the server on any
	disconnect. You only need to handle sending messages, receiving them,
	and managing the heartbeat of the stream.

	Usage: $.bullet(url);

	Then you can register one of the 4 event handlers:
	onopen, onmessage, onclose, onheartbeat.

	onopen is called once right after starting the bullet stream.
	onmessage is called once for each message receveid.
	onclose is called once right after you voluntarily close the socket.
	onheartbeat is called once every few seconds to allow you to easily setup
	a ping/pong mechanism. By default a JSON ping is sent.
*/
(function($){$.extend({bullet: function(url){
	const CONNECTING = 0;
	const OPEN = 1;
	const CLOSING = 2;
	const CLOSED = 3;

	var transports = {
		/**
			The websocket transport is disabled for Firefox 6.0 because it
			causes a crash to happen when the connection is closed.
			@see https://bugzilla.mozilla.org/show_bug.cgi?id=662554
		*/
		websocket: function(){
			if (window.WebSocket){
				return window.WebSocket;
			}

			if (window.MozWebSocket
					&& navigator.userAgent.indexOf("Firefox/6.0") == -1){
				return window.MozWebSocket;
			}

			return false;
		},

		xhrPolling: function(){
			var openTimeout;
			var pollTimeout;

			var fakeurl = url.replace('ws:', 'http:').replace('wss:', 'https:');
			var fake = {
				readyState: CONNECTING,
				send: function(data){
					$.ajax({
						async: false,
						type: 'POST',
						url: fakeurl,
						data: data,
						dataType: 'text',
						contentType:
							'application/x-www-form-urlencoded; charset=utf-8',
						success: function(data){
							fake.onmessage({'data': data});
						},
						error: function(xhr){
							// @todo That's bad, assume success?
							$(fake).triggerHandler('error');
						}
					});
				},
				close: function(){
					this.readyState = CLOSED;
					$(fake).triggerHandler('close');
					clearTimeout(openTimeout);
					clearTimeout(pollTimeout);
				},
				onopen: function(){},
				onmessage: function(){},
				onerror: function(){},
				onclose: function(){}
			};

			function poll(){
				$.ajax({
					type: 'GET',
					url: fakeurl,
					dataType: 'text',
					data: {},
					headers: {'X-Socket-Transport': 'AJAX long polling'},
					success: function(data){
						fake.onmessage({'data': data});
						if (fake.readyState == OPEN){
							pollTimeout = setTimeout(function(){poll();}, 100);
						}
					},
					error: function(xhr){
						$(fake).triggerHandler('error');
					}
				});
			}

			openTimeout = setTimeout(function(){
				fake.readyState = OPEN;
				$(fake).triggerHandler('open');
				pollTimeout = setTimeout(function(){poll();}, 100);
			}, 100);

			return function(){ return fake; };
		}
	};

	var tn = 0;
	function next(){
		var c = 0;

		for (var f in transports){
			if (tn >= c){
				var t = transports[f]();
				if (t){
					return new t(url);
				}

				tn++;
			}

			c++;
		}
	}

	var stream = new function(){
		var readyState = CONNECTING;
		var connected = false;
		var heartbeat;
		var reopenTime = 500;

		var transport = next();
		function init(){
			transport.onopen = function(){
				connected = true;
				// @todo We don't want to heartbeat all transports.
				heartbeat = setInterval(function(){stream.onheartbeat();}, 20000);
				reopenTime = 500;

				if (readyState != OPEN){
					readyState = OPEN;
					$(stream).triggerHandler('open');
				}
			};
			transport.onclose = function(){
				connected = false;
				clearInterval(heartbeat);
				reopenTime *= 2;

				if (readyState == CLOSING){
					readyState = CLOSED;
					$(stream).triggerHandler('close');
				} else{
					// Close happened on connect, select next transport
					if (readyState == CONNECTING){
						tn++;
					}

					// Wait some time between each reconnects.
					// @todo Improve that.
					setTimeout(function(){
						transport = next();
						init();
					}, reopenTime);
				}
			};
			transport.onerror = transport.onclose;
			transport.onmessage = function(e){
				stream.onmessage(e);
			};
		}
		init();

		this.onopen = function(){};
		this.onmessage = function(){};
		this.onclose = function(){};
		this.onheartbeat = function(){};

		this.send = function(data){
			if (connected){
				transport.send(data);
			} else{
				// @todo That's bad, assume success?
				$(stream).triggerHandler('error');
			}
		};
		this.close = function(){
			readyState = CLOSING;
			transport.close(data);
		};
	};

	return stream;
}})})(jQuery);