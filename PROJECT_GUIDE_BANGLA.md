# ShopFlare — Teacher Presentation Guide (Bangla)

---

## ১. প্রজেক্ট চালু করার নিয়ম (আজকের জন্য)

দুটো CMD window খুলতে হবে।

### CMD Window 1 — Backend (Django)
```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Backend"
venv\Scripts\activate
python manage.py runserver 0.0.0.0:8000
```
এটা দেখালে বুঝবে চালু হয়েছে:
```
Starting development server at http://0.0.0.0:8000/
```

### CMD Window 2 — Frontend (Expo)
```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Frontend"
npx expo start
```
QR code দেখাবে — Expo Go দিয়ে scan করো।

### Browser এ দেখতে চাইলে:
```
http://localhost:8081
```

---

## ২. আমরা কোন Database ব্যবহার করেছি?

আমরা **SQLite** database ব্যবহার করেছি (local development এর জন্য)।

### Database file এর location:
```
d:\Ekla Cholo\SDP\ShopFlare\Backend\db.sqlite3
```
এই একটা file-ই পুরো database।

---

## ৩. Database দেখার ২টা উপায়

### উপায় ১ — Django Admin Panel (সবচেয়ে সহজ, এখনই কাজ করে)

Browser এ যাও:
```
http://localhost:8000/admin/
```

Login করো:
- **Username:** `admin`
- **Password:** `admin123`

এখানে সব data দেখতে পাবে — Products, Orders, Users, Brands, সব কিছু।
Teacher কে এইটা দেখাও — সুন্দর interface আছে।

---

### উপায় ২ — DB Browser for SQLite (free software)

1. Download করো: **https://sqlitebrowser.org/dl/**
2. Install করো
3. Open করো
4. "Open Database" button চাপো
5. এই file select করো:
   ```
   d:\Ekla Cholo\SDP\ShopFlare\Backend\db.sqlite3
   ```
6. সব table দেখতে পাবে — ঠিক phpMyAdmin এর মতো

---

## ৪. Backend এ কোথায় কী করা হয়েছে

### Folder: `Backend/`

| File/Folder | কী করে |
|---|---|
| `manage.py` | Django project চালু করার main file |
| `requirements.txt` | সব Python package এর list |
| `db.sqlite3` | পুরো database (এই একটা file) |
| `.env` | Secret keys এবং settings |
| `venv/` | Python virtual environment |

### Folder: `Backend/auth/`
Django project এর main configuration folder।

| File | কী করে |
|---|---|
| `settings.py` | Database, CORS, JWT, Email — সব settings এখানে |
| `urls.py` | কোন URL কোথায় যাবে সেটা define করা |
| `wsgi.py` | Production server এর জন্য |

### Folder: `Backend/users/`
পুরো project এর main app — সব logic এখানে।

| File | কী করে |
|---|---|
| `models.py` | Database tables — User, Brand, Product, Order, Cart, Wishlist, Message, Notification সব |
| `views.py` | সব API endpoint এর logic — login, register, product add, order করা সব |
| `urls.py` | API routes — `/api/auth/login/`, `/api/auth/products/` etc. |
| `serializers.py` | Database data কে JSON এ convert করা |
| `authentication.py` | JWT token দিয়ে login check করা (User এবং Brand দুটোর জন্য) |

---

## ৫. Frontend এ কোথায় কী করা হয়েছে

### Folder: `Frontend/`

| File/Folder | কী করে |
|---|---|
| `app/` | সব screen/page এখানে (Expo Router) |
| `services/` | Backend API call করার functions |
| `context/` | App এর state management (login info, cart, wishlist) |
| `constants/` | Colors, themes, category data |
| `components/` | Reusable UI pieces (Toast, Cards etc.) |

### Important Screens (`Frontend/app/`):

| Screen | কী করে |
|---|---|
| `(tabs)/index.tsx` | Home screen — product list, flash sale, search |
| `(tabs)/products.tsx` | Brand এর product management (add/edit/delete) |
| `(tabs)/cart.tsx` | Shopping cart |
| `(tabs)/orders.tsx` | Order history |
| `productDetail.tsx` | Product details page |
| `checkout.tsx` | Checkout page |
| `demandPredictor.tsx` | **AI Weekly Prediction** — কোন product কত বিক্রি হবে সেটা predict করে |
| `login/` | Login screen |
| `register/` | Registration screen |

---

## ৬. API Endpoints (Teacher কে দেখাও)

সব API এই base URL এ আছে: `http://localhost:8000/api/auth/`

| Endpoint | কী করে |
|---|---|
| `POST /login/` | Login |
| `POST /register/` | Customer registration |
| `POST /register/brand/` | Brand registration |
| `GET /products/` | সব product দেখা |
| `POST /products/create/` | নতুন product add করা |
| `POST /checkout/` | Order place করা |
| `GET /orders/` | Order history |
| `GET /brand/analytics/` | Brand এর sales analytics |
| `POST /weekly-prediction/` | **AI prediction** — weekly sales forecast |
| `GET /health/` | Server চলছে কিনা check |

### Live test করতে পারো browser এ:
```
http://localhost:8000/api/auth/health/
http://localhost:8000/api/auth/products/
```

---

## ৭. Tech Stack Summary (Teacher কে বলো)

| Part | Technology |
|---|---|
| **Backend** | Python + Django 6.0 + Django REST Framework |
| **Frontend** | React Native + Expo (TypeScript) |
| **Database** | SQLite (local) |
| **Authentication** | JWT Token (JSON Web Token) |
| **AI Feature** | Django-based weekly sales prediction |
| **Payment** | SSLCommerz (Bangladesh payment gateway) |
| **Deployment** | Render.com (production) |

---

## ৮. Weekly Prediction Feature (AI) — কীভাবে কাজ করে

Teacher যদি জিজ্ঞেস করে — এইভাবে বলো:

> "আমাদের Weekly Prediction feature টা Django backend এ implement করা।
> এটা প্রতিটা product এর past order history, wishlist count, এবং stock
> দেখে একটা prediction দেয় — আগামী সপ্তাহে কত unit বিক্রি হতে পারে।
> Brand dashboard থেকে এটা access করা যায়।"

Brand account দিয়ে login করলে **Demand Predictor** page এ যাও —
প্রতিটা product এর পাশে "Predict" button চাপলে prediction দেখাবে।

---

## ৯. Admin Credentials

| Field | Value |
|---|---|
| Admin URL | http://localhost:8000/admin/ |
| Username | `admin` |
| Password | `admin123` |

---

## ১০. Brand Account (Demo এর জন্য)

Brand: **Loto**
- Brand account দিয়ে login করলে product add করা যাবে
- Analytics দেখা যাবে  
- Weekly prediction দেখা যাবে
- Order manage করা যাবে

---

## সমস্যা হলে

**Backend চালু না হলে:**
```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Backend"
venv\Scripts\activate
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

**Frontend চালু না হলে:**
```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Frontend"
npm install
npx expo start
```

**Admin password ভুলে গেলে:**
```cmd
cd "d:\Ekla Cholo\SDP\ShopFlare\Backend"
venv\Scripts\activate
python manage.py changepassword admin
```
