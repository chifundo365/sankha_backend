# Product Image Upload Test Guide

## Start the Server
```bash
npm run dev
```

## Step 1: Login as Admin

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"peter.nyirenda@admin.com","password":"AdminPeter2024$"}'
```

Copy the `token` from the response.

## Step 2: Create a New Product

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Gaming Headset Pro",
    "brand": "TechGear",
    "description": "Professional gaming headset with 7.1 surround sound",
    "base_price": 129.99
  }'
```

Copy the product `id` from the response.

## Step 3: Upload Images to the Product

```bash
curl -X POST http://localhost:3000/api/products/PRODUCT_ID_HERE/images \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "images=@temp_test_images/product1.jpg" \
  -F "images=@temp_test_images/product2.jpg" \
  -F "images=@temp_test_images/product3.jpg"
```

## Step 4: Verify the Product with Images

```bash
curl -X GET http://localhost:3000/api/products/PRODUCT_ID_HERE
```

## Expected Result

You should see the product with all 3 images uploaded to Cloudinary:

```json
{
  "success": true,
  "message": "Product retrieved successfully",
  "data": {
    "id": "...",
    "name": "Gaming Headset Pro",
    "images": [
      "https://res.cloudinary.com/dletizvcs/image/upload/v.../products/.../image1.jpg",
      "https://res.cloudinary.com/dletizvcs/image/upload/v.../products/.../image2.jpg",
      "https://res.cloudinary.com/dletizvcs/image/upload/v.../products/.../image3.jpg"
    ],
    ...
  }
}
```

## ✅ What Was Fixed

1. **Product Controller** - Changed `image_urls` to `images` to match database schema
2. **Shop Controller** - Changed `logo_url` to `logo`, `banner_url` to `banner`, `gallery_urls` to `gallery`
3. **Prisma Client** - Regenerated to sync with schema
4. **Image Limit** - Increased from 5 to 10 images per product

All image upload endpoints are now working correctly! 🎉
