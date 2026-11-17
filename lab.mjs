import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
if(!process.env.LAB_SECRET)throw Error('Set LAB_SECRET');
const dir=process.env.DATA_DIR||'/app/data';mkdirSync(dir,{recursive:true});
const db=new DatabaseSync(dir+'/lab.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,payload TEXT,received TEXT)');
const same=(a,b)=>{a=Buffer.from(a);b=Buffer.from(b);return a.length===b.length&&timingSafeEqual(a,b)};
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ARS connection lab</title><style>body{font:16px system-ui;max-width:900px;margin:50px auto;padding:20px;color:#173c37;background:#f5f7f4}textarea,input{width:100%;padding:10px;box-sizing:border-box}button{margin:16px 0;padding:12px;background:#173c37;color:white;border:0;border-radius:5px}pre{background:white;padding:20px;white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>ARS connection lab</h1><p>Inspect events from ARS or n8n. Use fictional client information for experiments.</p><label>Lab secret (N8N_WEBHOOK_SECRET from your .env file)<input id="secret" type="password" autocomplete="off"></label><button id="load">Load captured events</button><pre id="result">No events loaded.</pre><script>document.getElementById('load').onclick=async()=>{try{let r=await fetch('/events',{headers:{'X-ARS-Secret':document.getElementById('secret').value}});document.getElementById('result').textContent=JSON.stringify(await r.json(),null,2)}catch(e){document.getElementById('result').textContent=e.message}};</script></html>`;
http.createServer(async(req,res)=>{const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};try{
 if(req.url==='/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','X-Frame-Options':'DENY'});return res.end(html)}
 if(req.url!=='/events')return send(404,{error:'Not found'});
 if(!same(req.headers['x-ars-secret']||'',process.env.LAB_SECRET))return send(401,{error:'Enter the lab secret from .env'});
 if(req.method==='GET')return send(200,db.prepare('SELECT * FROM events ORDER BY received DESC LIMIT 100').all().map(e=>({...e,payload:JSON.parse(e.payload)})));
 if(req.method!=='POST')return send(405,{error:'Use GET or POST'});
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>64000)return send(413,{error:'Too large'})}
 let event;try{event=JSON.parse(raw)}catch{return send(400,{error:'Invalid JSON'})}
 if(typeof event?.event_id!=='string'||!event.event_id||event.event_id.length>200)return send(400,{error:'event_id is required (up to 200 characters)'});
 db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?)').run(event.event_id,JSON.stringify(event),new Date().toISOString());return send(200,{accepted:true,event_id:event.event_id});
 }catch{send(500,{error:'Unable to save event'})}
}).listen(Number(process.env.PORT||3100),'0.0.0.0',()=>console.log('ARS connection lab ready'));
