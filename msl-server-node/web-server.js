#!/usr/bin/env node
/*
 * (C) Copyright 2014 Mock Service Layer Contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 */


var express = require('express');
var mustache = require('mustache');
var minimist = require('minimist');

var fs = require('fs');
var url = require('url');
var util = require('util');
var argv1 = minimist(process.argv.slice(2));

var localApp = express();
var DEFAULT_PORT = 8000;
var localAppDir = argv1.basedir||process.cwd();
var filePath = 'test/mock/';
var ignoredParams = '';
var debug= false;

var main = function(argv) {
  var port = Number(argv1.port) || DEFAULT_PORT;
  debug = (argv1.debug === 'true');
  localApp.listen(port);
  record(["MSL launched from here: ", localAppDir].
  join(" "),1);
  record(["MSL start on port:", port].join(" "),1)
};


var record=function(message, severity){
	if(debug){
		util.puts(message);
	}else if(severity>0 && !debug){
		util.puts(message);
	}
}


var localAppMockAPI = function(req, res, next) {

  if(req.path == '/mock/fakerespond') {
      var body = {};
        req.on('data', function (data) {
            body = JSON.parse(String(data));
        });
		var message;
        req.on('end', function () {
            var post = body;
			if(post.id == undefined || post.responseText == undefined)
			{
				registerMock(post);
	            record("Mock body registered for: " + body.requestPath,0);
				res.writeHead(200, {'Content-Type': 'application/json'});
				res.write('{"status":"success","message":"mock body registered"}');
				return res.end();
			}else{
				record("Provided both template ID and response text",1);
				res.writeHead(500, {'Content-Type': 'application/json'});
				res.write('{"status":"failed","message":"Provided both template ID and response text"}');
				return res.end();
			}
        });	 
	  
  }else if(req.path == '/mock/interceptxhr') {
	  var body = {};
      req.on('data', function (data) {
          body = JSON.parse(String(data));

      });
      req.on('end', function () {
          var post = body;
		  registerInterceptXHR(post);
		  record("Intercept registered for: " + body.requestPath,0);
          res.writeHead(200, {'Content-Type': 'application/json','Access-Control-Allow-Origin':'*'});
          res.write('{"status":"success","message":"intercept XHR registered"}');
      
          return res.end();
      });
     
  }else if(req.path == '/mock/getinterceptedxhr') {
      var body = {};
      req.on('data', function (data) {
	      body = JSON.parse(String(data));
      });
	  var post ={};
      req.on('end', function () {
        post = body;
        res.writeHead(200, {'Content-Type': 'application/json','Access-Control-Allow-Origin':'*'});
		res.write(JSON.stringify(getInterceptedXHR(post)));
		delete interceptXHRMap[post.requestPath];
      
		record("Sent intercepted XHR for: " + post.requestPath,0);
        return res.end();
      });
	  
		
  }else if(req.path == '/setIgnoreFlag') {
	  var body = {};
      req.on('data', function (data) {
	      body = JSON.parse(String(data));

      });
      req.on('end', function () {
          var post = body;
	      setIgnore(post.requestPath)
          record("Set ignored flag for: " + body.requestPath,0);

      });
  
      return res.end();
  }else if(req.path == '/unregisterMock') {
      var body = {};
      req.on('data', function (data) {
          body = JSON.parse(String(data));

      });
      req.on('end', function () {
          var post = body;
          unregisterMock(post.requestPath)
          record("Unregisters path for: " + post.requestPath,0);

      });
      return res.end();
  }else if(req.path == '/mock/template') {	  
	  
	  var str = '';
      req.on('data', function (data) {
		  str+=data;
      });
      req.on('end', function () {
		  var body = {};
		  body = JSON.parse(String(str));
		  record("Registered template for: " + body.id,0);
          var post = body;
    	  registerTemplate(post);
          res.writeHead(200, {'Content-Type': 'application/json','Access-Control-Allow-Origin':'*'});
          res.write('{"status":"success","message":"template registered"}');

          return res.end();
      });
	  
      
  }else if(isFakeRespond(req)) {
      var post;
      if(req.method === 'POST') {
        var body = {};
        req.on('data', function (data) {
            body += data;
        });
        req.on('end', function () {
            post = body;
        });
      }

      var mockReqRespMapKey = req._parsedUrl.pathname
      var responseObj = mockReqRespMap[mockReqRespMapKey];
      if(responseObj == undefined) {
	  mockReqRespMapKey = req.url;
	  if (mockReqRespMapKey.indexOf("?")>=0)
          mockReqRespMapKey = reparsePath(mockReqRespMapKey);
          responseObj = mockReqRespMap[req.url];
      }
      
	  if(responseObj["id"] !== undefined)
		{
			var template = templateMap[responseObj["id"] ];
			if(template == undefined)
			{
				res.writeHead(500, {'Content-Type': 'application/json'});
				res.write('{"status":"failed","message":"There is no template for the provided ID"}');
				return res.end();
			}
			var pairs = responseObj["keyValues"];
			if(typeof pairs ===  'string')
			{
				pairs = JSON.parse(pairs);
			}  
			var output=mustache.render(template,pairs);
			res.writeHead(responseObj["statusCode"], {'Content-Type': responseObj["contentType"],'Access-Control-Allow-Origin':'*'});
			
			if(responseObj["eval"] !== undefined) {
				var f = eval("(" + responseObj["eval"] + ")");
			res.write(f(req, output), post);
			}else {
				res.write(output);
			}

		  record("Responded with mock for: " + mockReqRespMapKey,0);

		}else{
	 
		  res.writeHead(responseObj["statusCode"], responseObj["header"]);

		  if (responseObj["delayTime"]>0)
			 sleep(responseObj["delayTime"]);
		  if(responseObj["eval"] !== undefined) {
			var f = eval("(" + responseObj["eval"] + ")");
			res.write(f(req, responseObj["responseText"]), post);
		  }else {
			res.write(responseObj["responseText"]);
		  }
		  
		  

		  record("Responded with mock for: " + mockReqRespMapKey,0);
	  }
      return res.end();
  }else if(isInterceptXHR(req)) {
      if(req.method === 'POST') {
	  
        var body = "";
         req.on('data', function (data) {
           body += data;
         });
         req.on('end', function () {
           var post = body;
           addInterceptedXHR(req, post);
         });
      }else {
         addInterceptedXHR(req, null);
      }

      res.writeHead(200, {'Content-Type': 'application/json','Access-Control-Allow-Origin':'*'});
      res.write('{"status":"success","message":"XHR intercepted"}');
      
      record("Intercepted XHR for: " + req.url,0);
      return res.end();
   }else {
      console.log('looking for files?   ', req.url);
      localApp.use(express.static(localAppDir+filePath));
      return next();
  }
};

