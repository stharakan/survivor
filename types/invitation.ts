export type LeagueInvitation = {
  id: string
  leagueId: string
  token: string
  createdBy: string
  maxUses: number | null
  currentUses: number
  expiresAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type InvitationWithLeague = LeagueInvitation & {
  league: {
    id: string
    name: string
    description: string
    sportsLeague: string
    memberCount: number
  }
  creator: {
    id: string
    username: string
  }
}

export type CreateInvitationRequest = {
  maxUses: number | null
  expiresAt: string | null
}

export type InvitationAcceptanceInfo = {
  invitation: {
    id: string
    token: string
    isValid: boolean
    isExpired: boolean
    isAtMaxUses: boolean
  }
  league: {
    id: string
    name: string
    description: string
    sportsLeague: string
    memberCount: number
  }
  creator: {
    username: string
  }
}