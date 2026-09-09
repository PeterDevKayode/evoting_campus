import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const dataDirectory = process.env.DATA_DIR || __dirname
fs.mkdirSync(dataDirectory, { recursive: true })
const db = new Database(path.join(dataDirectory, 'campusvote.sqlite'))
const PORT = Number(process.env.PORT) || 5000
const adminUsername = process.env.ADMIN_USERNAME || 'admin'
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
const sessionLifetimeMs = 1000 * 60 * 60 * 12
const loginAttempts = new Map()
const officeOptions = [
  'Departmental President',
  'Vice President',
  'Treasurer',
  'Welfare Director',
  'Class Governor'
]
const classLevels = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level']

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || ['http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true }))
app.use(express.json())
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
  CREATE TABLE IF NOT EXISTS voters (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, department_id INTEGER NOT NULL, class_level TEXT, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (department_id) REFERENCES departments(id));
  CREATE TABLE IF NOT EXISTS elections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, department_id INTEGER NOT NULL, office_name TEXT NOT NULL DEFAULT 'Departmental President', class_level TEXT, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, FOREIGN KEY (department_id) REFERENCES departments(id));
  CREATE TABLE IF NOT EXISTS candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, election_id INTEGER NOT NULL, full_name TEXT NOT NULL, slogan TEXT, FOREIGN KEY (election_id) REFERENCES elections(id));
  CREATE TABLE IF NOT EXISTS votes (id INTEGER PRIMARY KEY AUTOINCREMENT, election_id INTEGER NOT NULL, candidate_id INTEGER NOT NULL, cast_at TEXT NOT NULL, FOREIGN KEY (election_id) REFERENCES elections(id), FOREIGN KEY (candidate_id) REFERENCES candidates(id));
  CREATE TABLE IF NOT EXISTS ballots_cast (id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id INTEGER NOT NULL, election_id INTEGER NOT NULL, cast_at TEXT NOT NULL, UNIQUE(voter_id, election_id), FOREIGN KEY (voter_id) REFERENCES voters(id), FOREIGN KEY (election_id) REFERENCES elections(id));
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT NOT NULL, user_id INTEGER, display_name TEXT, username TEXT, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, role TEXT, user_id INTEGER, created_at TEXT NOT NULL);
`)

const ensureColumn = (table, column, type) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((columnInfo) => columnInfo.name)
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

ensureColumn('voters', 'class_level', 'TEXT')
ensureColumn('elections', 'office_name', "TEXT NOT NULL DEFAULT 'Departmental President'")
ensureColumn('elections', 'class_level', 'TEXT')

const normalizeOfficeName = (value) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  const match = officeOptions.find((option) => option.toLowerCase() === trimmed.toLowerCase())
  return match || trimmed
}

const electionTitleFrom = (officeName, classLevel) => {
  const office = normalizeOfficeName(officeName)
  if (!office) return 'Election'
  if (office === 'Class Governor' && classLevel) return `${office} - ${classLevel}`
  return office
}

const hash = (value) => {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${crypto.scryptSync(value, salt, 64).toString('hex')}`
}

const verify = (value, stored) => {
  if (!stored?.includes(':')) return false
  const [salt, key] = stored.split(':')
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), crypto.scryptSync(value, salt, 64))
}

const now = () => new Date().toISOString()
const password = () => [...Array(8)].map(() => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('')
const send = (res, body, status = 200) => res.status(status).json(body)
const tokenFrom = (req) => req.headers.authorization?.replace('Bearer ', '')

const query = (sql, params = []) => {
  const statement = db.prepare(sql)
  return Array.isArray(params) ? statement.all(...params) : statement.all(params)
}

const sessionUser = (req) => {
  const token = tokenFrom(req)
  if (!token) return null

  const session = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token, now())
  if (!session) return null

  if (session.role === 'admin') {
    return { role: 'admin', username: session.username }
  }

  const voter = db.prepare('SELECT * FROM voters WHERE id=?').get(session.user_id)

  return {
    role: 'voter',
    name: session.display_name,
    voterId: session.user_id,
    classLevel: voter?.class_level || null
  }
}

