# Smart Classroom & Attendance Analytics Portal

A MERN stack app (MongoDB, Express, React, Node) with an integrated Computer Vision AI Engine (YOLOv8 + FaceNet) for automated student presence (attendance) and real-time student behavior detection (studying, sleeping, speaking, phone use, raising hand).

## Structure

```
smart-classroom-portal/
├── ai-engine/    Computer Vision AI (YOLOv8 behavior + FaceNet presence)
├── backend/      Node.js + Express + MongoDB API
└── frontend/     React (Vite) app, plain CSS, no UI library
```

## Backend setup

```bash
cd backend
npm install
cp .env.example .env    # edit MONGO_URI / JWT_SECRET as needed
npm run dev              # requires nodemon (npm install -g nodemon), or: npm start
```

Runs on `http://localhost:5000`.

### API overview

| Method | Route                                   | Description                          |
|--------|------------------------------------------|---------------------------------------|
| POST   | /api/auth/register                        | Create a user (admin/teacher)         |
| POST   | /api/auth/login                           | Login, returns JWT                    |
| GET    | /api/auth/me                              | Current user (auth required)          |
| POST   | /api/classrooms                           | Create classroom                      |
| GET    | /api/classrooms                           | List classrooms                       |
| GET/PUT/DELETE | /api/classrooms/:id                | Get / update / delete classroom       |
| POST   | /api/students                             | Create student                        |
| GET    | /api/students?classroom=                  | List students                         |
| GET/PUT/DELETE | /api/students/:id                   | Get / update / delete student         |
| POST   | /api/attendance/manual                     | Save manual attendance for a session  |
| GET    | /api/attendance?classroom=&date=           | List attendance sessions              |
| GET    | /api/attendance/analytics/:classroomId     | Per-student attendance percentage     |
| POST   | /api/behavior/manual                       | Save manual behavior log for a session|
| GET    | /api/behavior?classroom=                   | List behavior logs                    |
| GET    | /api/behavior/summary/:classroomId         | Per-student behavior counts           |

All routes except `/auth/register` and `/auth/login` require
`Authorization: Bearer <token>`.

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` and talks to the backend at
`http://localhost:5000/api` (see `src/api/api.js`).

Pages: Login, Dashboard, Classrooms, Students, Attendance (manual
present/absent/late marking), Behavior (manual attentive/sleeping/
distracted/talking marking + a summary table).

## Next steps

- Add password reset / role management UI.
- Add attendance and behavior charts on the Dashboard.
- Add pagination/search for large student lists.
- Add date-range filters for attendance and behavior history.
