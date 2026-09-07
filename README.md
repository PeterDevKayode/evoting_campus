# CampusVote — Departmental E-Voting System

A simple Flask + SQLite web app for running campus department elections.
Built as a class assignment project — no external database server or
build tools required, just Python.

## 1. How to run it

```bash
# 1. Unzip the folder and move into it
cd evoting_system

# 2. (Recommended) create a virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py
```

Then open **http://127.0.0.1:5000** in your browser.

A SQLite database file (`evoting.db`) is created automatically the first
time you run the app, along with a default admin account:

| Username | Password |
|----------|----------|
| `admin`  | `admin123` |

Change this in a real deployment (open the database and update the row,
or add a "change password" route as an extension).

## 2. Using it

**As the admin:**
1. Log in at `/admin/login`.
2. Go to **Departments** and add each department holding an election
   (e.g. Computer Science, Accounting, Mass Communication).
3. Click **New election** and create one election per department.
4. Open that election's **Candidates** page and add everyone contesting.
5. Go to **Voters** and register each eligible voter with their Voter ID
   (matric number works well) and department. The system generates a
   random one-time password for you to hand to that voter.
6. Back on the dashboard, click **Open** on an election to make it live.
   You can have several elections **open at the same time** — one per
   department — since each is tracked independently.
7. Click **Results** at any time to see a live vote tally per candidate.
   Click **Close** once voting should end.

**As a voter:**
1. Go to `/voter/login` and sign in with the Voter ID and password given
   to you by the admin.
2. If your department's election is open, you'll see a ballot listing
   the candidates. Pick one and submit.
3. You'll get a confirmation once your ballot is recorded. Trying to vote
   again — even by reloading the page — is blocked.

## 3. How each requirement is handled

- **Concurrent elections** — every election is its own row in the
  `elections` table with its own `status` (`draft` / `active` / `closed`).
  Any number of departments can be `active` at once; nothing in the app
  assumes only one election runs at a time.

- **Anonymous voting** — a cast vote is stored in the `votes` table with
  only the `election_id` and `candidate_id`. It does **not** store who
  the voter was. There is no column, foreign key, or log anywhere that
  connects a specific ballot back to a specific voter.

- **Anti-impersonation** — there is no public sign-up. A person can only
  vote if the admin has already registered their Voter ID and department,
  and only if they type the exact one-time password the admin generated
  for them (stored as a salted hash, never in plain text).

- **No double voting** — a second table, `ballots_cast`, records *that*
  a Voter ID has already voted in a given election (with a `UNIQUE
  (voter_id, election_id)` constraint) — but it stores no candidate
  information, so it doesn't compromise anonymity. Once that row exists,
  the voter is shown a "you've already voted" screen instead of a ballot.

- **Department-by-department voting** — every election and every
  candidate belongs to exactly one department. A voter's department
  decides which single election they see and can vote in; they never
  see other departments' ballots.

- **Admin control** — only the admin can create departments, open or
  close elections, add candidates, register voters, and reset a voter's
  password. Voters cannot self-register.

## 4. Project structure

```
evoting_system/
├── app.py                  # All routes, database access and logic
├── requirements.txt
├── templates/
│   ├── base.html            # Shared layout, fonts, flash messages
│   ├── index.html           # Landing page
│   ├── voter_login.html
│   ├── vote.html            # The ballot itself
│   ├── thank_you.html       # Confirmation / already-voted screen
│   └── admin/
│       ├── login.html
│       ├── shell.html       # Sidebar layout shared by admin pages
│       ├── dashboard.html
│       ├── new_election.html
│       ├── departments.html
│       ├── candidates.html
│       ├── voters.html
│       └── results.html
└── static/
    └── css/style.css        # Full visual design
```

## 5. Notes for your write-up

- The database is a single SQLite file, so there's nothing extra to
  install or configure — good for a demo or a marker to run locally.
- Passwords (both the admin's and voters') are stored using Werkzeug's
  `generate_password_hash`, not in plain text.
- This is intentionally a teaching-scale build: for a production
  election system you'd add things like HTTPS, rate-limiting on login,
  audit logging, and a proper secret key loaded from the environment
  instead of hard-coded in `app.py`.

## 6. Deploying the React/Node version

The current version runs as a Node service. It builds the React client with
Vite and serves the generated `dist/` directory from Express.

### Render

1. Push this folder to a GitHub repository.
2. Create a Render Web Service from that repository, or use the included
  `render.yaml` blueprint.
3. Set these secret environment variables in Render:

  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`

4. Attach a persistent disk at `/var/data`. The SQLite database and session
  records are stored there through `DATA_DIR`.

The build command is `npm install && npm run build` and the start command is
`npm start`. Render provides HTTPS and the `PORT` value automatically.

Back up `campusvote.sqlite` from the persistent disk regularly. This remains
an educational deployment: a real election requires independent security
review, stronger identity controls, monitoring, and a formal recovery plan.
