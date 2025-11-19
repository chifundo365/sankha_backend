# Authorization Middleware Testing Guide

## Test Credentials
- **Alice Banda** (USER): alice.banda@gmail.com / password123
- **John Phiri** (SELLER): john.phiri@techstore.mw / secure456
- **Peter Nyirenda** (ADMIN): peter.nyirenda@admin.com / admin321

## Test Routes Created
1. `GET /api/auth/me` - Protected route (any authenticated user)
2. `GET /api/auth/admin` - Admin-only route (ADMIN, SUPER_ADMIN)
3. `GET /api/auth/seller` - Seller route (SELLER, ADMIN, SUPER_ADMIN)

---

## Test 1: Login and Get Token

### Login as Alice (USER role)
```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice.banda@gmail.com","password":"password123"}'
```

### Login as John (SELLER role)
```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.phiri@techstore.mw","password":"secure456"}'
```

### Login as Peter (ADMIN role)
```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"peter.nyirenda@admin.com","password":"admin321"}'
```

**Expected Response:** 200 OK with JWT token in response body
**Copy the `token` value from the response for next tests**

---

## Test 2: Access Protected Route (GET /api/auth/me)

### Without Token (Should Fail)
```bash
curl -i -X GET http://localhost:3000/api/auth/me
```
**Expected:** 401 Unauthorized - "Not authorized, no token provided"

### With Valid Token
```bash
# Replace YOUR_JWT_TOKEN with actual token from login
curl -i -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
**Expected:** 200 OK with user profile data

---

## Test 3: Test Role-Based Authorization

### Access Admin Route with USER Role (Should Fail)
```bash
# Login as Alice (USER) first, then use her token
curl -i -X GET http://localhost:3000/api/auth/admin \
  -H "Authorization: Bearer ALICE_TOKEN"
```
**Expected:** 403 Forbidden - "Access denied. Required role(s): ADMIN, SUPER_ADMIN"

### Access Admin Route with ADMIN Role (Should Succeed)
```bash
# Login as Peter (ADMIN) first, then use his token
curl -i -X GET http://localhost:3000/api/auth/admin \
  -H "Authorization: Bearer PETER_TOKEN"
```
**Expected:** 200 OK - "Access granted"

### Access Seller Route with USER Role (Should Fail)
```bash
# Use Alice's token (USER role)
curl -i -X GET http://localhost:3000/api/auth/seller \
  -H "Authorization: Bearer ALICE_TOKEN"
```
**Expected:** 403 Forbidden - "Access denied. Required role(s): SELLER, ADMIN, SUPER_ADMIN"

### Access Seller Route with SELLER Role (Should Succeed)
```bash
# Use John's token (SELLER role)
curl -i -X GET http://localhost:3000/api/auth/seller \
  -H "Authorization: Bearer JOHN_TOKEN"
```
**Expected:** 200 OK - "Access granted"

### Access Seller Route with ADMIN Role (Should Succeed)
```bash
# Use Peter's token (ADMIN role)
curl -i -X GET http://localhost:3000/api/auth/seller \
  -H "Authorization: Bearer PETER_TOKEN"
```
**Expected:** 200 OK - "Access granted" (ADMIN has access to seller routes)

---

## Test 4: Invalid/Expired Token

### With Invalid Token
```bash
curl -i -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer invalid.token.here"
```
**Expected:** 401 Unauthorized - "Invalid token"

### With Malformed Authorization Header
```bash
curl -i -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: NotBearer token123"
```
**Expected:** 401 Unauthorized - "Not authorized, no token provided"

---

## Expected Flow
1. ✅ Login successful → Receive JWT token
2. ✅ Access `/api/auth/me` with token → Get user profile
3. ✅ Access role-restricted route with insufficient permissions → 403 Forbidden
4. ✅ Access role-restricted route with sufficient permissions → 200 OK
5. ✅ Access protected route without token → 401 Unauthorized
6. ✅ Access protected route with invalid token → 401 Unauthorized

---

## Middleware Files Created
- `src/middleware/auth.middleware.ts` - JWT verification (`protect`)
- `src/middleware/authorize.middleware.ts` - Role-based access control (`authorize`)
- `src/types/express.d.ts` - Extended Express Request type with user property
