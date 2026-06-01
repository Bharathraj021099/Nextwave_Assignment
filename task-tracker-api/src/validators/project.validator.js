const { z } = require('zod');

const createProjectSchema = {
  body: z.object({
    name: z.string().min(2).max(200),
    description: z.string().max(1000).optional(),
  }),
};

const updateProjectSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().min(2).max(200).optional(),
      description: z.string().max(1000).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),
};

const projectIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

module.exports = { createProjectSchema, updateProjectSchema, projectIdParamSchema };
