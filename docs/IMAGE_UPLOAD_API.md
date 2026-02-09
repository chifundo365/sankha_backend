# Image Upload API Documentation

This document describes the image upload endpoints implemented using Cloudinary integration.

## Configuration

Images are uploaded to Cloudinary with the following settings:
- **Max file size**: 5MB per file
- **Allowed formats**: JPG, PNG, JPEG, GIF, WEBP
- **Quality**: Auto-optimized
- **Format**: Auto-delivered in best format for the browser

## User Profile Image

### Upload Profile Image
```
POST /api/users/profile/image
```

**Authentication**: Required (JWT Bearer token)

**Request**:
- Content-Type: `multipart/form-data`
- Field name: `image` (single file)

**Response**:
```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "data": {
    "id": "user_id",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "profile_image": "https://res.cloudinary.com/.../user_abc123.jpg"
  }
}
```

**Notes**:
- Replaces existing profile image if present
- Old image is automatically deleted from Cloudinary
- Image is stored in `users/profiles` folder
- Uses custom public_id: `user_{userId}`

### Delete Profile Image
```
DELETE /api/users/profile/image
```

**Authentication**: Required (JWT Bearer token)

**Response**:
```json
{
  "success": true,
  "message": "Profile image deleted successfully",
  "data": null
}
```

---

## Shop Images

### Upload Shop Logo
```
POST /api/shops/:shopId/logo
```

**Authentication**: Required (SELLER, ADMIN, or SUPER_ADMIN)

**Request**:
- Content-Type: `multipart/form-data`
- Field name: `image` (single file)

**Response**:
```json
{
  "success": true,
  "message": "Shop logo uploaded successfully",
  "data": {
    "id": "shop_id",
    "name": "My Shop",
    "logo_url": "https://res.cloudinary.com/.../shop_logo_xyz.jpg"
  }
}
```

**Notes**:
- Shop owner or admin access required
- Replaces existing logo if present
- Stored in `shops/logos` folder
- Custom public_id: `shop_logo_{shopId}`

### Upload Shop Banner
```
POST /api/shops/:shopId/banner
```

**Authentication**: Required (SELLER, ADMIN, or SUPER_ADMIN)

**Request**:
- Content-Type: `multipart/form-data`
- Field name: `image` (single file)

**Response**:
```json
{
  "success": true,
  "message": "Shop banner uploaded successfully",
  "data": {
    "id": "shop_id",
    "name": "My Shop",
    "banner_url": "https://res.cloudinary.com/.../shop_banner_xyz.jpg"
  }
}
```

**Notes**:
- Shop owner or admin access required
- Replaces existing banner if present
- Stored in `shops/banners` folder
- Custom public_id: `shop_banner_{shopId}`

### Upload Shop Gallery Images
```
POST /api/shops/:shopId/gallery
```

**Authentication**: Required (SELLER, ADMIN, or SUPER_ADMIN)

**Request**:
- Content-Type: `multipart/form-data`
- Field name: `images` (multiple files, max 10)

**Response**:
```json
{
  "success": true,
  "message": "3 image(s) uploaded successfully",
  "data": {
    "id": "shop_id",
    "name": "My Shop",
    "gallery_urls": [
      "https://res.cloudinary.com/.../image1.jpg",
      "https://res.cloudinary.com/.../image2.jpg",
      "https://res.cloudinary.com/.../image3.jpg"
    ]
  }
}
```

**Notes**:
- Shop owner or admin access required
- Can upload up to 10 images at once
- Total gallery limit: 10 images
- New images are appended to existing gallery
- If limit exceeded, oldest images are kept
- Stored in `shops/gallery/{shopId}` folder

### Delete Shop Gallery Image
```
DELETE /api/shops/:shopId/gallery/:imageIndex
```

**Authentication**: Required (SELLER, ADMIN, or SUPER_ADMIN)

**Parameters**:
- `imageIndex`: Zero-based index of the image to delete (0, 1, 2, etc.)

