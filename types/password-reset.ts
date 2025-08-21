export type PasswordResetToken = {
  id: string
  token: string
  userId: string
  createdBy: string
  leagueId: string
  expiresAt: string
  usedAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type PasswordResetTokenWithUser = PasswordResetToken & {
  user: {
    id: string
    username: string
    email: string
  }
  creator: {
    id: string
    username: string
  }
  league: {
    id: string
    name: string
  }
}

export type CreatePasswordResetRequest = {
  userId: string
  leagueId: string
}

export type PasswordResetValidationInfo = {
  token: {
    id: string
    token: string
    isValid: boolean
    isExpired: boolean
    isUsed: boolean
  }
  user: {
    id: string
    username: string
    email: string
  }
  league: {
    id: string
    name: string
  }
}

export type CompletePasswordResetRequest = {
  newPassword: string
  confirmPassword: string
}