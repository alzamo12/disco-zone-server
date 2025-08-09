# Disco Zone Backend API

This is the backend API server for the Disco Zone application. It provides endpoints for managing posts, users, comments, announcements, tags, authentication via Firebase, and payment processing with Stripe.

---

## Features

- User authentication and role-based access control (admin/user)
- CRUD operations for posts, comments, users, tags, announcements
- Email verification via Firebase Admin SDK
- Voting system for posts (upvote/downvote)
- Pagination and search support for posts and users
- Payment intent creation with Stripe
- Admin-only routes for user management and statistics

---

## Technologies Used

- Node.js & Express.js
- MongoDB (via official Node.js driver)
- Firebase Admin SDK for authentication
- Stripe for payment processing
- Nodemailer for email services
- dotenv for environment variables management

---

## Getting Started

### Prerequisites

- Node.js (v16+ recommended)
- MongoDB Atlas account or local MongoDB instance
- Firebase project with service account credentials
- Stripe account and API keys

### Setup & Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/disco-zone-backend.git
   cd disco-zone-backend


2. **Installation**
  ```
 npm install
```

3. **Set up environment variables

Create a .env file in the root directory with the following variables:**
```
PORT=5000
DB_URI=your_mongodb_connection_string
FIREBASE_PROJECT_ID=your_firebase_project_id
STRIPE_SECRET_KEY=your_stripe_secret_key
NODEMAILER_AUTH_GMAIL_ID=your_gmail_email_address
NODEMAILER_AUTH_GMAIL_APP_PASS=your_gmail_app_password
ACCESS_TOKEN_SECRET=your_jwt_secret_key
```

4. ** Add Firebase service account key

Download your Firebase service account JSON file from the Firebase Console and save it as serviceAccount.json in the root directory.
**

5.**Install dependencies**
```
npm i
```

6. ** Run the Server**
 ```
npm run dev
```