**Response**:
```json
{
  "success": true,
  "message": "Gallery image deleted successfully",
  "data": {
    "id": "shop_id",
    "name": "My Shop",
    "gallery_urls": [
      "https://res.cloudinary.com/.../image1.jpg",
      "https://res.cloudinary.com/.../image2.jpg"
    ]
  }
}
```

**Notes**:
- Shop owner or admin access required
- Deletes image from both Cloudinary and database
- Index is zero-based (0 = first image, 1 = second, etc.)

---

## Product Images

### Upload Product Images
```
POST /api/products/:productId/images
```

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Request**:
- Content-Type: `multipart/form-data`
- Field name: `images` (multiple files, max 5)

**Response**:
```json
{
  "success": true,
  "message": "2 image(s) uploaded successfully",
  "data": {
    "id": "product_id",
    "name": "Product Name",
    "image_urls": [
      "https://res.cloudinary.com/.../image1.jpg",
      "https://res.cloudinary.com/.../image2.jpg"
    ]
  }
}
```

**Notes**:
- Admin access only
- Can upload up to 5 images at once
- Total product image limit: 5 images
- New images are appended to existing images
- Stored in `products/{productId}` folder

### Delete Product Image
```
DELETE /api/products/:productId/images/:imageIndex
```

**Authentication**: Required (ADMIN or SUPER_ADMIN)

**Parameters**:
- `imageIndex`: Zero-based index of the image to delete

**Response**:
```json
{
  "success": true,
  "message": "Product image deleted successfully",
  "data": {
    "id": "product_id",
    "name": "Product Name",
    "image_urls": [
      "https://res.cloudinary.com/.../image1.jpg"
    ]
  }
}
```

**Notes**:
- Admin access only
- Deletes image from both Cloudinary and database
- Index is zero-based

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "No image file provided",
  "data": null
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Unauthorized access to shop",
  "data": null
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Shop not found",
  "data": null
}
```

### 500 Server Error
```json
{
  "success": false,
  "message": "Failed to upload shop logo",
  "data": null
}
```

---

## Testing with cURL

### Upload User Profile Image
```bash
curl -X POST http://localhost:3000/api/users/profile/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/image.jpg"
```

### Upload Shop Logo
```bash
curl -X POST http://localhost:3000/api/shops/SHOP_ID/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/logo.jpg"
```

### Upload Shop Gallery (Multiple Images)
```bash
curl -X POST http://localhost:3000/api/shops/SHOP_ID/gallery \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg" \
  -F "images=@/path/to/image3.jpg"
```

### Delete Shop Gallery Image
```bash
curl -X DELETE http://localhost:3000/api/shops/SHOP_ID/gallery/0 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Upload Product Images
```bash
curl -X POST http://localhost:3000/api/products/PRODUCT_ID/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg"
```

---

## Folder Structure in Cloudinary

```
sankha/
├── users/
│   └── profiles/
│       ├── user_abc123.jpg
│       └── user_def456.jpg
├── shops/
│   ├── logos/
│   │   └── shop_logo_xyz789.jpg
│   ├── banners/
│   │   └── shop_banner_xyz789.jpg
│   └── gallery/
│       └── shop_xyz789/
│           ├── image1.jpg
│           ├── image2.jpg
│           └── image3.jpg
└── products/
    └── product_pqr321/
        ├── image1.jpg
        ├── image2.jpg
        └── image3.jpg
```

---

## Implementation Details

### Cloudinary Service
Location: `src/services/cloudinary.service.ts`

**Methods**:
- `uploadImage(file, folder, publicId?)` - Upload single image
- `uploadMultiple(files, folder)` - Upload multiple images
- `deleteImage(publicId)` - Delete single image
- `deleteMultiple(publicIds)` - Delete multiple images
- `extractPublicId(url)` - Extract public_id from Cloudinary URL

### Upload Middleware
Location: `src/middleware/upload.middleware.ts`

**Exports**:
- `uploadSingle` - Single file upload (field name: `image`)
- `uploadMultiple` - Multiple files upload (max 5, field name: `images`)
- `uploadGallery` - Gallery upload (max 10, field name: `images`)

### Configuration
Location: `src/config/cloudinary.config.ts`

**Environment Variables Required**:
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```
