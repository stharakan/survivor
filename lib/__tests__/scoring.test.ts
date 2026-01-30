import { ObjectId } from 'mongodb'

// Mock the mongodb module before importing scoring
jest.mock('../mongodb', () => ({
  getDatabase: jest.fn(),
  Collections: {
    USERS: 'users',
    LEAGUES: 'leagues',
    LEAGUE_MEMBERSHIPS: 'league_memberships',
    TEAMS: 'teams',
    GAMES: 'games',
    PICKS: 'picks',
    JOIN_REQUESTS: 'join_requests',
    LEAGUE_INVITATIONS: 'league_invitations',
    PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  },
}))

import { updatePickResults, calculateScoresAndStrikes, runScoringCalculation } from '../scoring'
import { getDatabase } from '../mongodb'

// Helper to create mock ObjectIds
const createObjectId = () => new ObjectId()

// Mock collection with chainable methods
function createMockCollection() {
  const mockCollection = {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  }

  // Make find chainable with toArray
  mockCollection.find.mockReturnValue({
    toArray: jest.fn().mockResolvedValue([]),
  })

  return mockCollection
}

describe('Scoring Module', () => {
  let mockDb: {
    collection: jest.Mock
  }
  let mockCollections: Record<string, ReturnType<typeof createMockCollection>>

  beforeEach(() => {
    jest.clearAllMocks()

    // Suppress console.log during tests
    jest.spyOn(console, 'log').mockImplementation(() => {})

    // Create mock collections
    mockCollections = {
      picks: createMockCollection(),
      games: createMockCollection(),
      leagues: createMockCollection(),
      league_memberships: createMockCollection(),
    }

    // Mock database
    mockDb = {
      collection: jest.fn((name: string) => {
        return mockCollections[name] || createMockCollection()
      }),
    }

    ;(getDatabase as jest.Mock).mockResolvedValue(mockDb)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('updatePickResults', () => {
    it('should return 0 when there are no picks with null results', async () => {
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      })

      const result = await updatePickResults()

      expect(result).toBe(0)
      expect(mockCollections.picks.find).toHaveBeenCalledWith({ result: null })
    })

    it('should update pick to "win" when picked home team wins', async () => {
      const pickId = createObjectId()
      const mockPick = {
        _id: pickId,
        gameId: 1,
        teamId: 100, // Home team
        result: null,
      }
      const mockGame = {
        id: 1,
        homeTeamId: 100,
        awayTeamId: 200,
        homeScore: 3,
        awayScore: 1,
        status: 'completed',
        week: 1,
      }

      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([mockPick]),
      })
      mockCollections.games.findOne.mockResolvedValue(mockGame)
      mockCollections.picks.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await updatePickResults()

      expect(result).toBe(1)
      expect(mockCollections.picks.updateOne).toHaveBeenCalledWith(
        { _id: pickId },
        { $set: { result: 'win' } }
      )
    })

    it('should update pick to "win" when picked away team wins', async () => {
      const pickId = createObjectId()
      const mockPick = {
        _id: pickId,
        gameId: 1,
        teamId: 200, // Away team
        result: null,
      }
      const mockGame = {
        id: 1,
        homeTeamId: 100,
        awayTeamId: 200,
        homeScore: 1,
        awayScore: 3,
        status: 'completed',
        week: 1,
      }

      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([mockPick]),
      })
      mockCollections.games.findOne.mockResolvedValue(mockGame)
      mockCollections.picks.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await updatePickResults()

      expect(result).toBe(1)
      expect(mockCollections.picks.updateOne).toHaveBeenCalledWith(
        { _id: pickId },
        { $set: { result: 'win' } }
      )
    })

    it('should update pick to "loss" when picked home team loses', async () => {
      const pickId = createObjectId()
      const mockPick = {
        _id: pickId,
        gameId: 1,
        teamId: 100, // Home team
        result: null,
      }
      const mockGame = {
        id: 1,
        homeTeamId: 100,
        awayTeamId: 200,
        homeScore: 1,
        awayScore: 3,
        status: 'completed',
        week: 1,
      }

      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([mockPick]),
      })
      mockCollections.games.findOne.mockResolvedValue(mockGame)
      mockCollections.picks.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await updatePickResults()

      expect(result).toBe(1)
      expect(mockCollections.picks.updateOne).toHaveBeenCalledWith(
        { _id: pickId },
        { $set: { result: 'loss' } }
      )
    })

    it('should update pick to "loss" when picked away team loses', async () => {
      const pickId = createObjectId()
      const mockPick = {
        _id: pickId,
        gameId: 1,
        teamId: 200, // Away team
        result: null,
      }
      const mockGame = {
        id: 1,
        homeTeamId: 100,
        awayTeamId: 200,
        homeScore: 3,
        awayScore: 1,
        status: 'completed',
        week: 1,
      }

      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([mockPick]),
      })
      mockCollections.games.findOne.mockResolvedValue(mockGame)
      mockCollections.picks.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await updatePickResults()

      expect(result).toBe(1)
      expect(mockCollections.picks.updateOne).toHaveBeenCalledWith(
        { _id: pickId },
        { $set: { result: 'loss' } }
      )
    })

    it('should update pick to "draw" when game is tied', async () => {
      const pickId = createObjectId()
      const mockPick = {
        _id: pickId,
        gameId: 1,
        teamId: 100,
        result: null,
      }
      const mockGame = {
        id: 1,
        homeTeamId: 100,
        awayTeamId: 200,
        homeScore: 2,
        awayScore: 2,
        status: 'completed',
        week: 1,
      }

      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([mockPick]),
      })
      mockCollections.games.findOne.mockResolvedValue(mockGame)
      mockCollections.picks.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await updatePickResults()

      expect(result).toBe(1)
      expect(mockCollections.picks.updateOne).toHaveBeenCalledWith(
        { _id: pickId },
        { $set: { result: 'draw' } }
      )
    })

    it('should not update pick when game is not completed', async () => {
      const pickId = createObjectId()
      const mockPick = {
        _id: pickId,
        gameId: 1,
        teamId: 100,
        result: null,
      }
      const mockGame = {
        id: 1,
        homeTeamId: 100,
        awayTeamId: 200,
        homeScore: null,
        awayScore: null,
        status: 'scheduled',
        week: 1,
      }

      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([mockPick]),
      })
      mockCollections.games.findOne.mockResolvedValue(mockGame)

      const result = await updatePickResults()

      expect(result).toBe(0)
      expect(mockCollections.picks.updateOne).not.toHaveBeenCalled()
    })

    it('should skip pick when game is not found', async () => {
      const pickId = createObjectId()
      const mockPick = {
        _id: pickId,
        gameId: 999,
        teamId: 100,
        result: null,
      }

      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([mockPick]),
      })
      mockCollections.games.findOne.mockResolvedValue(null)

      const result = await updatePickResults()

      expect(result).toBe(0)
      expect(mockCollections.picks.updateOne).not.toHaveBeenCalled()
    })

    it('should process multiple picks correctly', async () => {
      const picks = [
        { _id: createObjectId(), gameId: 1, teamId: 100, result: null },
        { _id: createObjectId(), gameId: 2, teamId: 200, result: null },
        { _id: createObjectId(), gameId: 3, teamId: 300, result: null },
      ]

      const games = [
        { id: 1, homeTeamId: 100, awayTeamId: 101, homeScore: 3, awayScore: 1, status: 'completed', week: 1 },
        { id: 2, homeTeamId: 201, awayTeamId: 200, homeScore: 0, awayScore: 2, status: 'completed', week: 1 },
        { id: 3, homeTeamId: 300, awayTeamId: 301, homeScore: 1, awayScore: 1, status: 'completed', week: 1 },
      ]

      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(picks),
      })
      mockCollections.games.findOne
        .mockResolvedValueOnce(games[0])
        .mockResolvedValueOnce(games[1])
        .mockResolvedValueOnce(games[2])
      mockCollections.picks.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await updatePickResults()

      expect(result).toBe(3)
      expect(mockCollections.picks.updateOne).toHaveBeenCalledTimes(3)
    })
  })

  describe('calculateScoresAndStrikes', () => {
    it('should return 0 when there are no active memberships', async () => {
      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(0)
    })

    it('should calculate 3 points for a win', async () => {
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }

      const league = {
        _id: leagueId,
        last_completed_week: 1,
      }

      const picks = [
        { userId, leagueId, week: 1, result: 'win' },
      ]

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(picks),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(1)
      expect(mockCollections.league_memberships.updateOne).toHaveBeenCalledWith(
        { _id: membershipId },
        { $set: { points: 3, strikes: 0 } }
      )
    })

    it('should calculate 1 point for a draw', async () => {
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }

      const league = {
        _id: leagueId,
        last_completed_week: 1,
      }

      const picks = [
        { userId, leagueId, week: 1, result: 'draw' },
      ]

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(picks),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(1)
      expect(mockCollections.league_memberships.updateOne).toHaveBeenCalledWith(
        { _id: membershipId },
        { $set: { points: 1, strikes: 0 } }
      )
    })

    it('should calculate 1 strike for a loss', async () => {
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }

      const league = {
        _id: leagueId,
        last_completed_week: 1,
      }

      const picks = [
        { userId, leagueId, week: 1, result: 'loss' },
      ]

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(picks),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(1)
      expect(mockCollections.league_memberships.updateOne).toHaveBeenCalledWith(
        { _id: membershipId },
        { $set: { points: 0, strikes: 1 } }
      )
    })

    it('should calculate strikes for missed weeks', async () => {
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }

      const league = {
        _id: leagueId,
        last_completed_week: 3, // 3 weeks completed
      }

      const picks = [
        { userId, leagueId, week: 1, result: 'win' }, // Only picked week 1
      ]

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(picks),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(1)
      // 3 points for 1 win, 2 strikes for 2 missed weeks (weeks 2 and 3)
      expect(mockCollections.league_memberships.updateOne).toHaveBeenCalledWith(
        { _id: membershipId },
        { $set: { points: 3, strikes: 2 } }
      )
    })

    it('should combine loss strikes and missed week strikes', async () => {
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }

      const league = {
        _id: leagueId,
        last_completed_week: 4, // 4 weeks completed
      }

      const picks = [
        { userId, leagueId, week: 1, result: 'win' },
        { userId, leagueId, week: 2, result: 'loss' },
        // Missed weeks 3 and 4
      ]

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(picks),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(1)
      // 3 points for 1 win, 3 strikes (1 loss + 2 missed weeks)
      expect(mockCollections.league_memberships.updateOne).toHaveBeenCalledWith(
        { _id: membershipId },
        { $set: { points: 3, strikes: 3 } }
      )
    })

    it('should calculate cumulative points and strikes across multiple weeks', async () => {
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }

      const league = {
        _id: leagueId,
        last_completed_week: 5,
      }

      const picks = [
        { userId, leagueId, week: 1, result: 'win' },
        { userId, leagueId, week: 2, result: 'win' },
        { userId, leagueId, week: 3, result: 'draw' },
        { userId, leagueId, week: 4, result: 'loss' },
        { userId, leagueId, week: 5, result: 'win' },
      ]

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(picks),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(1)
      // 3 wins * 3 = 9, 1 draw * 1 = 1, total = 10 points
      // 1 loss strike, 0 missed weeks = 1 strike
      expect(mockCollections.league_memberships.updateOne).toHaveBeenCalledWith(
        { _id: membershipId },
        { $set: { points: 10, strikes: 1 } }
      )
    })

    it('should handle league with last_completed_week of 0', async () => {
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }

      const league = {
        _id: leagueId,
        last_completed_week: 0, // No weeks completed yet
      }

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(1)
      expect(mockCollections.league_memberships.updateOne).toHaveBeenCalledWith(
        { _id: membershipId },
        { $set: { points: 0, strikes: 0 } }
      )
    })

    it('should handle league without last_completed_week field', async () => {
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }

      const league = {
        _id: leagueId,
        // No last_completed_week field
      }

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await calculateScoresAndStrikes()

      expect(result).toBe(1)
      // Should default to 0 for last_completed_week
      expect(mockCollections.league_memberships.updateOne).toHaveBeenCalledWith(
        { _id: membershipId },
        { $set: { points: 0, strikes: 0 } }
      )
    })
  })

  describe('runScoringCalculation', () => {
    it('should run both updatePickResults and calculateScoresAndStrikes', async () => {
      // Setup for updatePickResults - no picks to update
      mockCollections.picks.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      })

      // Setup for calculateScoresAndStrikes - no memberships
      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      })

      const result = await runScoringCalculation()

      expect(result).toMatchObject({
        picksUpdated: 0,
        membershipsUpdated: 0,
      })
      expect(result.executionTime).toBeGreaterThanOrEqual(0)
      expect(result.completedAt).toBeDefined()
    })

    it('should return correct counts when updates are made', async () => {
      const pickId = createObjectId()
      const leagueId = createObjectId()
      const userId = createObjectId()
      const membershipId = createObjectId()

      // Setup for updatePickResults
      const mockPick = {
        _id: pickId,
        gameId: 1,
        teamId: 100,
        result: null,
      }
      const mockGame = {
        id: 1,
        homeTeamId: 100,
        awayTeamId: 200,
        homeScore: 2,
        awayScore: 1,
        status: 'completed',
        week: 1,
      }

      // Setup for calculateScoresAndStrikes
      const membership = {
        _id: membershipId,
        leagueId,
        userId,
        isActive: true,
        status: 'active',
        teamName: 'Test Team',
      }
      const league = {
        _id: leagueId,
        last_completed_week: 1,
      }
      const completedPicks = [
        { userId, leagueId, week: 1, result: 'win' },
      ]

      // First call to picks.find (for updatePickResults)
      // Second call to picks.find (for calculateScoresAndStrikes)
      let picksCallCount = 0
      mockCollections.picks.find.mockImplementation(() => ({
        toArray: jest.fn().mockImplementation(() => {
          picksCallCount++
          if (picksCallCount === 1) {
            return Promise.resolve([mockPick])
          }
          return Promise.resolve(completedPicks)
        }),
      }))

      mockCollections.games.findOne.mockResolvedValue(mockGame)
      mockCollections.picks.updateOne.mockResolvedValue({ modifiedCount: 1 })

      mockCollections.league_memberships.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([membership]),
      })
      mockCollections.leagues.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([league]),
      })
      mockCollections.league_memberships.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const result = await runScoringCalculation()

      expect(result.picksUpdated).toBe(1)
      expect(result.membershipsUpdated).toBe(1)
    })

    it('should throw error when updatePickResults fails', async () => {
      mockCollections.picks.find.mockImplementation(() => {
        throw new Error('Database connection failed')
      })

      await expect(runScoringCalculation()).rejects.toThrow('Database connection failed')
    })

    it('should throw error when calculateScoresAndStrikes fails', async () => {
      // First call succeeds (updatePickResults)
      mockCollections.picks.find.mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValue([]),
      })

      // Second call fails (calculateScoresAndStrikes)
      mockCollections.league_memberships.find.mockImplementation(() => {
        throw new Error('Failed to fetch memberships')
      })

      await expect(runScoringCalculation()).rejects.toThrow('Failed to fetch memberships')
    })
  })
})
