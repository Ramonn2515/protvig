import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'1mb'}));
const base=process.env.DATA_DIR||path.resolve('data');fs.mkdirSync(base,{recursive:true});fs.mkdirSync(path.join(base,'uploads'),{recursive:true});
const db=new Database(path.join(base,'protvig.db'));db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','client')),created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS markets(id INTEGER PRIMARY KEY,name TEXT NOT NULL,plan TEXT NOT NULL CHECK(plan IN ('Básico','Prime')),created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS memberships(user_id INTEGER NOT NULL,market_id INTEGER NOT NULL,PRIMARY KEY(user_id,market_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(market_id) REFERENCES markets(id));CREATE TABLE IF NOT EXISTS occurrences(id INTEGER PRIMARY KEY,market_id INTEGER NOT NULL,type TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(market_id) REFERENCES markets(id));CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY,occurrence_id INTEGER NOT NULL,stored_name TEXT NOT NULL,original_name TEXT NOT NULL,mime TEXT NOT NULL,FOREIGN KEY(occurrence_id) REFERENCES occurrences(id));CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));`);
// Retenção: 30 dias contados da publicação (created_at), não da data das imagens.
// A limpeza ocorre na inicialização e, depois, a cada 24 horas enquanto o servidor estiver ligado.
const RETENTION_DAYS=30;
function cleanupExpiredOccurrences(){
  const expired=db.prepare("SELECT id FROM occurrences WHERE created_at <= datetime('now', '-30 days')").all();
  let removed=0, failures=0;
  for(const {id} of expired){
    const attachments=db.prepare('SELECT stored_name FROM attachments WHERE occurrence_id=?').all(id);
    try{
      // Não remover a ocorrência do banco se algum arquivo não puder ser removido.
      for(const {stored_name} of attachments){
        if(!/^[0-9a-f-]{36}$/.test(stored_name))throw new Error('Nome de arquivo inesperado');
        try{fs.unlinkSync(path.join(base,'uploads',stored_name));}
        catch(err){if(err.code!=='ENOENT')throw err;}
      }
      db.transaction(()=>{
        db.prepare('DELETE FROM attachments WHERE occurrence_id=?').run(id);
        db.prepare('DELETE FROM occurrences WHERE id=?').run(id);
      })();
      removed++;
    }catch(err){failures++;console.error('Falha na limpeza da ocorrência '+id+':',err.message);}
  }
  if(removed||failures)console.log(`Retenção ProtVig: ${removed} ocorrências removidas; ${failures} falhas.`);
}
cleanupExpiredOccurrences();
const retentionTimer=setInterval(cleanupExpiredOccurrences,24*60*60*1000);
retentionTimer.unref();
const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),password=process.env.ADMIN_PASSWORD||'';
if(email&&password.length>=12&&!db.prepare('SELECT id FROM users WHERE email=?').get(email)){db.prepare("INSERT INTO users(email,password,role) VALUES (?,?,'admin')").run(email,bcrypt.hashSync(password,12));console.log('Administrador inicial criado');}
if(!db.prepare("SELECT id FROM users WHERE role='admin'").get())console.warn('Configure ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) para criar o administrador.');
const cookie=(req,name)=>req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
function auth(req,res,next){const token=cookie(req,'pv_session');const session=token&&db.prepare('SELECT users.id,users.email,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(crypto.createHash('sha256').update(token).digest('hex'),Date.now());if(!session)return res.status(401).json({error:'Acesso não autorizado'});req.user=session;next();}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'Acesso restrito'});next();}
function access(user,market){return user.role==='admin'||!!db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND market_id=?').get(user.id,market);}
app.post('/api/login',(req,res)=>{const user=db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email||'').trim().toLowerCase());if(!user||!bcrypt.compareSync(String(req.body.password||''),user.password))return res.status(401).json({error:'Credenciais inválidas'});const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),user.id,Date.now()+86400000);res.set('Set-Cookie',`pv_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${process.env.NODE_ENV==='production'?'; Secure':''}`);res.json({id:user.id,email:user.email,role:user.role});});
app.post('/api/logout',auth,(req,res)=>{const token=cookie(req,'pv_session');db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(token).digest('hex'));res.set('Set-Cookie','pv_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.json({ok:true});});
app.get('/api/me',auth,(req,res)=>res.json(req.user));
app.get('/api/markets',auth,(req,res)=>res.json(req.user.role==='admin'?db.prepare('SELECT * FROM markets ORDER BY name').all():db.prepare('SELECT markets.* FROM markets JOIN memberships ON memberships.market_id=markets.id WHERE memberships.user_id=? ORDER BY name').all(req.user.id)));
app.post('/api/markets',auth,admin,(req,res)=>{const {name,plan}=req.body;if(typeof name!=='string'||!name.trim()||!['Básico','Prime'].includes(plan))return res.status(400).json({error:'Dados inválidos'});const result=db.prepare('INSERT INTO markets(name,plan) VALUES (?,?)').run(name.trim().slice(0,120),plan);res.status(201).json({id:result.lastInsertRowid});});
app.get('/api/storage',auth,admin,(req,res)=>{const stats=db.prepare(`SELECT COUNT(*) AS occurrences, SUM(CASE WHEN created_at <= datetime('now','-25 days') THEN 1 ELSE 0 END) AS expiring_soon FROM occurrences`).get();const media=db.prepare('SELECT COUNT(*) AS files FROM attachments').get();let bytes=0;for(const f of fs.readdirSync(path.join(base,'uploads'))){try{const st=fs.statSync(path.join(base,'uploads',f));if(st.isFile())bytes+=st.size;}catch{}}res.json({occurrences:stats.occurrences||0,expiringSoon:stats.expiring_soon||0,files:media.files||0,bytes,retentionDays:RETENTION_DAYS});});
app.get('/api/clients',auth,admin,(req,res)=>res.json(db.prepare("SELECT users.id,users.email,group_concat(memberships.market_id) AS markets FROM users LEFT JOIN memberships ON users.id=memberships.user_id WHERE users.role='client' GROUP BY users.id ORDER BY users.email").all()));
app.post('/api/clients',auth,admin,(req,res)=>{const {email,password,marketIds}=req.body;if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<12||!Array.isArray(marketIds)||!marketIds.length||!marketIds.every(Number.isInteger))return res.status(400).json({error:'Informe e-mail, senha com 12 caracteres e mercados'});try{const result=db.transaction(()=>{const id=db.prepare("INSERT INTO users(email,password,role) VALUES (?,?,'client')").run(email.trim().toLowerCase(),bcrypt.hashSync(password,12)).lastInsertRowid;for(const market of [...new Set(marketIds)])db.prepare('INSERT INTO memberships(user_id,market_id) VALUES (?,?)').run(id,market);return id})();res.status(201).json({id:result});}catch{res.status(400).json({error:'E-mail já cadastrado ou mercado inválido'});}});
app.get('/api/occurrences',auth,(req,res)=>{const sql=`SELECT o.*,m.name AS market,m.plan FROM occurrences o JOIN markets m ON m.id=o.market_id ${req.user.role==='admin'?'':'JOIN memberships x ON x.market_id=o.market_id AND x.user_id=?'} ORDER BY o.date DESC,o.time DESC,o.id DESC`;const rows=req.user.role==='admin'?db.prepare(sql).all():db.prepare(sql).all(req.user.id);res.json(rows.map(o=>({...o,attachments:db.prepare('SELECT id,original_name,mime FROM attachments WHERE occurrence_id=?').all(o.id)})));});
app.post('/api/occurrences',auth,admin,(req,res)=>{const {market_id,type,date,time,description}=req.body;if(!Number.isInteger(market_id)||!db.prepare('SELECT id FROM markets WHERE id=?').get(market_id)||typeof type!=='string'||!type.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||typeof description!=='string'||!description.trim())return res.status(400).json({error:'Dados da ocorrência inválidos'});const result=db.prepare('INSERT INTO occurrences(market_id,type,date,time,description) VALUES (?,?,?,?,?)').run(market_id,type.trim().slice(0,100),date,time,description.trim().slice(0,5000));res.status(201).json({id:result.lastInsertRowid});});
const upload=multer({storage:multer.diskStorage({destination:path.join(base,'uploads'),filename:(_,file,cb)=>cb(null,crypto.randomUUID())}),limits:{fileSize:100*1024*1024,files:5},fileFilter:(_,file,cb)=>cb(null,/^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/.test(file.mimetype))});
app.post('/api/occurrences/:id/attachments',auth,admin,upload.array('files',5),(req,res)=>{const occ=db.prepare('SELECT id FROM occurrences WHERE id=?').get(req.params.id);if(!occ){for(const f of req.files||[])fs.unlinkSync(f.path);return res.status(404).json({error:'Ocorrência não encontrada'});}for(const f of req.files||[])db.prepare('INSERT INTO attachments(occurrence_id,stored_name,original_name,mime) VALUES (?,?,?,?)').run(occ.id,f.filename,path.basename(f.originalname).slice(0,180),f.mimetype);res.json({count:req.files?.length||0});});
app.delete('/api/occurrences/:id',auth,admin,(req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Identificador inválido'});const occ=db.prepare('SELECT id FROM occurrences WHERE id=?').get(id);if(!occ)return res.status(404).json({error:'Ocorrência não encontrada'});const attachments=db.prepare('SELECT stored_name FROM attachments WHERE occurrence_id=?').all(id);try{for(const {stored_name} of attachments){if(!/^[0-9a-f-]{36}$/.test(stored_name))throw new Error('Nome de arquivo inválido');try{fs.unlinkSync(path.join(base,'uploads',stored_name));}catch(err){if(err.code!=='ENOENT')throw err;}}db.transaction(()=>{db.prepare('DELETE FROM attachments WHERE occurrence_id=?').run(id);db.prepare('DELETE FROM occurrences WHERE id=?').run(id);})();res.json({ok:true});}catch(err){console.error('Falha ao excluir ocorrência',id,err);res.status(500).json({error:'Não foi possível excluir todos os arquivos. Tente novamente.'});}});
app.get('/api/attachments/:id',auth,(req,res)=>{const f=db.prepare('SELECT a.*,o.market_id FROM attachments a JOIN occurrences o ON o.id=a.occurrence_id WHERE a.id=?').get(req.params.id);if(!f||!access(req.user,f.market_id))return res.status(404).json({error:'Arquivo não encontrado'});res.set({'Content-Type':f.mime,'Content-Disposition':`inline; filename="arquivo-${f.id}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.sendFile(path.resolve(base,'uploads',f.stored_name));});
app.use('/api',(req,res)=>res.status(404).json({error:'Rota não encontrada'}));
const dist=path.resolve('dist');if(fs.existsSync(dist)){app.use(express.static(dist));app.get('*',(_,res)=>res.sendFile(path.join(dist,'index.html')));}
app.use((err,req,res,next)=>res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({error:err.code==='LIMIT_FILE_SIZE'?'Arquivo excede 100 MB':'Falha ao processar solicitação'}));
app.listen(process.env.PORT||3000,()=>console.log('ProtVig em execução na porta '+(process.env.PORT||3000)));
