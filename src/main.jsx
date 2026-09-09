import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, BarChart3, Check, ChevronRight, CircleUserRound, ClipboardList, Landmark, LogOut, Plus, ShieldCheck, Trophy, Users, Vote } from 'lucide-react'
import './styles.css'

const api = async (path, options = {}) => {
    const token = localStorage.getItem('campus-token')
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } })
    const data = await response.json()
    if (response.status === 401) localStorage.removeItem('campus-token')
    if (!response.ok) throw new Error(data.error || 'Something went wrong')
    return data
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })

function App() {
    const [user, setUser] = useState(null)
    const [screen, setScreen] = useState('home')
    const [notice, setNotice] = useState('')

    useEffect(() => {
        api('/api/session').then((session) => {
            setUser(session.role ? session : null)
            if (session.role === 'admin') setScreen('admin')
            if (session.role === 'voter') setScreen('voter')
        }).catch(() => { })
    }, [])

    const login = async (role, data) => {
        const result = await post(`/api/auth/${role}/login`, data)
        localStorage.setItem('campus-token', result.token)
        setUser(result)
        setScreen(role)
    }

    const logout = async () => {
        await post('/api/auth/logout', {})
        localStorage.removeItem('campus-token')
        setUser(null)
        setScreen('home')
    }

    return (
        <div className="app-shell">
            <header className="topbar">
                <button className="brand" onClick={() => setScreen('home')}>
                    <span className="brand-mark"><Landmark size={17} /></span>
                    Campus<span>Vote</span>
                </button>
                <div className="top-actions">
                    {user?.role === 'admin' && (
                        <button className="quiet-button" onClick={() => setScreen('admin')}>
                            <BarChart3 size={16} /> Control room
                        </button>
                    )}
                    {user?.role === 'voter' && (
                        <button className="quiet-button" onClick={() => setScreen('voter')}>
                            <Vote size={16} /> My ballot
                        </button>
                    )}
                    {user && (
                        <button className="icon-button" title="Log out" onClick={logout}>
                            <LogOut size={18} />
                        </button>
                    )}
                </div>
            </header>

            {notice && <div className="notice">{notice}</div>}

            {screen === 'home' && <Home onVoter={() => setScreen('voter-login')} onAdmin={() => setScreen('admin-login')} />}
            {screen === 'voter-login' && <Login role="voter" onLogin={login} onBack={() => setScreen('home')} />}
            {screen === 'admin-login' && <Login role="admin" onLogin={login} onBack={() => setScreen('home')} />}
            {screen === 'voter' && user?.role === 'voter' && <VoterBallot onNotice={setNotice} />}
            {screen === 'admin' && user?.role === 'admin' && <Admin onNotice={setNotice} />}
        </div>
    )
}

function Home({ onVoter, onAdmin }) {
    const [role, setRole] = useState('voter')
    const voterSelected = role === 'voter'

    return (
        <main className="home-screen">
            <section className="hero interactive-hero">
                <div className="hero-copy">
                    <div className="eyebrow-row">
                        <span className="live-dot" /> Election access portal <span className="year-label">2026</span>
                    </div>
                    <h1>
                        Make your voice<br />
                        <em>official.</em>
                    </h1>
                    <p className="hero-lede">
                        Manage multi-office campus elections, monitor live results, and let voters access only the ballots meant for their department and class.
                    </p>

                    <div className="role-switcher" aria-label="Choose your access type">
                        <button className={`role-card ${voterSelected ? 'selected' : ''}`} onClick={() => setRole('voter')}>
                            <span className="role-icon"><Vote size={21} /></span>
                            <span>
                                <strong>Cast a ballot</strong>
                                <small>For registered voters</small>
                            </span>
                            <ChevronRight size={18} />
                        </button>
                        <button className={`role-card ${!voterSelected ? 'selected' : ''}`} onClick={() => setRole('admin')}>
                            <span className="role-icon admin-icon"><ShieldCheck size={21} /></span>
                            <span>
                                <strong>Run an election</strong>
                                <small>For election administrators</small>
                            </span>
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    <button className="primary-button launch-button" onClick={voterSelected ? onVoter : onAdmin}>
                        {voterSelected ? 'Enter my ballot' : 'Open admin control room'} <ArrowRight size={17} />
                    </button>
                </div>

                <div className={`interactive-art ${voterSelected ? 'voter-mode' : 'admin-mode'}`}>
                    <div className="art-grid" />
                    <div className="art-label">{voterSelected ? 'VOTER PORTAL' : 'ADMIN CONSOLE'}</div>
                    <div className="orbit orbit-a" />
                    <div className="orbit orbit-b" />
                    <div className="access-badge">
                        {voterSelected ? <Vote size={34} /> : <ShieldCheck size={34} />}
                        <strong>{voterSelected ? 'READY TO VOTE' : 'CONTROL ROOM'}</strong>
                        <small>{voterSelected ? 'ONE VERIFIED BALLOT' : 'ELECTION OPERATIONS'}</small>
                    </div>
                    <div className="art-footer">
                        <span>STATUS</span>
                        <strong><i /> SECURE</strong>
                    </div>
                </div>
            </section>

            <section className="principles">
                <div>
                    <span className="number">01</span>
                    <h3>Verified access</h3>
                    <p>Only registered voters with a one-time passcode can enter.</p>
                </div>
                <div>
                    <span className="number">02</span>
                    <h3>Office-specific ballots</h3>
                    <p>Run departmental president, vice president, treasurer, welfare director, and class governor elections side by side.</p>
                </div>
                <div>
                    <span className="number">03</span>
                    <h3>Live results</h3>
                    <p>Watch votes update in real time as ballots are cast and monitor totals per office.</p>
                </div>
            </section>
        </main>
    )
}

