const ES_ENDPOINT = "http://ec2-54-149-146-109.us-west-2.compute.amazonaws.com/tlser/";

function Timestamp(jsDate) {
  this.timestamp = jsDate;
  this.count = 1;
}

Timestamp.prototype = {
  timestamp: null,
  count: 0,
  toString: function() {
    return this.timestamp.getUTCFullYear() + "-" +
           (this.timestamp.getUTCMonth() + 1) + "-" +
           this.timestamp.getUTCDate() + " (x" + this.count + ")";
  }
};

function Result(esResult) {
  this.targetHostname = esResult._source.hostname;
  this.validForHostname = esResult._source.redactedEE
                        ? esResult._source.redactedEE.redactedCN
                        : "(none)";
  this.intermediates = esResult._source.restOfCertChain
                       ? esResult._source.restOfCertChain
                       : [];
  this.timestamps = [
    new Timestamp(new Date(esResult._source.timestamp * 1000))
  ];
  this.count = 1;
}

Result.prototype = {
  targetHostname: null,
  validForHostname: null,
  intermediates: null,
  timestamps: null,
  count: 0,

  matches: function(otherResult) {
    if (this.targetHostname != otherResult.targetHostname) {
      return false;
    }
    if (this.validForHostname != otherResult.validForHostname) {
      return false;
    }
    for (var i in this.intermediates) {
      if (otherResult.intermediates.indexOf(this.intermediates[i]) == -1) {
        return false;
      }
    }
    for (var i in otherResult.intermediates) {
      if (this.intermediates.indexOf(otherResult.intermediates[i]) == -1) {
        return false;
      }
    }
    return true;
  },
  coalesce: function(otherResult) {
    this.count++;
    for (var i in this.timestamps) {
      if (this.timestamps[i].timestamp.getTime() ==
          otherResult.timestamps[0].timestamp.getTime()) {
        this.timestamps[i].count++;
        return;
      }
    }
    this.timestamps.push(otherResult.timestamps[0]);
  }
};

function ResultSet(esResults) {
  this.results = [];
  for (var i in esResults) {
    var result = new Result(esResults[i]);
    this.addResult(result);
  }
}

ResultSet.prototype = {
  results: null,
  addResult: function(result) {
    for (var i in this.results) {
      if (this.results[i].matches(result)) {
        this.results[i].coalesce(result);
        return;
      }
    }
    this.results.push(result);
  }
};

function displayResults(resultSet) {
  var resultsDOM = document.getElementById("results");
  while (resultsDOM.children.length > 0) {
    resultsDOM.children[0].remove();
  }
  for (var i in resultSet.results) {
    var result = resultSet.results[i];
    var resultDOM = document.createElement("div");
    var resultText = document.createTextNode(result.targetHostname +
                                             " (valid for " +
                                             result.validForHostname +
                                             ") (x" + result.count + ")");
    resultDOM.appendChild(resultText);
    var statsDOM = document.createElement("div");
    statsDOM.setAttribute("class", "resultInfo");
    var timestampsText = document.createTextNode("timestamps: ");
    statsDOM.appendChild(timestampsText);
    for (var j in result.timestamps) {
      var timestampText =
        document.createTextNode((j > 0 ? ", " : "") +
        result.timestamps[j].toString());
      statsDOM.appendChild(timestampText);
    }
    statsDOM.appendChild(document.createElement("br"));
    var intermediatesText = document.createTextNode("intermediates: ");
    statsDOM.appendChild(intermediatesText);
    for (var j in result.intermediates) {
      if (j > 0) {
        var spacerText = document.createTextNode(", ");
        statsDOM.appendChild(spacerText);
      }
      var pem = result.intermediates[j];
      var link = document.createElement("a");
      link.textContent = j;
      link.href = "_blank";
      link.onclick = function(pem, evt) {
        evt.preventDefault();
        evt.stopPropagation();
        var certsplainer = document.getElementById("certsplainer");
        var message = { pem: pem, asEndEntity: false };
        certsplainer.contentWindow.postMessage(message,
                                               document.location.origin);
        var certsplainerContainer =
          document.getElementById("certsplainerContainer");
        certsplainerContainer.setAttribute("class", "active");
        certsplainerContainer.style.left = evt.layerX + "px";
        certsplainerContainer.style.top = evt.layerY + "px";
      }.bind(link, pem);
      statsDOM.appendChild(link);
    }
    resultDOM.appendChild(statsDOM);
    resultsDOM.appendChild(resultDOM);
  }
}

var errorCodeMapping = {
  "0": "Success (?!)",
  "-12286": "No Cipher Overlap",
  "-5938": "PR End of File Error",
  "-5961": "PR Connection Reset Error",
  "-12273": "Bad MAC Read",
  "-12194": "Access Denied Alert",
  "-16384": "Pinning Failure",
  "-8183": "Bad DER",
  "-8061": "Future OCSP Response",
  "-12263": "RX Record Too Long"
};
function errorCodeToString(errorCode) {
  if (errorCodeMapping[errorCode]) {
    return errorCodeMapping[errorCode] + "(" + errorCode + ")";
  }
  return "Unknown error: " + errorCode;
}

function getReports() {
  var errorCodesDOM = document.getElementById("errorCodes");
  var errorCode = errorCodesDOM.value;
  var req = new XMLHttpRequest();
  req.open("POST", ES_ENDPOINT + '_search?');
  req.onreadystatechange = function() {
    if (req.readyState == XMLHttpRequest.DONE && req.status == 200) {
      var results = JSON.parse(req.responseText);
      console.log(results);
      var resultSet = new ResultSet(results.hits.hits);
      console.log(resultSet);
      displayResults(resultSet);
    }
  };
  var data = {
    query: {
      match: {
        errorCode: errorCode
      }
    },
    size: 200
  };
  req.send(JSON.stringify(data));
}

function getErrorCodes() {
  /* This isn't enabled yet:
  var req = new XMLHttpRequest();
  req.open("POST", ES_ENDPOINT + "_search?");
  req.onreadystatechange = function() {
    if (req.readyState == XMLHttpRequest.DONE && req.status == 200) {
      var results = JSON.parse(req.responseText);
      console.log(results);
    }
  };
  var data = {
    size: 0,
    aggs: {
      group_by_errorCode: {
        terms: {
          field: "errorCode"
        }
      }
    }
  };
  req.send(JSON.stringify(data));
  */

  var errorCodes = [ 0, -12286, -5938, -5961, -12273, -12194, -16384, -8183,
                     -8061, -12263 ];
  var errorCodesDOM = document.getElementById("errorCodes");
  var pinningErrorOptionIndex = -1;
  for (var i in errorCodes) {
    var optionDOM = document.createElement("option");
    optionDOM.value = errorCodes[i];
    optionDOM.textContent = errorCodeToString(errorCodes[i]);
    errorCodesDOM.appendChild(optionDOM);
    if (errorCodes[i] == -16384) {
      pinningErrorOptionIndex = i;
    }
  }
  errorCodesDOM.selectedIndex = pinningErrorOptionIndex;
  getReports();
}

document.body.onclick = function() {
  var certsplainerContainer = document.getElementById("certsplainerContainer");
  certsplainerContainer.setAttribute("class", "");
};

getErrorCodes();
