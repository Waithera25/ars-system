import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {normalizeSchema,validateAnswers,starterForms} from './capture.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
mkdirSync(process.env.DATA_DIR||root+'data',{recursive:true});
const db=new DatabaseSync((process.env.DATA_DIR||root+'data')+'/ars.sqlite');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,client_id TEXT REFERENCES clients(id));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,client_id TEXT REFERENCES clients(id),title TEXT,details TEXT,status TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,client_id TEXT REFERENCES clients(id),title TEXT,body TEXT,published INTEGER DEFAULT 0,created TEXT);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,type TEXT,payload TEXT,created TEXT,delivered INTEGER DEFAULT 0,error TEXT DEFAULT '');`);
db.exec(`CREATE TABLE IF NOT EXISTS capture_forms(id TEXT PRIMARY KEY,title TEXT,description TEXT,schema TEXT,version INTEGER,published INTEGER);
CREATE TABLE IF NOT EXISTS capture_versions(form_id TEXT,version INTEGER,schema TEXT,title TEXT,PRIMARY KEY(form_id,version));
CREATE TABLE IF NOT EXISTS capture_submissions(id TEXT PRIMARY KEY,form_id TEXT REFERENCES capture_forms(id),version INTEGER,client_id TEXT REFERENCES clients(id),data TEXT,created TEXT,nonce TEXT,UNIQUE(client_id,nonce));`);
for(const f of starterForms){if(!db.prepare('SELECT id FROM capture_forms WHERE id=?').get(f.id)){const schema=JSON.stringify(normalizeSchema(f.schema));db.exec('BEGIN');try{db.prepare('INSERT INTO capture_forms VALUES(?,?,?,?,1,1)').run(f.id,f.title,f.description,schema);db.prepare('INSERT INTO capture_versions VALUES(?,1,?,?)').run(f.id,schema,f.title);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}}
const id=()=>randomBytes(16).toString('hex');
const hash=p=>{let salt=id();return salt+':'+scryptSync(p,salt,64).toString('hex')};
function matches(p,h){let [salt,key]=h.split(':');return timingSafeEqual(scryptSync(p,salt,64),Buffer.from(key,'hex'))}
if(!db.prepare('SELECT id FROM users LIMIT 1').get()){
 if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12)throw Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).');
 db.prepare('INSERT INTO users VALUES(?,?,?,?,NULL)').run(id(),process.env.ADMIN_EMAIL.toLowerCase(),hash(process.env.ADMIN_PASSWORD),'staff');
}
const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
const run=(sql,...args)=>db.prepare(sql).run(...args);
const text=(v,max=10000)=>typeof v==='string'?v.trim().slice(0,max):'';
function required(v,name,max){v=text(v,max);if(!v)throw Object.assign(Error(name+' is required'),{status:400});return v}
function event(type,payload){run('INSERT INTO events(id,type,payload,created) VALUES(?,?,?,?)',id(),type,JSON.stringify(payload),new Date().toISOString())}
function transaction(fn){db.exec('BEGIN');try{let value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}}
const attempts=new Map();
function rate(key){const now=Date.now();let a=attempts.get(key);if(!a||a.until<now)a={count:0,until:now+900000};a.count++;attempts.set(key,a);if(a.count>10)throw Object.assign(Error('Too many login attempts. Try again in 15 minutes.'),{status:429})}
setInterval(()=>{for(let [k,v] of attempts)if(v.until<Date.now())attempts.delete(k);run('DELETE FROM sessions WHERE expires < ?',Date.now())},60000).unref();
let sending=false;
async function deliver(){if(sending||!process.env.N8N_WEBHOOK_URL||!process.env.N8N_WEBHOOK_SECRET)return;sending=true;try{for(const e of all('SELECT * FROM events WHERE delivered=0 ORDER BY created LIMIT 20')){try{const r=await fetch(process.env.N8N_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','X-ARS-Secret':process.env.N8N_WEBHOOK_SECRET},body:JSON.stringify({event_id:e.id,type:e.type,created:e.created,data:JSON.parse(e.payload)}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Webhook HTTP '+r.status);run('UPDATE events SET delivered=1,error=\'\' WHERE id=?',e.id)}catch(err){run('UPDATE events SET error=? WHERE id=?',String(err.message).slice(0,200),e.id);break}}}finally{sending=false}}
setInterval(deliver,15000).unref();
const server=http.createServer(async(req,res)=>{
 const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','same-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
 try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(req.method==='GET'&&['/','/capture.html','/capture.css','/app.js','/capture.js','/style.css','/vendor/formio.full.min.js','/vendor/formio.full.min.css','/vendor/bootstrap.min.css','/vendor/fonts/bootstrap-icons.woff','/vendor/fonts/bootstrap-icons.woff2'].includes(path)){let f=path==='/'?'index.html':path.slice(1);res.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':f.endsWith('.woff2')?'font/woff2':f.endsWith('.woff')?'font/woff':'text/css','Cache-Control':'no-store'});return res.end(readFileSync(root+'public/'+f))}
 if(path==='/health'&&req.method==='GET')return send(200,{ok:true});
 let b={};if(!['GET','HEAD'].includes(req.method)){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>64000)throw Object.assign(Error('Request too large'),{status:413})}try{b=JSON.parse(data||'{}')}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}
 if(!b||Array.isArray(b)||typeof b!=='object')throw Object.assign(Error('Expected an object'),{status:400});
 if(req.headers.origin&&req.headers.origin!==(process.env.PUBLIC_URL||'http://'+req.headers.host))return send(403,{error:'Origin rejected'});
 }
 if(path==='/api/login'&&req.method==='POST'){
 rate(req.socket.remoteAddress);let email=text(b.email,254).toLowerCase();let u=one('SELECT * FROM users WHERE email=?',email);
 if(!u||!matches(text(b.password,256),u.password))return send(401,{error:'Email or password is incorrect'});
 let token=id(),csrf=id();run('INSERT INTO sessions VALUES(?,?,?,?)',token,u.id,csrf,Date.now()+28800000);
 res.setHeader('Set-Cookie',`ars=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return send(200,{ok:true});
 }
 let token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ars='))?.slice(4);
 let u=token&&one('SELECT u.*,s.csrf FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',token,Date.now());
 if(!u)return send(401,{error:'Please sign in'});
 const staff=u.role==='staff';
 if(req.method!=='GET'&&req.headers['x-csrf-token']!==u.csrf)return send(403,{error:'Refresh the page and try again'});
 if(path==='/api/capture'&&req.method==='GET'){
 const forms=all(staff?'SELECT * FROM capture_forms ORDER BY title':'SELECT * FROM capture_forms WHERE published=1 ORDER BY title').map(f=>({...f,schema:JSON.parse(f.schema)}));
 const rows=staff?all('SELECT * FROM capture_submissions ORDER BY created DESC LIMIT 500'):all('SELECT * FROM capture_submissions WHERE client_id=? ORDER BY created DESC LIMIT 500',u.client_id);
 return send(200,{forms,submissions:rows.map(s=>({...s,data:JSON.parse(s.data),schema:JSON.parse(one('SELECT schema FROM capture_versions WHERE form_id=? AND version=?',s.form_id,s.version).schema),title:one('SELECT title FROM capture_versions WHERE form_id=? AND version=?',s.form_id,s.version).title})),limit:500});
 }
 if(path==='/api/capture-form'&&req.method==='POST'&&staff){const title=required(b.title,'Form title',120),description=text(b.description,500);if(/[<>]/.test(title+description))return send(400,{error:'Use plain text for form titles and descriptions'});const schema=JSON.stringify(normalizeSchema(b.schema)),existing=b.id?one('SELECT * FROM capture_forms WHERE id=?',text(b.id,64)):null;if(b.id&&!existing)return send(404,{error:'Form not found'});if(existing&&b.version!==existing.version)return send(409,{error:'This form changed. Reload it before saving.'});const fid=existing?.id||id(),version=(existing?.version||0)+1;transaction(()=>{run('INSERT INTO capture_forms VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,schema=excluded.schema,version=excluded.version,published=excluded.published',fid,title,description,schema,version,b.published===true?1:0);run('INSERT INTO capture_versions VALUES(?,?,?,?)',fid,version,schema,title)});return send(200,{id:fid,version})}
 if(path==='/api/capture-submit'&&req.method==='POST'){const cid=staff?text(b.client_id,64):u.client_id;if(!one('SELECT id FROM clients WHERE id=?',cid))return send(400,{error:'Select a client'});const nonce=required(b.nonce,'Submission identifier',100);if(!/^[A-Za-z0-9-]{16,100}$/.test(nonce))return send(400,{error:'Invalid submission identifier'});const previous=one('SELECT * FROM capture_submissions WHERE client_id=? AND nonce=?',cid,nonce);if(previous){if(previous.form_id!==b.form_id||previous.version!==b.version)return send(409,{error:'Submission identifier already used'});return send(200,{id:previous.id,duplicate:true})}const f=one('SELECT * FROM capture_forms WHERE id=? AND published=1',text(b.form_id,64));if(!f)return send(404,{error:'Form is not available'});if(b.version!==f.version)return send(409,{error:'The form changed. Reload it and try again.'});const data=validateAnswers(JSON.parse(f.schema),b.data),sid=id(),created=new Date().toISOString();transaction(()=>{run('INSERT INTO capture_submissions VALUES(?,?,?,?,?,?,?)',sid,f.id,f.version,cid,JSON.stringify(data),created,nonce);event('capture.submitted',{id:sid,form_id:f.id,form_title:f.title,version:f.version,client_id:cid,data,created})});return send(201,{id:sid})}
 if(path==='/api/logout'&&req.method==='POST'){run('DELETE FROM sessions WHERE token=?',token);res.setHeader('Set-Cookie','ars=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true})}
 if(path==='/api/state'&&req.method==='GET')return send(200,{user:{email:u.email,role:u.role,csrf:u.csrf},clients:staff?all('SELECT * FROM clients'):all('SELECT * FROM clients WHERE id=?',u.client_id),requests:staff?all('SELECT * FROM requests ORDER BY created DESC'):all('SELECT * FROM requests WHERE client_id=? ORDER BY created DESC',u.client_id),reports:staff?all('SELECT * FROM reports ORDER BY created DESC'):all('SELECT * FROM reports WHERE client_id=? AND published=1 ORDER BY created DESC',u.client_id),integration:staff?{configured:!!(process.env.N8N_WEBHOOK_URL&&process.env.N8N_WEBHOOK_SECRET),pending:one('SELECT count(*) n FROM events WHERE delivered=0').n}:undefined});
 if(path==='/api/password'&&req.method==='POST'){if(!matches(text(b.current,256),u.password))return send(400,{error:'Current password is incorrect'});let password=required(b.password,'New password',256);if(password.length<12)return send(400,{error:'Use at least 12 characters'});transaction(()=>{run('UPDATE users SET password=? WHERE id=?',hash(password),u.id);run('DELETE FROM sessions WHERE user_id=?',u.id)});return send(200,{ok:true})}
 if(path==='/api/clients'&&req.method==='POST'&&staff){let name=required(b.name,'Name',120),email=required(b.email,'Email',254).toLowerCase(),password=required(b.password,'Password',256);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)return send(400,{error:'Use a valid email and a password of at least 12 characters'});if(one('SELECT id FROM users WHERE email=?',email))return send(409,{error:'Email already has an account'});let c={id:id(),name,email,phone:text(b.phone,40),company:text(b.company,120)};transaction(()=>{run('INSERT INTO clients VALUES(?,?,?,?,?)',c.id,c.name,c.email,c.phone,c.company);run('INSERT INTO users VALUES(?,?,?,?,?)',id(),email,hash(password),'client',c.id);event('client.created',c)});return send(201,{ok:true})}
 if(path==='/api/profile'&&req.method==='POST'&&!staff){let name=required(b.name,'Name',120);transaction(()=>{run('UPDATE clients SET name=?,phone=?,company=? WHERE id=?',name,text(b.phone,40),text(b.company,120),u.client_id);event('client.updated',one('SELECT * FROM clients WHERE id=?',u.client_id))});return send(200,{ok:true})}
 if(path==='/api/requests'&&req.method==='POST'){let cid=staff?text(b.client_id,64):u.client_id;if(!one('SELECT id FROM clients WHERE id=?',cid))return send(400,{error:'Select a client'});let r={id:id(),client_id:cid,title:required(b.title,'Title',160),details:required(b.details,'Details',10000),status:'New',created:new Date().toISOString()};transaction(()=>{run('INSERT INTO requests VALUES(?,?,?,?,?,?)',...Object.values(r));event('request.created',r)});return send(201,{ok:true})}
 if(path==='/api/request-status'&&req.method==='POST'&&staff){if(!['New','In progress','Waiting on client','Completed'].includes(b.status))return send(400,{error:'Invalid status'});let r=one('SELECT * FROM requests WHERE id=?',text(b.id,64));if(!r)return send(404,{error:'Request not found'});transaction(()=>{run('UPDATE requests SET status=? WHERE id=?',b.status,r.id);event('request.updated',{...r,status:b.status})});return send(200,{ok:true})}
 if(path==='/api/reports'&&req.method==='POST'&&staff){let cid=text(b.client_id,64);if(!one('SELECT id FROM clients WHERE id=?',cid))return send(400,{error:'Select a client'});let r={id:id(),client_id:cid,title:required(b.title,'Title',160),body:required(b.body,'Report',20000),published:b.published===true?1:0,created:new Date().toISOString()};transaction(()=>{run('INSERT INTO reports VALUES(?,?,?,?,?,?)',...Object.values(r));if(r.published)event('report.published',r)});return send(201,{ok:true})}
 if(path==='/api/publish'&&req.method==='POST'&&staff){let r=one('SELECT * FROM reports WHERE id=?',text(b.id,64));if(!r)return send(404,{error:'Report not found'});if(!r.published)transaction(()=>{run('UPDATE reports SET published=1 WHERE id=?',r.id);event('report.published',{...r,published:1})});return send(200,{ok:true})}
 return send(404,{error:'Action unavailable'});
 }catch(e){if(!e.status)console.error(e.message);send(e.status||500,{error:e.status?e.message:'The action could not be completed'})}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('ARS is ready on port '+(process.env.PORT||3000)));