function Login({ role, onLogin, onBack }) {
    const [form, setForm] = useState({})
    const [error, setError] = useState('')

    const submit = async (event) => {
        event.preventDefault()
        try {
            await onLogin(role, form)
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <main className="center-stage">
            <form className="login-panel" onSubmit={submit}>
                <button type="button" className="back-link" onClick={onBack}>Back home</button>
                <span className="panel-icon">{role === 'admin' ? <ShieldCheck /> : <CircleUserRound />}</span>
                <p className="kicker">{role === 'admin' ? 'Election administration' : 'Secure voter access'}</p>
                <h1>{role === 'admin' ? 'Welcome back, admin.' : 'Find your ballot.'}</h1>
                <p className="muted">
                    {role === 'admin'
                        ? 'Manage departments, voters, elections, candidates, and live results.'
                        : 'Use the credentials issued by your electoral committee.'}
                </p>

                {role === 'admin' ? (
                    <Field label="Username" name="username" value={form.username} setForm={setForm} />
                ) : (
                    <Field label="Voter ID" name="voter_id" value={form.voter_id} setForm={setForm} />
                )}

                <Field label="Password" name="password" type="password" value={form.password} setForm={setForm} />

                {error && <div className="error">{error}</div>}
                <button className="primary-button wide">Continue <ArrowRight size={17} /></button>
            </form>
        </main>
    )
}

function Field({ label, name, type = 'text', value, setForm, options = null }) {
    return (
        <label className="field">
            <span>{label}</span>
            {options ? (
                <select required value={value || ''} onChange={(e) => setForm((current) => ({ ...current, [name]: e.target.value }))}>
                    <option value="">Choose</option>
                    {options.map((option) => (
                        <option key={option.value ?? option} value={option.value ?? option}>
                            {option.label ?? option}
                        </option>
                    ))}
                </select>
            ) : (
                <input required type={type} value={value || ''} onChange={(e) => setForm((current) => ({ ...current, [name]: e.target.value }))} />
            )}
        </label>
    )
}

function VoterBallot({ onNotice }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [selected, setSelected] = useState({})

    const refresh = async () => {
        try {
            const result = await api('/api/voter/ballot')
            setData(result)
            setError('')
        } catch (err) {
            setError(err.message)
        }
    }

    useEffect(() => {
        refresh()
    }, [])

    const submitVote = async (electionId) => {
        const candidateId = selected[electionId]
        if (!candidateId) return

        try {
            await post('/api/voter/vote', { candidate_id: candidateId })
            onNotice('Your anonymous ballot was submitted.')
            refresh()
        } catch (err) {
            setError(err.message)
        }
    }

    if (error) {
        return (
            <main className="center-stage">
                <div className="empty-panel">
                    <h2>{error}</h2>
                    <p>Sign out and try again with your issued voter credentials.</p>
                </div>
            </main>
        )
    }

    if (!data) {
        return (
            <main className="center-stage">
                <p className="muted">Loading your ballot...</p>
            </main>
        )
    }

    return (
        <main className="ballot-page">
            <div className="section-heading">
                <div>
                    <p className="kicker">Voter portal</p>
                    <h1>{data.voter.full_name}</h1>
                    <p className="muted">Department: {data.voter.department_name}. Class: {data.voter.class_level || 'N/A'}.</p>
                </div>
            </div>

            <div className="ballot-list">
                {data.elections.length === 0 ? (
                    <div className="empty-panel">
                        <span className="panel-icon"><ClipboardList /></span>
                        <h1>No active ballots yet.</h1>
                        <p>There are no open elections for your department and class at the moment.</p>
                    </div>
                ) : (
                    data.elections.map((election) => (
                        <section className="ballot-card" key={election.id}>
                            <div className="card-topline">
                                <span>{election.department_name}</span>
                                <span>{election.office_name}</span>
                            </div>

                            <div className="ballot-title-row">
                                <div>
                                    <h2>{election.title}</h2>
                                    {election.class_level && <small>Class governor for {election.class_level}</small>}
                                </div>
                                <span className={`status-badge ${election.status}`}>{election.status}</span>
                            </div>

                            {election.alreadyVoted ? (
                                <div className="success-box">
                                    <Check size={18} />
                                    Ballot already submitted for this election.
                                </div>
                            ) : (
                                <>
                                    <div className="candidate-stack">
                                        {election.candidates.map((candidate) => (
                                            <label className={`candidate-option ${selected[election.id] === String(candidate.id) ? 'checked' : ''}`} key={candidate.id}>
                                                <input
                                                    type="radio"
                                                    name={`candidate-${election.id}`}
                                                    value={candidate.id}
                                                    checked={selected[election.id] === String(candidate.id)}
                                                    onChange={() => setSelected((current) => ({ ...current, [election.id]: String(candidate.id) }))}
                                                />
                                                <div>
                                                    <div className="candidate-name">{candidate.full_name}</div>
                                                    {candidate.slogan && <div className="candidate-slogan">{`"${candidate.slogan}"`}</div>}
                                                </div>
                                            </label>
                                        ))}
                                    </div>

                                    <button className="primary-button wide" onClick={() => submitVote(election.id)} disabled={!selected[election.id]}>
                                        Submit ballot
                                    </button>
                                </>
                            )}
                        </section>
                    ))
                )}
            </div>
        </main>
    )
}

function Admin({ onNotice }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [tab, setTab] = useState('overview')
    const [selectedElectionId, setSelectedElectionId] = useState(null)
    const [detail, setDetail] = useState(null)
    const [results, setResults] = useState(null)
    const [candidateForm, setCandidateForm] = useState({})

    const refresh = async () => {
        try {
            const result = await api('/api/admin/overview')
            setData(result)
            setError('')
            if (!selectedElectionId && result.elections.length) {
                setSelectedElectionId(result.elections[0].id)
            }
        } catch (err) {
            setError(err.message)
        }
    }

    const loadElectionDetail = async (id) => {
        try {
            const nextDetail = await api(`/api/admin/elections/${id}`)
            const nextResults = await api(`/api/admin/elections/${id}/results`)
            setDetail(nextDetail)
            setResults(nextResults)
        } catch (err) {
            setError(err.message)
        }
    }

    useEffect(() => {
        refresh()
    }, [])

    useEffect(() => {
        if (!selectedElectionId || !data) return
        const selectedStillExists = data.elections.some((election) => election.id === selectedElectionId)
        if (!selectedStillExists) {
            setSelectedElectionId(data.elections[0]?.id ?? null)
            return
        }

        loadElectionDetail(selectedElectionId)
    }, [selectedElectionId, data])

    const updateStatus = async (id, status) => {
        try {
            await post(`/api/admin/elections/${id}/status`, { status })
            onNotice(`Election ${status === 'active' ? 'opened' : 'closed'}.`)
            refresh()
        } catch (err) {
            setError(err.message)
        }
    }

    const addCandidate = async (electionId) => {
        const fullName = (candidateForm[electionId]?.full_name || '').trim()
        if (!fullName) {
            setError('Candidate name is required')
            return
        }

        try {
            await post(`/api/admin/elections/${electionId}/candidates`, {
                full_name: fullName,
                slogan: candidateForm[electionId]?.slogan || ''
            })
            setCandidateForm((current) => ({ ...current, [electionId]: { full_name: '', slogan: '' } }))
            onNotice('Candidate added successfully.')
            refresh()
        } catch (err) {
            setError(err.message)
        }
    }

    if (error && !data) {
        return (
            <main className="center-stage">
                <div className="empty-panel">
                    <span className="panel-icon"><ShieldCheck /></span>
                    <p className="kicker">Control room unavailable</p>
                    <h1>{error}</h1>
                    <p className="muted">Your session may have expired. Return home and sign in again.</p>
                    <button className="primary-button" onClick={() => window.location.reload()}>Try again <ArrowRight size={17} /></button>
                </div>
            </main>
        )
    }

    if (!data) {
        return <main className="center-stage"><p className="muted">Loading control room...</p></main>
    }

    return (
        <main className="admin-page">
            <div className="admin-header">
                <div>
                    <p className="kicker">Electoral administration</p>
                    <h1>Admin dashboard</h1>
                    <p className="muted">Create elections for each office, add candidates, register voters, and track results live.</p>
                </div>
                <button className="primary-button" onClick={() => setTab('overview')}>
                    <Plus size={17} /> New election
                </button>
            </div>

            <div className="stat-grid">
                <Stat icon={<Landmark />} label="Departments" value={data.stats.departments} />
                <Stat icon={<Users />} label="Registered voters" value={data.stats.voters} />
                <Stat icon={<Vote />} label="Open elections" value={data.stats.active} />
                <Stat icon={<BarChart3 />} label="Ballots cast" value={data.stats.ballots} />
            </div>

            <div className="vstack">
                <nav className="admin-tabs">
                    <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
                    <button className={tab === 'voters' ? 'active' : ''} onClick={() => setTab('voters')}>Voters</button>
                    <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Results</button>
                </nav>

                {tab === 'overview' && (
                    <div className="admin-grid">
                        <div className="panel">
                            <div className="panel-header">
                                <div>
                                    <p className="kicker">Election setup</p>
                                    <h2>Public office elections</h2>
                                </div>
                            </div>

                            <ElectionCreator
                                departments={data.departments}
                                officeOptions={data.officeOptions}
                                classLevels={data.classLevels}
                                onCreate={async (form) => {
                                    await post('/api/admin/elections', form)
                                    onNotice('Election created.')
                                    setTab('overview')
                                    refresh()
                                }}
                            />

                            <div className="panel-divider" />

                            <div className="list-wrap">
                                {data.elections.map((election) => (
                                    <div key={election.id} className={`election-card ${selectedElectionId === election.id ? 'selected' : ''}`}>
                                        <button className="select-button" onClick={() => setSelectedElectionId(election.id)}>
                                            <div className="election-main">
                                                <div className="election-badge"><Trophy size={16} /></div>
                                                <div>
                                                    <strong>{election.title}</strong>
                                                    <small>{election.department_name}</small>
                                                </div>
                                            </div>
                                            <div className="election-meta">
                                                <span className="pill">{election.office_name}</span>
                                                {election.class_level && <span className="pill secondary">{election.class_level}</span>}
                                            </div>
                                        </button>

                                        <div className="election-compact-stats">
                                            <span><strong>{election.candidate_count}</strong> candidates</span>
                                            <span><strong>{election.votes_count}</strong> ballots</span>
                                            <span className={`status-badge ${election.status}`}>{election.status}</span>
                                        </div>

                                        <div className="election-actions">
                                            <button className="outline-button" onClick={() => updateStatus(election.id, election.status === 'active' ? 'closed' : 'active')}>
                                                {election.status === 'active' ? 'Close election' : 'Open election'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="panel split-panel">
                            <div className="panel-header">
                                <div>
                                    <p className="kicker">Election details</p>
                                    <h2>{detail?.election ? detail.election.title : 'Choose an election'}</h2>
                                </div>
                            </div>

                            {detail?.election ? (
                                <>
                                    <div className="detail-summary">
                                        <div>
                                            <span>Department</span>
                                            <strong>{detail.election.department_name}</strong>
                                        </div>
                                        <div>
                                            <span>Office</span>
                                            <strong>{detail.election.office_name}</strong>
                                        </div>
                                        <div>
                                            <span>Class</span>
                                            <strong>{detail.election.class_level || 'All classes'}</strong>
                                        </div>
                                    </div>

                                    <div className="panel-divider" />

                                    <div className="candidate-adder">
                                        <h3>Add candidate</h3>
                                        <div className="inline-form-grid">
                                            <input
                                                placeholder="Candidate full name"
                                                value={candidateForm[detail.election.id]?.full_name || ''}
                                                onChange={(e) => setCandidateForm((current) => ({
                                                    ...current,
                                                    [detail.election.id]: {
                                                        ...(current[detail.election.id] || {}),
                                                        full_name: e.target.value
                                                    }
                                                }))}
                                            />
                                            <input
                                                placeholder="Campaign slogan"
                                                value={candidateForm[detail.election.id]?.slogan || ''}
                                                onChange={(e) => setCandidateForm((current) => ({
                                                    ...current,
                                                    [detail.election.id]: {
                                                        ...(current[detail.election.id] || {}),
                                                        slogan: e.target.value
                                                    }
                                                }))}
                                            />
                                        </div>
                                        <button className="primary-button" onClick={() => addCandidate(detail.election.id)}>
                                            Add candidate
                                        </button>
                                    </div>

                                    <div className="panel-divider" />

                                    <div className="candidate-list">
                                        <h3>Registered candidates</h3>
                                        {detail.candidates.length === 0 ? (
                                            <p className="muted">No candidates have been added yet.</p>
                                        ) : (
                                            detail.candidates.map((candidate) => (
                                                <div className="candidate-row" key={candidate.id}>
                                                    <div>
                                                        <strong>{candidate.full_name}</strong>
                                                        {candidate.slogan && <small>{candidate.slogan}</small>}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="muted">Select an election to see candidates and live results.</p>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'voters' && (
                    <VoterList onNotice={onNotice} />
                )}

                {tab === 'results' && (
                    <ResultsPanel
                        elections={data.elections}
                        results={results}
                        selectedElectionId={selectedElectionId}
                        onSelect={setSelectedElectionId}
                    />
                )}
            </div>
        </main>
    )
}

function ElectionCreator({ departments, officeOptions, classLevels, onCreate }) {
    const [form, setForm] = useState({ office_name: officeOptions[0] || 'Departmental President', department_id: '', class_level: '' })
    const currentOffice = form.office_name || officeOptions[0]

    return (
        <form className="panel-form" onSubmit={(event) => {
            event.preventDefault()
            onCreate(form)
        }}>
            <div className="inline-form-grid">
                <input
                    placeholder="Election title (optional)"
                    value={form.title || ''}
                    onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                />

                <select
                    value={form.department_id || ''}
                    onChange={(e) => setForm((current) => ({ ...current, department_id: e.target.value }))}
                    required
                >
                    <option value="">Choose department</option>
                    {departments.map((department) => (
                        <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                </select>

                <select
                    value={currentOffice}
                    onChange={(e) => setForm((current) => ({ ...current, office_name: e.target.value, class_level: e.target.value === 'Class Governor' ? current.class_level || classLevels[0] : '' }))}
                    required
                >
                    {officeOptions.map((office) => (
                        <option key={office} value={office}>{office}</option>
                    ))}
                </select>

                {currentOffice === 'Class Governor' && (
                    <select
                        value={form.class_level || ''}
                        onChange={(e) => setForm((current) => ({ ...current, class_level: e.target.value }))}
                        required
                    >
                        <option value="">Choose class level</option>
                        {classLevels.map((level) => (
                            <option key={level} value={level}>{level}</option>
                        ))}
                    </select>
                )}
            </div>

            <button className="primary-button">Create election</button>
        </form>
    )
}

function VoterList({ onNotice }) {
    const [data, setData] = useState(null)
    const [form, setForm] = useState({ department_id: '', class_level: '' })
    const [password, setPassword] = useState('')

    const refresh = async () => {
        const result = await api('/api/admin/voters')
        setData(result)
    }

    useEffect(() => {
        refresh()
    }, [])

    const submit = async (event) => {
        event.preventDefault()
        const result = await post('/api/admin/voters', form)
        setPassword(result.password)
        setForm({ department_id: '', class_level: '' })
        refresh()
        onNotice('Voter registered. Share the generated passcode securely.')
    }

    if (!data) {
        return <p className="muted">Loading voters...</p>
    }

    return (
        <div className="admin-grid">
            <div className="panel">
                <div className="panel-header">
                    <div>
                        <p className="kicker">Registration</p>
                        <h2>Register a voter</h2>
                    </div>
                </div>

                <form className="panel-form" onSubmit={submit}>
                    <div className="inline-form-grid">
                        <input
                            placeholder="Voter ID"
                            value={form.voter_id || ''}
                            onChange={(e) => setForm((current) => ({ ...current, voter_id: e.target.value }))}
                            required
                        />
                        <input
                            placeholder="Full name"
                            value={form.full_name || ''}
                            onChange={(e) => setForm((current) => ({ ...current, full_name: e.target.value }))}
                            required
                        />
                        <select
                            value={form.department_id || ''}
                            onChange={(e) => setForm((current) => ({ ...current, department_id: e.target.value }))}
                            required
                        >
                            <option value="">Choose department</option>
                            {data.departments.map((department) => (
                                <option key={department.id} value={department.id}>{department.name}</option>
                            ))}
                        </select>
                        <select
                            value={form.class_level || ''}
                            onChange={(e) => setForm((current) => ({ ...current, class_level: e.target.value }))}
                        >
                            <option value="">Choose class level (optional)</option>
                            {data.classLevels.map((level) => (
                                <option key={level} value={level}>{level}</option>
                            ))}
                        </select>
                    </div>

                    <button className="primary-button">Register voter</button>
                </form>

                {password && (
                    <div className="credential-box">
                        <small>Generated password</small>
                        <strong>{password}</strong>
                    </div>
                )}
            </div>

            <div className="panel">
                <div className="panel-header">
                    <div>
                        <p className="kicker">Roster</p>
                        <h2>Registered voters</h2>
                    </div>
                </div>

                <div className="list-wrap">
                    {data.voters.map((voter) => (
                        <div className="voter-row" key={voter.id}>
                            <span className="avatar">{voter.full_name.slice(0, 1)}</span>
                            <div>
                                <strong>{voter.full_name}</strong>
                                <small>{voter.voter_id} · {voter.department_name} · {voter.class_level || 'No class specified'}</small>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function ResultsPanel({ elections, results, selectedElectionId, onSelect }) {
    const selectedElection = elections.find((election) => election.id === selectedElectionId)

    return (
        <div className="admin-grid">
            <div className="panel">
                <div className="panel-header">
                    <div>
                        <p className="kicker">Monitoring</p>
                        <h2>Live election results</h2>
                    </div>
                </div>

                <div className="list-wrap compact">
                    {elections.map((election) => (
                        <button key={election.id} className={`result-choice ${selectedElectionId === election.id ? 'selected' : ''}`} onClick={() => onSelect(election.id)}>
                            <div>
                                <strong>{election.title}</strong>
                                <small>{election.department_name}</small>
                            </div>
                            <span className="status-badge active">{election.votes_count} votes</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="panel">
                <div className="panel-header">
                    <div>
                        <p className="kicker">Results table</p>
                        <h2>{selectedElection ? selectedElection.title : 'No election selected'}</h2>
                    </div>
                </div>

                {!results ? (
                    <p className="muted">Select an election to see its tally.</p>
                ) : (
                    <div className="results-table">
                        <div className="results-head">
                            <span>Candidate</span>
                            <span className="center">Votes</span>
                        </div>
                        {results.results.length === 0 ? (
                            <p className="muted">No candidates have been added to this election.</p>
                        ) : (
                            results.results.map((candidate, index) => (
                                <div className="results-row" key={candidate.id}>
                                    <div className="results-name">
                                        <strong>{index + 1}. {candidate.full_name}</strong>
                                        {candidate.slogan && <small>{candidate.slogan}</small>}
                                    </div>
                                    <span className="vote-count">{candidate.vote_count}</span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function Stat({ icon, label, value }) {
    return (
        <div className="stat">
            <span>{icon}</span>
            <strong>{value}</strong>
            <small>{label}</small>
        </div>
    )
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>
)
