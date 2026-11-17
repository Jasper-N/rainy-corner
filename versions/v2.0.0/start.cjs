// EXTENSION: correct CSS MIME type for the added controls; static preview only.
const http=require('http'),fs=require('fs'),path=require('path');
const base=__dirname;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,buffer)=>{
    if(error){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');res.end(buffer);
  });
}).listen(8766,'127.0.0.1',()=>console.log('http://127.0.0.1:8766'));
