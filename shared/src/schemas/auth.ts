import { z } from 'zod';

/**
 * 密码规则：至少 8 位，须同时包含字母与数字
 * 上限 72：bcrypt 只取输入的前 72 字节，显式限制避免超长部分被静默截断
 */
export const PasswordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(72, '密码最长 72 位')
  .regex(/[A-Za-z]/, '密码必须包含字母')
  .regex(/\d/, '密码必须包含数字');

export const RegisterSchema = z
  .object({
    email: z.string().min(1, '邮箱不能为空').email('邮箱格式不正确').max(255),
    password: PasswordSchema,
    confirmPassword: z.string().optional(),
  })
  .refine((data) => data.confirmPassword === undefined || data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

export const LoginSchema = z.object({
  email: z.string().min(1, '邮箱不能为空').email('邮箱格式不正确'),
  password: z.string().min(1, '密码不能为空'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
