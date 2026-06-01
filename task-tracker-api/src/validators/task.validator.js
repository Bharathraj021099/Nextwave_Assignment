const { z } = require('zod');

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED'];

const createTaskSchema = {
  body: z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(5000).optional(),
    priority: z.enum(PRIORITIES).default('MEDIUM'),
    assigneeId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    dueDate: z
      .string()
      .datetime({ offset: true })
      .refine((val) => new Date(val) > new Date(), {
        message: 'due_date must be a future date',
      })
      .optional(),
  }),
};

const updateTaskSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(5000).nullable().optional(),
      priority: z.enum(PRIORITIES).optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      dueDate: z
        .string()
        .datetime({ offset: true })
        .refine((val) => new Date(val) > new Date(), {
          message: 'due_date must be a future date',
        })
        .nullable()
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),
};

const updateStatusSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(STATUSES),
  }),
};

const taskIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

const listTasksSchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
  }),
};

module.exports = {
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
  taskIdParamSchema,
  listTasksSchema,
};
