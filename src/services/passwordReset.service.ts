import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../prismaClient';
import { sendPasswordResetEmail } from './email.service';

// Configuration
const PASSWORD_RESET_CONFIG = {
  TOKEN_EXPIRY_HOURS: 1,        // Token valid for 1 hour
  TOKEN_LENGTH: 32,             // 32 bytes = 64 hex characters
  MAX_ACTIVE_TOKENS: 3,         // Max pending reset tokens per user
  CLEANUP_THRESHOLD_DAYS: 7,    // Delete used/expired tokens older than this
};

export interface RequestResetResult {
  success: boolean;
  message: string;
  token?: string;          // Only returned in dev mode for testing
  expiresAt?: Date;
  emailSent?: boolean;
}

export interface ResetPasswordResult {
  success: boolean;
  message: string;
}

/**
 * Password Reset Service
 * Handles forgot password and reset password flows
 */
class PasswordResetService {
  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(PASSWORD_RESET_CONFIG.TOKEN_LENGTH).toString('hex');
  }

  /**
   * Hash token for storage (we don't store plain tokens)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Request a password reset
   * Returns a token that should be sent to user via email
   */
  async requestPasswordReset(email: string): Promise<RequestResetResult> {
    try {
      // Find user by email
      const user = await prisma.users.findUnique({
        where: { email: email.toLowerCase().trim() }
      });

      // Always return success message to prevent email enumeration
      if (!user) {
        console.log(`Password reset requested for non-existent email: ${email}`);
        return {
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent.'
        };
      }

      // Check if user is active
      if (!user.is_active) {
        console.log(`Password reset requested for deactivated account: ${email}`);
        return {
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent.'
        };
      }

      // Invalidate any existing unused tokens for this user
      await prisma.password_resets.updateMany({
        where: {
          user_id: user.id,
          used: false,
          expires_at: { gt: new Date() }
        },
        data: { used: true }
      });

      // Generate new token
      const plainToken = this.generateToken();
      const hashedToken = this.hashToken(plainToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_CONFIG.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      // Store hashed token
      await prisma.password_resets.create({
        data: {
          user_id: user.id,
          token: hashedToken,
          expires_at: expiresAt,
          used: false,
        }
      });

      console.log(`Password reset token created for user: ${user.email}`);

      // Send password reset email
      const userName = user.first_name || user.email.split('@')[0];
      const emailResult = await sendPasswordResetEmail(user.email, userName, plainToken);
      
      if (!emailResult.success) {
        console.error(`Failed to send password reset email to ${user.email}:`, emailResult.error);
      } else {
        console.log(`Password reset email sent to ${user.email}`);
      }

      // Clean up old tokens in the background
      this.cleanupExpiredTokens().catch(err => 
        console.error('Token cleanup error:', err)
      );

      // In development, include token for testing
      const isDev = process.env.NODE_ENV !== 'production';

      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
        emailSent: emailResult.success,
        // Only include token in dev mode for testing without email
        ...(isDev && { token: plainToken, expiresAt }),
      };
    } catch (error: any) {
      console.error('Password reset request error:', error);
      return {
        success: false,
        message: 'Failed to process password reset request'
      };
    }
  }

  /**
   * Verify a password reset token
   */
  async verifyToken(token: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
    try {
      const hashedToken = this.hashToken(token);

      const resetRecord = await prisma.password_resets.findUnique({
        where: { token: hashedToken },
        include: { users: { select: { id: true, email: true, is_active: true } } }
      });

      if (!resetRecord) {
        return { valid: false, error: 'Invalid or expired reset token' };
      }

      if (resetRecord.used) {
        return { valid: false, error: 'This reset link has already been used' };
      }

      if (resetRecord.expires_at < new Date()) {
        return { valid: false, error: 'This reset link has expired' };
      }

      if (!resetRecord.users.is_active) {
        return { valid: false, error: 'Account is deactivated' };
      }

      return { valid: true, userId: resetRecord.user_id };
    } catch (error: any) {
      console.error('Token verification error:', error);
      return { valid: false, error: 'Failed to verify token' };
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
    try {
      // Verify token first
      const verification = await this.verifyToken(token);
      if (!verification.valid) {
        return { success: false, message: verification.error || 'Invalid token' };
      }

      const hashedToken = this.hashToken(token);

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password and mark token as used in a transaction
      await prisma.$transaction([
        // Update user password
        prisma.users.update({
          where: { id: verification.userId },
          data: {
            password_hash: hashedPassword,
            updated_at: new Date(),
          }
        }),
        // Mark token as used
        prisma.password_resets.update({
          where: { token: hashedToken },
          data: { used: true }
        }),
        // Invalidate all other tokens for this user
        prisma.password_resets.updateMany({
          where: {
            user_id: verification.userId,
            used: false,
          },
          data: { used: true }
        })
      ]);

      console.log(`Password reset successful for user: ${verification.userId}`);

      return {
        success: true,
        message: 'Password has been reset successfully. You can now login with your new password.'
      };
    } catch (error: any) {
      console.error('Password reset error:', error);
      return {
        success: false,
        message: 'Failed to reset password'
      };
    }
  }

  /**
   * Clean up expired and used tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const threshold = new Date(
      Date.now() - PASSWORD_RESET_CONFIG.CLEANUP_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
    );

    const result = await prisma.password_resets.deleteMany({
      where: {
        OR: [
          { expires_at: { lt: threshold } },
          { used: true, created_at: { lt: threshold } }
        ]
      }
    });

    if (result.count > 0) {
      console.log(`Cleaned up ${result.count} expired/used password reset tokens`);
    }

    return result.count;
  }

  /**
   * Get token expiry time for frontend display
   */
  getTokenExpiryMinutes(): number {
    return PASSWORD_RESET_CONFIG.TOKEN_EXPIRY_HOURS * 60;
  }
}

export const passwordResetService = new PasswordResetService();