const requireRole = (role) => (req, res, next) => sessionUser(req)?.role === role ? next() : send(res, { error: `${role} login required` }, 401)
const audit = (action, user) => db.prepare('INSERT INTO audit_log(action,role,user_id,created_at) VALUES (?,?,?,?)').run(action, user?.role || null, user?.voterId || null, now())

const loginKey = (req, role) => `${req.ip}:${role}`
const loginBlocked = (req, role) => {
  const attempt = loginAttempts.get(loginKey(req, role))
  return attempt && attempt.count >= 5 && Date.now() - attempt.startedAt < 15 * 60 * 1000
}

const recordLoginFailure = (req, role) => {
  const key = loginKey(req, role)
  const attempt = loginAttempts.get(key)

  if (!attempt || Date.now() - attempt.startedAt >= 15 * 60 * 1000) {
    loginAttempts.set(key, { count: 1, startedAt: Date.now() })
  } else {
    attempt.count += 1
  }
}

if (!db.prepare('SELECT 1 FROM admin LIMIT 1').get()) {
  db.prepare('INSERT INTO admin (username,password_hash) VALUES (?,?)').run(adminUsername, hash(adminPassword))
}

if (!process.env.ADMIN_PASSWORD) {
  console.warn('ADMIN_PASSWORD is not set; using the development default. Set it before public deployment.')
}

const defaultDepartments = ['Computer science', 'Mass communication', 'Library and Information']
const addDepartment = db.prepare('INSERT OR IGNORE INTO departments(name) VALUES (?)')
for (const department of defaultDepartments) addDepartment.run(department)

app.get('/api/session', (req, res) => send(res, sessionUser(req) || { role: null }))

app.post('/api/auth/:role/login', (req, res) => {
  const { role } = req.params
  const data = req.body || {}

  if (!['admin', 'voter'].includes(role)) {
    return send(res, { error: 'Invalid login role' }, 400)
  }

  if (loginBlocked(req, role)) {
    return send(res, { error: 'Too many attempts. Try again later.' }, 429)
  }

  const account = role === 'admin'
    ? db.prepare('SELECT * FROM admin WHERE username=?').get((data.username || '').trim())
    : db.prepare('SELECT * FROM voters WHERE voter_id=?').get((data.voter_id || '').trim())

  if (!account || !verify(data.password || '', account.password_hash)) {
    recordLoginFailure(req, role)
    return send(res, { error: 'Incorrect credentials' }, 401)
  }

  const token = crypto.randomBytes(24).toString('hex')
  const user = role === 'admin'
    ? { role, username: account.username }
    : { role, name: account.full_name, voterId: account.id, classLevel: account.class_level }

  db.prepare('INSERT INTO sessions(token,role,user_id,display_name,username,expires_at) VALUES (?,?,?,?,?,?)').run(
    token,
    role,
    role === 'voter' ? account.id : null,
    role === 'voter' ? account.full_name : null,
    role === 'admin' ? account.username : null,
    new Date(Date.now() + sessionLifetimeMs).toISOString()
  )

  loginAttempts.delete(loginKey(req, role))
  audit('login', user)
  send(res, { ...user, token })
})

app.post('/api/auth/logout', (req, res) => {
  const currentSession = sessionUser(req)
  db.prepare('DELETE FROM sessions WHERE token=?').run(tokenFrom(req))
  audit('logout', currentSession)
  send(res, { ok: true })
})