/**
 * Used to register mocks for mock API calls
 */
var mockReqRespMap = {};

/**
 * Used to for XHR interceptions
 */
var interceptXHRMap = {};


/**
 * Used for responding with a completed template
 */
var templateMap = {};



/**
 * Un-register the mock in the mockReqRespMap
 *
 * @param mapKey => URL that will be deleted from the memory, if empty will wipe out all the registered mock response.
 */
function unregisterMock(mapKey) {
	if (mapKey !== "") {
		delete mockReqRespMap[mapKey];
	}
	else {
		mockReqRespMap = null;
	}

}

/**
 * Registers the mock into mockReqRespMap
 *
 * @param post => contains the fake response body
 */
function registerMock(post) {

    var responseObj = {};
    responseObj["statusCode"] = parseInt(post.statusCode)||200;
    responseObj["header"] = post.header||{'Content-Type': post.contentType||'application/json','Access-Control-Allow-Origin':'*'};
	responseObj["contentType"] = post.contentType||"application/json";
    responseObj["responseText"] = post.responseText||"This is a fake response";
	responseObj["id"] = post.id;
	responseObj["keyValues"] = post.keyValues||{};
    responseObj["eval"] = post.eval;
    responseObj["delayTime"] = parseInt(post.delayTime)||0;

    var requestPath = post.requestPath;
    mockReqRespMap[requestPath] = responseObj;
}



/**
 * Registers the mock into mockReqRespMap
 * 
 * @param req =>
 *            contains the mock api call (request query string contains request
 *            path, fake status code, fake content type)
 * @param post =>
 *            contains the fake response
 */
function registerTemplate(post) {
    templateMap[post.id] = post.template;
    record("Registered template: " + post.template,0);

}



