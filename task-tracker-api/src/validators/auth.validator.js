const { z } = require('zod');

const registerSchema = {
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .max(72)
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one digit'),
    orgName: z.string().min(2).max(100),
  }),
};

const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
};

const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(1),
  }),
};

const logoutSchema = {
  body: z.object({
    refreshToken: z.string().min(1),
  }),
};

module.exports = { registerSchema, loginSchema, refreshSchema, logoutSchema };