app.get('/api/admin/overview', requireRole('admin'), (req, res) => {
  const stats = {
    departments: db.prepare('SELECT COUNT(*) c FROM departments').get().c,
    voters: db.prepare('SELECT COUNT(*) c FROM voters').get().c,
    active: db.prepare("SELECT COUNT(*) c FROM elections WHERE status='active'").get().c,
    ballots: db.prepare('SELECT COUNT(*) c FROM ballots_cast').get().c
  }

  const elections = query(`
    SELECT e.*, d.name department_name,
      (SELECT COUNT(*) FROM candidates c WHERE c.election_id=e.id) candidate_count,
      (SELECT COUNT(*) FROM ballots_cast b WHERE b.election_id=e.id) votes_count
    FROM elections e
    JOIN departments d ON d.id=e.department_id
    ORDER BY e.created_at DESC
  `)

  send(res, {
    stats,
    elections,
    departments: query('SELECT * FROM departments ORDER BY name'),
    officeOptions,
    classLevels
  })
})

app.get('/api/admin/voters', requireRole('admin'), (req, res) => {
  send(res, {
    voters: query(`
      SELECT v.*, d.name department_name
      FROM voters v
      JOIN departments d ON d.id=v.department_id
      ORDER BY v.created_at DESC
    `),
    departments: query('SELECT * FROM departments ORDER BY name'),
    classLevels
  })
})

app.post('/api/admin/departments', requireRole('admin'), (req, res) => {
  try {
    db.prepare('INSERT INTO departments(name) VALUES (?)').run((req.body.name || '').trim())
    send(res, { ok: true })
  } catch {
    send(res, { error: 'Department already exists' }, 409)
  }
})

app.post('/api/admin/elections', requireRole('admin'), (req, res) => {
  const body = req.body || {}
  const officeName = normalizeOfficeName(body.office_name)
  const classLevel = (body.class_level || '').trim()

  if (!officeName) {
    return send(res, { error: 'Office is required' }, 400)
  }

  if (officeName === 'Class Governor' && !classLevel) {
    return send(res, { error: 'Class level is required for Class Governor elections' }, 400)
  }

  const title = (body.title || '').trim() || electionTitleFrom(officeName, classLevel)

  try {
    db.prepare(`
      INSERT INTO elections(title, department_id, office_name, class_level, status, created_at)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `).run(
      title,
      Number(body.department_id),
      officeName,
      officeName === 'Class Governor' ? classLevel : null,
      now()
    )

    send(res, { ok: true })
  } catch {
    send(res, { error: 'Unable to create election' }, 500)
  }
})

app.post('/api/admin/elections/:id/status', requireRole('admin'), (req, res) => {
  db.prepare('UPDATE elections SET status=? WHERE id=?').run(req.body.status, req.params.id)
  send(res, { ok: true })
})

app.get('/api/admin/elections/:id', requireRole('admin'), (req, res) => {
  const election = db.prepare(`
    SELECT e.*, d.name department_name
    FROM elections e
    JOIN departments d ON d.id=e.department_id
    WHERE e.id=?
  `).get(req.params.id)

  const candidates = query('SELECT * FROM candidates WHERE election_id=? ORDER BY full_name', [req.params.id])
  send(res, { election, candidates })
})

app.post('/api/admin/elections/:id/candidates', requireRole('admin'), (req, res) => {
  const body = req.body || {}
  const fullName = (body.full_name || '').trim()

  if (!fullName) {
    return send(res, { error: 'Candidate name is required' }, 400)
  }

  db.prepare('INSERT INTO candidates(election_id,full_name,slogan) VALUES (?,?,?)').run(
    req.params.id,
    fullName,
    (body.slogan || '').trim()
  )

  send(res, { ok: true })
})

app.get('/api/admin/elections/:id/results', requireRole('admin'), (req, res) => {
  const result = query(`
    SELECT c.id, c.full_name, c.slogan,
      (SELECT COUNT(*) FROM votes v WHERE v.candidate_id=c.id) vote_count
    FROM candidates c
    WHERE c.election_id=?
    ORDER BY vote_count DESC, c.full_name
  `, [req.params.id])

  send(res, {
    results: result,
    total_votes: result.reduce((sum, item) => sum + item.vote_count, 0)
  })
})

