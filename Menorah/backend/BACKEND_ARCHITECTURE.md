# Backend Architecture Guide

## Current Structure

The backend follows an **Express.js route-based architecture** where business logic is written directly in route handlers.

### Directory Structure

```
backend/src/
├── config/          # Configuration files (database, etc.)
├── middleware/      # Custom middleware (auth, error handling)
├── models/          # Mongoose models (User, Booking, Counsellor, etc.)
├── routes/          # Route handlers (where you write functionality)
├── utils/           # Utility functions (email, SMS)
└── server.js        # Main server file
```

## Where to Write Functionality

### **Primary Location: `src/routes/` Directory**

All API functionality is written in the route files:

- **`routes/auth.js`** - Authentication (login, register, verify, etc.)
- **`routes/users.js`** - User management (profile, settings, etc.)
- **`routes/counsellors.js`** - Counsellor operations
- **`routes/bookings.js`** - Booking management
- **`routes/payments.js`** - Payment processing
- **`routes/chat.js`** - Chat functionality
- **`routes/video.js`** - Video call management

### Example: Adding a New Endpoint

```javascript
// In routes/users.js (or appropriate route file)

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    // Your business logic here
    const user = await User.findById(req.user._id).select('-password');
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});
```

## Route Structure Pattern

Each route file follows this pattern:

1. **Import dependencies** (express, models, middleware, utils)
2. **Create router** (`const router = express.Router()`)
3. **Define routes** with validation and middleware
4. **Export router** (`module.exports = router`)

## Adding New Functionality

### Step 1: Choose the Right Route File

- User-related → `routes/users.js`
- Auth-related → `routes/auth.js`
- Booking-related → `routes/bookings.js`
- etc.

### Step 2: Write the Route Handler

```javascript
router.post('/your-endpoint', [
  // Validation middleware
  body('field').notEmpty().withMessage('Field is required'),
], auth, // Authentication middleware (if needed)
async (req, res) => {
  try {
    // 1. Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // 2. Business logic
    const { field } = req.body;
    // ... your logic here ...

    // 3. Return response
    res.json({
      success: true,
      data: { /* your data */ }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});
```

### Step 3: Register the Route in `server.js`

Routes are already registered in `server.js`:

```javascript
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
// ... etc
```

## Optional: Controller-Based Architecture

If you want to separate business logic from routes, you can create a `controllers/` directory:

### 1. Create Controllers Directory

```
backend/src/
└── controllers/
    ├── authController.js
    ├── userController.js
    ├── bookingController.js
    └── ...
```

### 2. Move Logic to Controllers

**Before (in routes):**
```javascript
router.post('/login', async (req, res) => {
  // All logic here
});
```

**After (with controllers):**
```javascript
// controllers/authController.js
exports.login = async (req, res) => {
  // All logic here
};

// routes/auth.js
const authController = require('../controllers/authController');
router.post('/login', authController.login);
```

## Best Practices

1. **Use Express Validator** for input validation
2. **Use try-catch** for error handling
3. **Use middleware** for authentication (`auth` middleware)
4. **Return consistent responses:**
   ```javascript
   {
     success: true/false,
     message: '...',
     data: { ... }
   }
   ```
5. **Log important operations** for debugging
6. **Use models** for database operations
7. **Use utils** for reusable functions (email, SMS)

## Common Patterns

### Authentication Required
```javascript
router.get('/protected', auth, async (req, res) => {
  // req.user is available after auth middleware
});
```

### Validation Required
```javascript
router.post('/create', [
  body('name').notEmpty(),
  body('email').isEmail()
], async (req, res) => {
  const errors = validationResult(req);
  // ...
});
```

### Database Operations
```javascript
// Create
const newItem = new Model({ ... });
await newItem.save();

// Read
const items = await Model.find({ ... });

// Update
await Model.findByIdAndUpdate(id, { ... });

// Delete
await Model.findByIdAndDelete(id);
```

## Quick Reference

| File | Purpose | Example Endpoints |
|------|---------|-------------------|
| `routes/auth.js` | Authentication | `/api/auth/login`, `/api/auth/register` |
| `routes/users.js` | User management | `/api/users/profile`, `/api/users/settings` |
| `routes/counsellors.js` | Counsellor data | `/api/counsellors`, `/api/counsellors/:id` |
| `routes/bookings.js` | Booking management | `/api/bookings`, `/api/bookings/:id` |
| `routes/payments.js` | Payment processing | `/api/payments/create-checkout-session` |
| `routes/chat.js` | Chat functionality | `/api/chat/rooms`, `/api/chat/messages` |
| `routes/video.js` | Video calls | `/api/video/create-room` |

