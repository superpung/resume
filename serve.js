#!/usr/bin/node
//
// This script will run a local development server. This is useful when
// developing the theme.
//
// Usage:
// `serve.js` to use the default JSONResume example
// `serve.js <filename>` to open a particular resume file 

var http = require("http");
var fs = require('fs');
var args = process.argv.slice(2);

var port = 8888;
http.createServer(async function (req, res) {
  if (req.url === '/') {
    res.writeHead(200, {
      "Content-Type": "text/html"
    });
    res.end(await render());
  } else if (/^\/fonts\/[\w-]+\.woff2$/.test(req.url)) {
    // The page's fonts, which build.js copies into dist/fonts/ for the real site
    fs.readFile(__dirname + '/node_modules/@fontsource/nunito-sans/files' + req.url.slice('/fonts'.length), function (err, data) {
      res.writeHead(err ? 404 : 200, { "Content-Type": "font/woff2" });
      res.end(data);
    });
  }
}).listen(port);

console.log("Preview: http://localhost:8888/");
console.log("Serving..");

async function render() {
  try {
    var resume = args.length
      ? JSON.parse(fs.readFileSync(args[0], 'utf8'))
      : require("resume-schema").resumeJson;
    return await require("./index.js").render(resume);
  } catch (e) {
    console.log(e.message);
    return "";
  }
}