app.post('/api/admin/voters', requireRole('admin'), (req, res) => {
  const generated = password()
  const body = req.body || {}
  const voterId = (body.voter_id || '').trim()
  const fullName = (body.full_name || '').trim()
  const departmentId = Number(body.department_id)
  const classLevel = (body.class_level || '').trim() || null

  if (!voterId || !fullName || !departmentId) {
    return send(res, { error: 'Please complete all voter details' }, 400)
  }

  try {
    db.prepare('INSERT INTO voters(voter_id,full_name,department_id,class_level,password_hash,created_at) VALUES (?,?,?,?,?,?)').run(
      voterId,
      fullName,
      departmentId,
      classLevel,
      hash(generated),
      now()
    )
    send(res, { ok: true, password: generated })
  } catch {
    send(res, { error: 'That voter ID already exists' }, 409)
  }
})

app.get('/api/voter/ballot', requireRole('voter'), (req, res) => {
  const voter = db.prepare(`
    SELECT v.*, d.name department_name
    FROM voters v
    JOIN departments d ON d.id=v.department_id
    WHERE v.id=?
  `).get(sessionUser(req).voterId)

  const activeElections = query(`
    SELECT e.*, d.name department_name
    FROM elections e
    JOIN departments d ON d.id=e.department_id
    WHERE e.department_id=? AND e.status='active'
    ORDER BY e.created_at DESC
  `, [voter.department_id])

  const visibleElections = activeElections.filter((election) => {
    if (election.office_name !== 'Class Governor') return true
    return election.class_level === voter.class_level
  })

  const elections = visibleElections.map((election) => {
    const candidates = query('SELECT * FROM candidates WHERE election_id=? ORDER BY full_name', [election.id])
    const alreadyVoted = Boolean(db.prepare('SELECT 1 FROM ballots_cast WHERE voter_id=? AND election_id=?').get(voter.id, election.id))

    return {
      ...election,
      alreadyVoted,
      candidates
    }
  })

  send(res, { voter, elections })
})

app.post('/api/voter/vote', requireRole('voter'), (req, res) => {
  const voter = db.prepare('SELECT * FROM voters WHERE id=?').get(sessionUser(req).voterId)
  const candidate = db.prepare(`
    SELECT c.*, e.status, e.department_id, e.office_name, e.class_level, e.id AS election_id
    FROM candidates c
    JOIN elections e ON e.id=c.election_id
    WHERE c.id=?
  `).get(req.body.candidate_id)

  if (!candidate) {
    return send(res, { error: 'That candidate was not found' }, 400)
  }

  if (candidate.department_id !== voter.department_id) {
    return send(res, { error: 'That ballot is not available for your department' }, 400)
  }

  if (candidate.status !== 'active') {
    return send(res, { error: 'That ballot is no longer available' }, 400)
  }

  if (candidate.office_name === 'Class Governor' && candidate.class_level !== voter.class_level) {
    return send(res, { error: 'That class governor ballot is not available for your class level' }, 400)
  }

  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO ballots_cast(voter_id,election_id,cast_at) VALUES (?,?,?)').run(voter.id, candidate.election_id, now())
    db.prepare('INSERT INTO votes(election_id,candidate_id,cast_at) VALUES (?,?,?)').run(candidate.election_id, candidate.id, now())
  })

  try {
    transaction()
    audit('vote_cast', sessionUser(req))
    send(res, { ok: true })
  } catch {
    send(res, { error: 'You have already voted in this election' }, 409)
  }
})

app.use(express.static(path.join(__dirname, 'dist')))
app.use((req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(__dirname, 'dist', 'index.html')))

app.listen(PORT, () => console.log(`CampusVote API listening on http://127.0.0.1:${PORT}`))
