import { z } from 'zod'

// API Response wrapper type
export type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Common API Error class
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Validation schemas using Zod
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Please confirm your password'),
  displayName: z.string().max(12, 'Display name must be 12 characters or less').optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

export const createLeagueSchema = z.object({
  name: z.string().min(1, 'League name is required'),
  description: z.string().min(1, 'Description is required'),
  sportsLeague: z.string().min(1, 'Sports league is required'),
  season: z.string().min(1, 'Season is required'),
  isPublic: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
})

export const joinLeagueSchema = z.object({
  teamName: z.string().min(1, 'Team name is required'),
  message: z.string().optional(),
})

export const makePickSchema = z.object({
  gameId: z.number().int().positive('Invalid game ID'),
  teamId: z.number().int().positive('Invalid team ID'),
})

export const updateMemberSchema = z.object({
  isPaid: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  teamName: z.string().min(1, 'Team name cannot be empty').max(100, 'Team name must be 100 characters or less').optional(),
})

// Scoring calculation response schema
export const scoringResultSchema = z.object({
  picksUpdated: z.number().int().min(0),
  membershipsUpdated: z.number().int().min(0),
  executionTime: z.number().min(0),
  completedAt: z.string(),
})

// Invitation schemas
export const createInvitationSchema = z.object({
  maxUses: z.number().int().positive().nullable(),
  expiresAt: z.string().datetime().nullable(),
})

export const acceptInvitationSchema = z.object({
  teamName: z.string().min(1, 'Team name is required'),
})

// Request type inference
export type LoginRequest = z.infer<typeof loginSchema>
export type RegisterRequest = z.infer<typeof registerSchema>
export type CreateLeagueRequest = z.infer<typeof createLeagueSchema>
export type JoinLeagueRequest = z.infer<typeof joinLeagueSchema>
export type MakePickRequest = z.infer<typeof makePickSchema>
export type UpdateMemberRequest = z.infer<typeof updateMemberSchema>
export type ScoringResultResponse = z.infer<typeof scoringResultSchema>
export type CreateInvitationRequest = z.infer<typeof createInvitationSchema>
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationSchema>

// Helper function to create API responses
export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string,
  message?: string
): ApiResponse<T> {
  return { success, data, error, message }
}

// Helper function to handle API errors
export function handleApiError(error: unknown): Response {
  console.error('API Error:', error)
  
  if (error instanceof ApiError) {
    return Response.json(
      createApiResponse(false, undefined, error.message),
      { status: error.statusCode }
    )
  }
  
  if (error instanceof z.ZodError) {
    return Response.json(
      createApiResponse(false, undefined, 'Validation error: ' + error.errors.map(e => e.message).join(', ')),
      { status: 400 }
    )
  }
  
  return Response.json(
    createApiResponse(false, undefined, 'Internal server error'),
    { status: 500 }
  )
}