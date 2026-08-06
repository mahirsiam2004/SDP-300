# ShopFlare — SDP Project

Fashion e-commerce app. Django REST API backend + React Native (Expo) mobile frontend.

---

## How to Run the Project (This Laptop)

You need **2 CMD windows** open at the same time.

---

### Step 1 — Open CMD Window 1 (Backend)

Open Command Prompt and run these commands one by one:

```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Backend"
venv\Scripts\activate
python manage.py runserver 0.0.0.0:8000
```

You will see this — it means backend is running:
```
Starting development server at http://0.0.0.0:8000/
```

> Keep this window open. Do not close it.

---

### Step 2 — Open CMD Window 2 (Frontend)

Open a **second** Command Prompt and run:

```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Frontend"
npx expo start
```

A **QR code** will appear in the terminal after a few seconds.

> Keep this window open too.

---

### Step 3 — Open the App on Your Phone

1. Make sure your phone is on the **same WiFi** as this laptop
2. Open **Expo Go** on your Android phone
3. Tap **Scan QR Code** and scan the code from CMD Window 2

The app will open on your phone.

---

### Step 4 — Open the App in Browser (for demo)

Just open this in Chrome or any browser on the laptop:

```
http://localhost:8081
```

---

## Django Admin Panel

Open this in your browser:

```
http://localhost:8000/admin/
```

**Login credentials:**

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

---

## Your App Account (Mobile)

The account already created in the app:

| Field | Value |
|---|---|
| Username | `mahir` |
| Email | `mahirsiam2004@gmail.com` |
| Password | (the password you set when you registered) |

---

## How to Upload / Add Products to the App

There are **two ways** to add products:

---

### Option 1 — Through the App (as a Brand)

1. Open the app
2. Go to **Register** → choose **Brand account**
3. Fill in brand name, email, password → Register (no email verification needed locally)
4. Log in as the brand
5. Go to **My Products** or the **Dashboard**
6. Tap **Add Product** → fill in name, price, description, upload image → Save

The product will appear in the app immediately.

---

### Option 2 — Through Django Admin Panel (easier for demo)

1. Open `http://localhost:8000/admin/` in browser
2. Log in with `admin` / `admin123`
3. First create a **Brand**:
   - Click **Brands** → **Add Brand**
   - Fill in username, email, set a password hash (or use the app to register a brand)
4. Then create a **Product**:
   - Click **Products** → **Add Product**
   - Fill in: Name, Price, Category (Men/Women/Children), Brand, Stock, Description
   - Add an image URL in the Image field
   - Click **Save**

The product shows up in the app right away.

---

## API Base URL

All API calls go to:

```
http://192.168.0.108:8000/api/auth/
```

Health check (test if backend is running):

```
http://localhost:8000/api/auth/health/
```

---

## Project Structure (Quick Overview)

```
ShopFlare/
├── Backend/          ← Django API (Python)
│   ├── auth/         ← Settings, URLs
│   ├── users/        ← All models, views, API logic
│   ├── venv/         ← Python virtual environment
│   ├── .env          ← Local config (SQLite, DEBUG=True)
│   └── manage.py     ← Django management commands
│
└── Frontend/         ← React Native app (Expo)
    ├── app/          ← All screens
    ├── services/     ← API calls to backend
    └── package.json
```

---

## If Something is Not Working

**Backend not starting?**
```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Backend"
venv\Scripts\activate
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

**Frontend not starting?**
```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Frontend"
npm install
npx expo start
```

**App can't connect to backend on phone?**
- Make sure phone and laptop are on the same WiFi
- Check your laptop IP: open CMD → type `ipconfig` → look for IPv4 Address
- Update `Frontend/services/productService.ts` line:
  ```typescript
  export const API_BASE_URL = 'http://YOUR_IP:8000/api';
  ```
  Replace `YOUR_IP` with your current IPv4 address (currently `192.168.0.108`)

**Forgot admin password?**
```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Backend"
venv\Scripts\activate
python manage.py changepassword admin
```

---

## Tech Stack

| Part | Technology |
|---|---|
| Backend | Django 6.0 + Django REST Framework |
| Frontend | React Native + Expo SDK 54 |
| Database | SQLite (local) |
| Auth | JWT tokens |
| Language | Python (backend), TypeScript (frontend) |