/**
 * Registers the interception XHRs into interceptXHRMap
 *
 * @param req => contains the mock api call (request query string contains request path)
 */
function registerInterceptXHR(body) {
    var interceptedXHRs = [];
    var requestPath = body.requestPath;
    interceptXHRMap[requestPath] = interceptedXHRs;
}


/**
 * Saves intercepted XHR (url, method, body only) into interceptXHRMap
 *
 * @param req => XHR
 * @param post => post body of the request (if any)
 */
function addInterceptedXHR(req, post) {
    var xhrObj = {};
    var lightXHR = {};
    lightXHR["url"] = req.url;
    lightXHR["method"] = req.method;
    xhrObj["xhr"] = lightXHR;
    xhrObj["post"] = post;

    if(interceptXHRMap[req.url] != undefined) {
        interceptXHRMap[req.url].push(xhrObj);
    }else {
        interceptXHRMap[req._parsedUrl.pathname].push(xhrObj);
    }
}

/**
 * Returns the intercepted XHRs
 *
 * @param req => XHR containing request path to look up (request query string contains request path)
 * @return returns object containing list of XHRs with key xhr_#
 */
function getInterceptedXHR(req) {
    var requestPath = req.requestPath;
    var interceptedXHRs = interceptXHRMap[requestPath];

    var interceptedXHRsObj = {};
    var counter = 1;
    if(interceptedXHRs != undefined) {
        for (var i = 0; i < interceptedXHRs.length; i++) {
            interceptedXHRsObj["xhr_" + counter] = interceptedXHRs[i];
            counter++;
        }
    }

    return interceptedXHRsObj;
}

/**
 * Determines whether the request made by the path requires mock response by
 * checking mockReqRespMap.
 *
 * @param req => XHR
 * @return true/false
 */
function isFakeRespond(req) {
    var temp = req.url.toString();
    if (temp.indexOf("?")>=0)
    	req.url = reparsePath(temp);
    if( ((req.url in mockReqRespMap) && (mockReqRespMap[req.url] !== undefined)) ||
        ((req._parsedUrl.pathname in mockReqRespMap) && (mockReqRespMap[req._parsedUrl.pathname] !== undefined)) ) {
        return true;
    }else {
        return false;
    }
}

/**
 * Determines whether the request made by the path requires interception.
 *
 * @param req => XHR
 * @return true/false
 */
function isInterceptXHR(req) {
    if( ((req.url in interceptXHRMap) && (interceptXHRMap[req.url] !== undefined)) ||
            ((req._parsedUrl.pathname in interceptXHRMap) && (interceptXHRMap[req._parsedUrl.pathname] !== undefined)) ) {
        return true;
    }else {
        return false;
    }
}

/**
 * set up the root for the mock response using file system.
 * comment out by KCH due to not fully functional, will be implemented for next release.
 * @param mockPath => root of the mock files.
 * 
 */
// function setMockFilePathFunc(mockPath) {
//  	filePath = mockPath;
// }

/**
 * set up the parameter that should be ignored when retrieving mock responses, for example, a random generated cache buster.
 * @param params => parameters in the url that needs to be ignored.
 * 
 */
function setIgnore(params) {
	ignoredParams += params;
}

/**
 * set up delay time of a certain response. Not exposed to the client.
 * @param time => time to be delayed, represented in millisecond.
 * 
 */
function sleep(time) {
    var stop = new Date().getTime();
    while(new Date().getTime() < stop + parseInt(time)) {
        ;
    }
}

/**
 * Supporting function to parse the the URL to ignore the parameters that user don't need. Not exposed to the client.
 * 
 */
function reparsePath(oldpath) {
  if (oldpath.indexOf("?")>=0) {
      var vars = oldpath.split("?")[1].split("&");
      var result = oldpath.split("?")[0]+'?';
      var firstFlag = 0;
      for (var i=0;i<vars.length;i++) {
          var pair = vars[i].split("=");
          if (ignoredParams.search(pair[0])<0) {
              if (firstFlag === 0) {
                  result = result + pair[0] + '=' + pair[1];
                  firstFlag = 1;
              }
              else {
                  result = result + '&' + pair[0] + '=' + pair[1];
              }
          }
      }
      return result;
  }
  else {
      return oldpath;
  }
}

localApp.use(express.static(localAppDir));
localApp.use(localAppMockAPI);

main();