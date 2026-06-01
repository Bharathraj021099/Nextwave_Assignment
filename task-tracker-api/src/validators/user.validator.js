const { z } = require('zod');

const ROLES = ['ADMIN', 'MANAGER', 'MEMBER'];

const inviteUserSchema = {
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .max(72)
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one digit'),
    role: z.enum(ROLES).default('MEMBER'),
  }),
};

const updateRoleSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    role: z.enum(ROLES),
  }),
};

const userIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

const listUsersSchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

module.exports = {
  inviteUserSchema,
  updateRoleSchema,
  userIdParamSchema,
  listUsersSchema,
};
