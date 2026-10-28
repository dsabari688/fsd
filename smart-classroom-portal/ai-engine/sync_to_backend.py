"""
Smart Classroom Backend Synchronization Client
Handles API authentication and pushes Presence (Attendance) and Behavior data
directly into the Smart Classroom Portal MongoDB database via Express REST API.
"""

import requests
import json
from datetime import datetime

class BackendSyncClient:
    def __init__(self, base_url="http://localhost:5000/api", email="teacher@classroom.com", password="teacher123"):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.token = None
        self.headers = {"Content-Type": "application/json"}

    def is_backend_online(self):
        """Check if backend server is reachable."""
        try:
            r = requests.get(f"{self.base_url}/classrooms", timeout=3)
            return r.status_code in [200, 401]
        except Exception:
            return False

    def authenticate(self):
        """Authenticate with backend to obtain a JWT token."""
        login_url = f"{self.base_url}/auth/login"
        credentials = [
            {"email": self.email, "password": self.password},
            {"email": "teacher@classroom.com", "password": "teacher123"},
            {"email": "admin@classroom.com", "password": "admin123"},
        ]
        for cred in credentials:
            try:
                res = requests.post(login_url, json=cred, timeout=5)
                if res.status_code == 200:
                    data = res.json()
                    self.token = data.get("token")
                    self.headers["Authorization"] = f"Bearer {self.token}"
                    print(f"[BackendSync] Authenticated successfully as {cred['email']}")
                    return True
            except Exception as e:
                pass
        print(f"[BackendSync] Login failed for all default credentials")
        return False

    def get_classrooms(self):
        """Fetch all classrooms."""
        if not self.token:
            self.authenticate()
        try:
            res = requests.get(f"{self.base_url}/classrooms", headers=self.headers, timeout=5)
            if res.status_code == 200:
                return res.json()
            return []
        except Exception as e:
            print(f"[BackendSync] Error fetching classrooms: {e}")
            return []

    def get_students(self, classroom_id=None):
        """Fetch students list, optionally filtered by classroom."""
        if not self.token:
            self.authenticate()
        try:
            params = {}
            if classroom_id:
                params["classroom"] = classroom_id
            res = requests.get(f"{self.base_url}/students", params=params, headers=self.headers, timeout=5)
            if res.status_code == 200:
                return res.json()
            return []
        except Exception as e:
            print(f"[BackendSync] Error fetching students: {e}")
            return []

    def send_attendance(self, classroom_id, student_records):
        """
        Post attendance session to MongoDB.
        records: list of dicts: [{"student": "<student_mongo_id>", "status": "present"|"absent"}]
        """
        if not self.token:
            if not self.authenticate():
                print("[BackendSync] Unable to post attendance: Authentication failed.")
                return False

        payload = {
            "classroom": classroom_id,
            "date": datetime.utcnow().isoformat(),
            "records": student_records
        }
        try:
            res = requests.post(f"{self.base_url}/attendance/manual", json=payload, headers=self.headers, timeout=5)
            if res.status_code in [200, 201]:
                print(f"[BackendSync] Successfully recorded attendance for {len(student_records)} students.")
                return True
            else:
                print(f"[BackendSync] Failed to post attendance ({res.status_code}): {res.text}")
                return False
        except Exception as e:
            print(f"[BackendSync] Attendance post error: {e}")
            return False

    def send_behavior_log(self, classroom_id, behavior_events):
        """
        Post behavior snapshot to MongoDB.
        events: list of dicts: [{"student": "<student_mongo_id>", "behavior": "studying"|"sleeping"|"speaking"|...}]
        """
        if not self.token:
            if not self.authenticate():
                print("[BackendSync] Unable to post behavior: Authentication failed.")
                return False

        payload = {
            "classroom": classroom_id,
            "events": behavior_events
        }
        try:
            res = requests.post(f"{self.base_url}/behavior/manual", json=payload, headers=self.headers, timeout=5)
            if res.status_code in [200, 201]:
                print(f"[BackendSync] Successfully logged behavior events for {len(behavior_events)} students.")
                return True
            else:
                print(f"[BackendSync] Failed to post behavior log ({res.status_code}): {res.text}")
                return False
        except Exception as e:
            print(f"[BackendSync] Behavior post error: {e}")
            return False


if __name__ == "__main__":
    client = BackendSyncClient()
    print("Testing backend connectivity...")
    if client.is_backend_online():
        print("Backend server is online!")
    else:
        print("Backend server is currently offline or unreachable at http://localhost:5000")
