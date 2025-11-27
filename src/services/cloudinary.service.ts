import cloudinary from '../config/cloudinary.config';
import { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

interface UploadResult {
  success: boolean;
  url?: string;
  public_id?: string;
  error?: string;
}

export class CloudinaryService {
  /**
   * Upload a single image to Cloudinary
   * @param file - Buffer or base64 string of the image
   * @param folder - Folder path in Cloudinary (e.g., 'users/profiles', 'shops/logos')
   * @param publicId - Optional custom public_id
   * @returns Upload result with URL and public_id
   */
  static async uploadImage(
    file: Buffer | string,
    folder: string,
    publicId?: string
  ): Promise<UploadResult> {
    try {
      const uploadOptions: any = {
        folder,
        resource_type: 'image',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
        uploadOptions.overwrite = true;
      }

      // Convert buffer to base64 if needed
      const fileToUpload = Buffer.isBuffer(file) 
        ? `data:image/jpeg;base64,${file.toString('base64')}`
        : file;

      const result: UploadApiResponse = await cloudinary.uploader.upload(
        fileToUpload,
        uploadOptions
      );

      return {
        success: true,
        url: result.secure_url,
        public_id: result.public_id
      };
    } catch (error: any) {
      console.error('Cloudinary upload error:', error);
      return {
        success: false,
        error: error.message || 'Upload failed'
      };
    }
  }

  /**
   * Upload multiple images to Cloudinary
   * @param files - Array of file buffers
   * @param folder - Folder path in Cloudinary
   * @returns Array of upload results
   */
  static async uploadMultiple(
    files: Buffer[],
    folder: string
  ): Promise<UploadResult[]> {
    const uploadPromises = files.map(file => 
      this.uploadImage(file, folder)
    );
    
    return Promise.all(uploadPromises);
  }

  /**
   * Delete an image from Cloudinary
   * @param publicId - The public_id of the image to delete
   * @returns Deletion result
   */
  static async deleteImage(publicId: string): Promise<UploadResult> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok' || result.result === 'not found') {
        return { success: true };
      }
      
      return {
        success: false,
        error: 'Failed to delete image'
      };
    } catch (error: any) {
      console.error('Cloudinary delete error:', error);
      return {
        success: false,
        error: error.message || 'Delete failed'
      };
    }
  }

  /**
   * Delete multiple images from Cloudinary
   * @param publicIds - Array of public_ids to delete
   * @returns Array of deletion results
   */
  static async deleteMultiple(publicIds: string[]): Promise<UploadResult[]> {
    const deletePromises = publicIds.map(publicId => 
      this.deleteImage(publicId)
    );
    
    return Promise.all(deletePromises);
  }

  /**
   * Extract public_id from a Cloudinary URL
   * @param url - Cloudinary URL
   * @returns public_id or null
   */
  static extractPublicId(url: string): string | null {
    try {
      const regex = /\/v\d+\/(.+)\.\w+$/;
      const match = url.match(regex);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}
